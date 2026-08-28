import { Injectable, inject } from '@angular/core';
import { Coord } from '../model/coord';
import { RealJoint } from '../model/joint';
import { Link, RealLink } from '../model/link';
import { SelectedPartRef, resolveSelectedParts } from '../model/selection';
import { getNewOtherJointPos } from '../model/utils';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';

export interface MultiEditRefusal {
  code: string;
  short: string;
  message: string;
}

export type MultiEditResult = { ok: true } | { ok: false; refusal: MultiEditRefusal };

interface Placement {
  joint: RealJoint;
  at: Coord;
}

const OK: MultiEditResult = { ok: true };

@Injectable({ providedIn: 'root' })
export class MultiEditService {
  private mechanism = inject(MechanismService);
  private grid = inject(GridUtilsService);

  private refusal(code: string, short: string, message: string): MultiEditResult {
    return { ok: false, refusal: { code, short, message } };
  }

  private parts(refs: readonly SelectedPartRef[]) {
    return resolveSelectedParts(refs, this.mechanism.joints, this.mechanism.links);
  }

  private joints(refs: readonly SelectedPartRef[]): RealJoint[] | undefined {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) return undefined;
    if (!parts.every((part): part is RealJoint => part instanceof RealJoint)) return undefined;
    return parts;
  }

  private links(refs: readonly SelectedPartRef[]): RealLink[] | undefined {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) return undefined;
    if (!parts.every((part): part is RealLink => part instanceof RealLink)) return undefined;
    return parts;
  }

  private preflightPlacements(placements: readonly Placement[]): MultiEditResult {
    const frozen = this.mechanism.frozenJoints();
    const byJoint = new Map<string, Coord>();
    for (const placement of placements) {
      if (frozen.has(placement.joint.id)) {
        return this.refusal(
          'selection.locked',
          'unlock first',
          `${placement.joint.name} is held by a Lock. Unlock the selection before changing its geometry.`
        );
      }
      if (!Number.isFinite(placement.at.x) || !Number.isFinite(placement.at.y)) {
        return this.refusal(
          'selection.invalid-geometry',
          'not a finite position',
          'Every selected part needs a finite position.'
        );
      }
      const prior = byJoint.get(placement.joint.id);
      if (
        prior &&
        (Math.abs(prior.x - placement.at.x) > 1e-6 || Math.abs(prior.y - placement.at.y) > 1e-6)
      ) {
        return this.refusal(
          'selection.conflicting-geometry',
          'shared joint disagrees',
          `The selected links ask joint ${placement.joint.name} to land in two different places.`
        );
      }
      byJoint.set(placement.joint.id, placement.at);
    }
    return OK;
  }

  private applyPlacements(placements: readonly Placement[]): MultiEditResult {
    const preflight = this.preflightPlacements(placements);
    if (!preflight.ok) return preflight;
    const applied = new Set<string>();
    for (const placement of placements) {
      if (applied.has(placement.joint.id)) continue;
      applied.add(placement.joint.id);
      this.grid.dragJoint(placement.joint, placement.at, false);
    }
    this.mechanism.reseatFloatingSliders();
    this.mechanism.updateMechanism(false);
    this.mechanism.onMechUpdateState.next(2);
    this.mechanism.save();
    return OK;
  }

  assignJointCoordinate(
    refs: readonly SelectedPartRef[],
    axis: 'x' | 'y',
    value: number
  ): MultiEditResult {
    const joints = this.joints(refs);
    if (!joints) {
      return this.refusal(
        'selection.joints-only',
        'joints only',
        'X and Y can be assigned when every selected item is a joint.'
      );
    }
    return this.applyPlacements(
      joints.map((joint) => ({
        joint,
        at: new Coord(axis === 'x' ? value : joint.x, axis === 'y' ? value : joint.y),
      }))
    );
  }

  assignLinkGeometry(
    refs: readonly SelectedPartRef[],
    field: 'length' | 'angle',
    value: number
  ): MultiEditResult {
    const links = this.links(refs);
    if (!links) {
      return this.refusal(
        'selection.links-only',
        'links only',
        'Length and angle can be assigned when every selected item is a link.'
      );
    }
    if (!(field === 'angle' ? Number.isFinite(value) : Number.isFinite(value) && value > 0)) {
      return this.refusal(
        'selection.invalid-geometry',
        field === 'length' ? 'length must be positive' : 'not an angle',
        field === 'length' ? 'Link length must be greater than zero.' : 'Enter a finite angle.'
      );
    }
    if (
      links.some(
        (link) =>
          link.joints.length !== 2 || link.subset.length > 0 || this.mechanism.cylinderAt(link)
      )
    ) {
      return this.refusal(
        'selection.binary-links-only',
        'two-joint links only',
        'Shared length and angle are available only for ordinary two-joint links.'
      );
    }

    const placements: Placement[] = [];
    for (const link of links) {
      const first = link.joints[0] as RealJoint;
      const second = link.joints[1] as RealJoint;
      const angle = field === 'angle' ? value : link.angleRad;
      const length = field === 'length' ? value : link.length;
      if (second.ground) {
        placements.push({
          joint: first,
          at: getNewOtherJointPos(second, angle + Math.PI, length),
        });
      } else {
        placements.push({ joint: second, at: getNewOtherJointPos(first, angle, length) });
      }
    }
    return this.applyPlacements(placements);
  }

  assignLinkMass(refs: readonly SelectedPartRef[], value: number): MultiEditResult {
    const links = this.links(refs);
    if (!links) {
      return this.refusal(
        'selection.links-only',
        'links only',
        'Mass can be assigned when every selected item is a link.'
      );
    }
    if (!Number.isFinite(value) || value < 0) {
      return this.refusal('selection.invalid-mass', 'not a mass', 'Mass must be zero or greater.');
    }
    links.forEach((link) => this.mechanism.assignBodyMass(link, value));
    this.mechanism.updateMechanism(true);
    this.mechanism.onMechUpdateState.next(2);
    return OK;
  }

  setLocked(refs: readonly SelectedPartRef[], locked: boolean): MultiEditResult {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) {
      return this.refusal(
        'selection.stale',
        'selection changed',
        'One of the selected parts no longer exists.'
      );
    }
    this.mechanism.setLocks(parts as (RealJoint | Link)[], locked);
    return OK;
  }
}
