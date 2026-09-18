import { Injectable, inject } from '@angular/core';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RealJoint } from '../model/joint';
import { Link, LinkHold, RealLink } from '../model/link';
import { holdableBar } from '../model/link-holds';
import { SelectedPartRef, partRefKey, resolveSelectedParts } from '../model/selection';
import { JOINT_TYPE_LABEL, JointType, JointTypeChoice, jointTypeChoice } from '../model/joint-type';
import { ActiveObjService } from './active-obj.service';
import { GridUtilsService } from './grid-utils.service';
import { JointTypeService } from './joint-type.service';
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
  private jointTypes = inject(JointTypeService);

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
          link.joints.length !== 2 || link.subset.length > 0 || this.mechanism.cylinderOfBar(link)
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
    this.mechanism.editingAtStartPose(() => {
      links.forEach((link) => this.mechanism.assignBodyMass(link, value));
      this.mechanism.updateMechanism(true);
    });
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
   * Why the selected joints cannot all become `type`, in the words one joint
   * would be refused in.
   *
   * Preflighted whole, as the weld and the slider were: a change of type half
   * the group refuses is not a half-done change, it is a group the reader has
   * to unpick. Each joint is asked of `JointTypeService`, the same question the
   * one-joint panel and menu ask, so the sentence is the one a joint would get.
   */
  jointTypeRefusal(
    refs: readonly SelectedPartRef[],
    type: JointType
  ): MultiEditRefusal | undefined {
    const joints = this.joints(refs);
    if (!joints) {
      return {
        code: 'selection.joints-only',
        short: 'joints only',
        message: 'Joint Type can be chosen when every selected item is a joint.',
      };
    }
    for (const joint of joints.filter((one) => this.jointTypes.typeOf(one) !== type)) {
      const refused = this.jointTypes.refusal(joint, type);
      if (refused) {
        return {
          code: 'selection.joint-type',
          short: refused.short,
          message: `${joint.name || joint.id} cannot become ${JOINT_TYPE_LABEL[type]}: ${refused.long}`,
        };
      }
    }
    return undefined;
  }

  /** Make every selected joint `type`, as one edit. */
  setJointType(refs: readonly SelectedPartRef[], type: JointType): MultiEditResult {
    const refused = this.jointTypeRefusal(refs, type);
    if (refused) return { ok: false, refusal: refused };
    const wanted = this.joints(refs)!.filter((joint) => this.jointTypes.typeOf(joint) !== type);
    if (wanted.length === 0) return OK;
    return this.eachJoint(wanted, () => this.jointTypes.set(this.active.selectedJoint, type));
  }

  /** The last group choice worked out, held for the reason `JointTypeService.choiceFor` holds one. */
  private heldChoice?: { key: string; choice: JointTypeChoice };

  /**
   * What a group's Joint Type choice draws: the type the joints share, or none
   * when they disagree; the grounded glyphs only when every one is grounded;
   * and each type grayed with the group's own refusal.
   */
  jointTypeChoice(refs: readonly SelectedPartRef[]): JointTypeChoice | undefined {
    const joints = this.joints(refs);
    if (!joints) return undefined;
    const key = `${refs.map(partRefKey).join(' ')}@${this.mechanism.cylinderRevision}`;
    if (this.heldChoice?.key !== key) {
      const types = new Set(joints.map((joint) => this.jointTypes.typeOf(joint)));
      const choice = jointTypeChoice(
        types.size === 1 ? [...types][0] : undefined,
        joints.every((joint) => this.jointTypes.isGrounded(joint)),
        (type) => {
          const refused = this.jointTypeRefusal(refs, type);
          return refused ? { short: refused.short, long: refused.message } : undefined;
        }
      );
      this.heldChoice = { key, choice };
    }
    return this.heldChoice.choice;
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
    this.mechanism.editingAtStartPose(() => {
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
  /**
   * One entry for the whole group, whatever each part's edit does inside.
   *
   * Some of that work stages against the pose on screen (`JointTypeService.set`
   * opens a `capturingPose` per joint). That nests: `capturingPose` hands the
   * hold back to whoever had it rather than clearing it, so the batch below is
   * still the only thing that writes.
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
    const applied = this.mechanism.editForcesAtPose(forces, () => {
      forces.forEach((force) =>
        field === 'magnitude' ? force.setMagnitude(value) : force.setDirectionRadians(value)
      );
    });
    return applied ? OK : this.forcePoseRefusal();
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
    const applied = this.mechanism.editForcesAtPose(forces, () => {
      forces.forEach((force) => force.setLocal(local));
    });
    return applied ? OK : this.forcePoseRefusal();
  }

  private forcePoseRefusal(): MultiEditResult {
    return this.refusal(
      'selection.force-pose',
      'start pose unavailable',
      'The selected forces cannot be mapped to their start pose. Return to the start before changing them.'
    );
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
