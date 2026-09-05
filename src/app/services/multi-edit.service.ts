import { Injectable, inject } from '@angular/core';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RealJoint } from '../model/joint';
import { Link, LinkHold, RealLink } from '../model/link';
import { holdableBar } from '../model/link-holds';
import { SelectedPartRef, resolveSelectedParts } from '../model/selection';
import { ActiveObjService } from './active-obj.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';

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
  private active = inject(ActiveObjService);
  private settings = inject(SettingsService);

  private refusal(code: string, short: string, message: string): MultiEditResult {
    return { ok: false, refusal: { code, short, message } };
  }

  private parts(refs: readonly SelectedPartRef[]) {
    return resolveSelectedParts(
      refs,
      this.mechanism.joints,
      this.mechanism.links,
      this.mechanism.forces
    );
  }

  private joints(refs: readonly SelectedPartRef[]): RealJoint[] | undefined {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) return undefined;
    if (!parts.every((part): part is RealJoint => part instanceof RealJoint)) return undefined;
    return parts;
  }

  private forces(refs: readonly SelectedPartRef[]): Force[] | undefined {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) return undefined;
    if (!parts.every((part): part is Force => part instanceof Force)) return undefined;
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
          'Every selected object needs a finite position.'
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

    if (!this.grid.setBarValues(links, field, value)) {
      return this.refusal(
        'selection.conflicting-geometry',
        'dimensions disagree',
        'The selected dimensions cannot all be satisfied with the current anchors and fixed values. No links were changed.'
      );
    }
    this.mechanism.reseatFloatingSliders();
    this.mechanism.updateMechanism(false);
    this.mechanism.onMechUpdateState.next(2);
    this.mechanism.save();
    return OK;
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

  /**
   * Turn the traced path on or off for every selected joint.
   *
   * Undoable and carried in the URL, the same as the one-joint switch: a path a
   * shared link dropped is a picture the reader thought they had sent.
   */
  setTracePath(refs: readonly SelectedPartRef[], traced: boolean): MultiEditResult {
    const joints = this.joints(refs);
    if (!joints) {
      return this.refusal(
        'selection.joints-only',
        'joints only',
        'A traced path can be switched when every selected item is a joint.'
      );
    }
    joints.forEach((joint) => {
      joint.showCurve = traced;
      // The path of a pin on a slider is drawn by its prismatic half.
      if (this.grid.containsSlider(joint)) {
        (this.grid.getSliderJoint(joint) as RealJoint).showCurve = traced;
      }
    });
    if (traced) this.settings.isShowTraces.next(true);
    this.mechanism.save();
    this.mechanism.onMechUpdateState.next(2);
    return OK;
  }

  /**
   * Ground or un-ground every selected joint, in one press and one undo.
   *
   * The rule is `toggleGround`'s, joint for joint -- a joint that carries a
   * block grounds its *slot* rather than its pin, and grounding a pin drops an
   * input it was carrying -- and the whole group is one structural edit, so it
   * comes back in one press of Undo rather than in eight.
   *
   * Assigned rather than toggled: eight joints in two states have no one
   * "other" state to flip to, and a toggle over a mixed group leaves it mixed
   * the other way round. The switch says what the group will be.
   */
  setGrounded(refs: readonly SelectedPartRef[], grounded: boolean): MultiEditResult {
    const joints = this.joints(refs);
    if (!joints) {
      return this.refusal(
        'selection.joints-only',
        'joints only',
        'Grounded can be switched when every selected item is a joint.'
      );
    }
    // Asked before anything is written: a group already in the state the
    // switch asks for is not an edit, and writing a history entry for it costs
    // the reader a press of Undo that puts nothing back.
    const wanted = joints.filter(
      (joint) => (this.mechanism.sliderFor(joint)?.ground ?? joint.ground === true) !== grounded
    );
    if (wanted.length === 0) return OK;
    this.mechanism.batched(() => {
      for (const joint of wanted) {
        const slider = this.mechanism.sliderFor(joint);
        if (slider) {
          if (grounded) slider.groundAt(slider.slotAngle);
          else slider.detach();
        } else {
          joint.ground = grounded;
          if (grounded) joint.input = false;
        }
      }
      this.mechanism.finishStructuralEdit(true);
    });
    return OK;
  }

  /**
   * Weld or unweld every selected joint.
   *
   * Preflighted whole: a weld that half the group refuses is not a half-done
   * weld, it is a group the reader has to unpick. `weldRefusal` is the same
   * model the one-joint menu grays its row from, so the sentence the group
   * gets is the sentence one joint would have got.
   *
   * Driven through the one-joint path with the selection pointed at each in
   * turn, because a weld is a restructure -- link ids, subsets, connected
   * joints -- and a second implementation of it would be a second set of bugs.
   */
  weldRefusal(refs: readonly SelectedPartRef[], welded: boolean): MultiEditRefusal | undefined {
    const joints = this.joints(refs);
    if (!joints) {
      return {
        code: 'selection.joints-only',
        short: 'joints only',
        message: 'Welded can be switched when every selected item is a joint.',
      };
    }
    if (!welded) return undefined;
    for (const joint of joints.filter((one) => one.isWelded !== welded)) {
      const refused = this.grid.weldRefusal(joint);
      if (refused) {
        return {
          code: 'selection.weld',
          short: refused.short,
          message: `${joint.name || joint.id} cannot be welded: ${refused.long}`,
        };
      }
    }
    return undefined;
  }

  setWelded(refs: readonly SelectedPartRef[], welded: boolean): MultiEditResult {
    const refused = this.weldRefusal(refs, welded);
    if (refused) return { ok: false, refusal: refused };
    const joints = this.joints(refs)!;
    const wanted = joints.filter((joint) => joint.isWelded !== welded);
    if (wanted.length === 0) return OK;
    return this.eachJoint(wanted, () => this.mechanism.toggleWeldedJoint());
  }

  /**
   * Give every selected joint a sliding block, or take it away.
   *
   * The refusal that matters is the cylinder's -- a ram is one sealed part and
   * its block is the ram -- and it is asked before anything moves, so a
   * selection holding one mount does not half-convert the rest.
   */
  sliderRefusal(refs: readonly SelectedPartRef[], slider: boolean): MultiEditRefusal | undefined {
    const joints = this.joints(refs);
    if (!joints) {
      return {
        code: 'selection.joints-only',
        short: 'joints only',
        message: 'Slider can be switched when every selected item is a joint.',
      };
    }
    for (const joint of joints.filter((one) => this.grid.isAttachedToSlider(one) !== slider)) {
      if (this.mechanism.cylinderAt(joint)) {
        return {
          code: 'cylinder.sealed-slider',
          short: 'part is sealed',
          message: `${joint.name || joint.id} belongs to a cylinder, which is one sealed part — delete the cylinder instead of editing its slider.`,
        };
      }
    }
    return undefined;
  }

  setSlider(refs: readonly SelectedPartRef[], slider: boolean): MultiEditResult {
    const refused = this.sliderRefusal(refs, slider);
    if (refused) return { ok: false, refusal: refused };
    const joints = this.joints(refs)!;
    const wanted = joints.filter((joint) => this.grid.isAttachedToSlider(joint) !== slider);
    if (wanted.length === 0) return OK;
    return this.eachJoint(wanted, () => this.mechanism.toggleSlider());
  }

  /**
   * Hold, or stop holding, one value on every selected bar.
   *
   * A bar holds its length or its angle, never both, so this assigns the one
   * the reader asked for -- which is what the single bar's padlocks do when
   * the other one is already down.
   */
  holdRefusal(refs: readonly SelectedPartRef[]): MultiEditRefusal | undefined {
    const links = this.links(refs);
    if (!links) {
      return {
        code: 'selection.links-only',
        short: 'links only',
        message: 'A held length or angle can be switched when every selected item is a link.',
      };
    }
    if (!links.every(holdableBar)) {
      return {
        code: 'selection.binary-links-only',
        short: 'two-joint links only',
        message: 'A length or an angle is held on ordinary two-joint links.',
      };
    }
    return undefined;
  }

  setHold(refs: readonly SelectedPartRef[], hold: LinkHold): MultiEditResult {
    const refused = this.holdRefusal(refs);
    if (refused) return { ok: false, refusal: refused };
    const links = this.links(refs)!;
    if (links.every((link) => link.hold === hold)) return OK;
    this.mechanism.batched(() => {
      links.forEach((link) => (link.hold = hold));
      this.mechanism.updateMechanism(true);
    });
    this.active.fakeUpdateSelectedObj();
    return OK;
  }

  /**
   * Run a one-joint operation over several joints as a single edit.
   *
   * The operations it drives read the selection rather than taking an
   * argument, so the selection is pointed at each joint and put back at the
   * end -- and the saves are held, so the group is one entry in the history.
   */
  private eachJoint(joints: readonly RealJoint[], work: () => void): MultiEditResult {
    const was = this.active.selectedJoint;
    const selection = this.active.snapshotPartSelection();
    this.mechanism.batched(() => {
      for (const joint of joints) {
        this.active.selectedJoint = joint;
        work();
      }
    });
    this.active.selectedJoint = was;
    this.active.restorePartSelection(
      selection,
      this.mechanism.joints,
      this.mechanism.links,
      this.mechanism.forces
    );
    return OK;
  }

  /**
   * One magnitude, one direction, or one frame for every selected force.
   *
   * The three a reader would want to give a set of forces at once, and the
   * three that mean exactly the same thing to eight of them as to one. Where
   * each force *is* is not here: that is decided by the body it is anchored
   * to, and a force does not have a position of its own to assign.
   *
   * The frame is the interesting one. Local means the force turns with the
   * link it is on and Global means it keeps pointing where it points, so the
   * two are a claim about what the force *is* rather than about how it looks
   * -- worth setting on a whole set at once, and worth stating rather than
   * toggling, because a set that disagrees has no state to flip to.
   */
  setForceValue(
    refs: readonly SelectedPartRef[],
    field: 'magnitude' | 'angle',
    value: number
  ): MultiEditResult {
    const forces = this.forces(refs);
    if (!forces) {
      return this.refusal(
        'selection.forces-only',
        'forces only',
        'Magnitude and angle can be assigned when every selected item is a force.'
      );
    }
    if (!Number.isFinite(value) || (field === 'magnitude' && value < 0)) {
      return this.refusal(
        'selection.invalid-force',
        field === 'magnitude' ? 'not a magnitude' : 'not an angle',
        field === 'magnitude'
          ? 'A force magnitude must be zero or greater.'
          : 'Enter a finite angle.'
      );
    }
    this.mechanism.batched(() => {
      forces.forEach((force) =>
        field === 'magnitude' ? force.setMagnitude(value) : force.setDirectionRadians(value)
      );
      this.mechanism.updateMechanism(true);
      this.mechanism.onMechUpdateState.next(2);
    });
    return OK;
  }

  setForceFrame(refs: readonly SelectedPartRef[], local: boolean): MultiEditResult {
    const forces = this.forces(refs);
    if (!forces) {
      return this.refusal(
        'selection.forces-only',
        'forces only',
        'A force base frame can be switched when every selected item is a force.'
      );
    }
    if (forces.every((force) => force.local === local)) return OK;
    this.mechanism.batched(() => {
      forces.forEach((force) => force.setLocal(local));
      this.mechanism.updateMechanism(true);
      this.mechanism.onMechUpdateState.next(2);
    });
    return OK;
  }

  setLocked(refs: readonly SelectedPartRef[], locked: boolean): MultiEditResult {
    const parts = this.parts(refs);
    if (parts.length === 0 || parts.length !== refs.length) {
      return this.refusal(
        'selection.stale',
        'selection changed',
        'A selected object no longer exists.'
      );
    }
    this.mechanism.setLocks(parts as (RealJoint | Link | Force)[], locked);
    return OK;
  }
}
