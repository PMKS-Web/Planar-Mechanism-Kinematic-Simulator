import { Injectable, inject } from '@angular/core';
import { RealJoint } from '../model/joint';
import { JointOperation, OperationRefusal } from '../model/joint-operation-permission';
import {
  JointType,
  JointTypeChoice,
  jointTypeAt,
  jointTypeChoice,
  refuseJointType,
  stepsBetween,
} from '../model/joint-type';
import { ActiveObjService } from './active-obj.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';

/**
 * A joint's type, read off the drawing and changed as one edit.
 *
 * `model/joint-type.ts` says what a type is made of and whether a joint may
 * take one. This is the half that needs the services: the facts the model is
 * handed, and the edits a change of type runs through. The Edit panel, the
 * right-click menu and the group edit all come here, so a type the menu grays
 * is one the panel grays, for the same reason.
 */
@Injectable({ providedIn: 'root' })
export class JointTypeService {
  private mechanism = inject(MechanismService);
  private grid = inject(GridUtilsService);
  private active = inject(ActiveObjService);
  private notify = inject(NotificationService);

  /** The last choice worked out, so a template asking on every pass is handed the same one. */
  private held?: { key: string; choice: JointTypeChoice };

  typeOf(joint: RealJoint): JointType {
    return jointTypeAt(joint, this.grid.operationContext());
  }

  /** Whether the joint reads as grounded. A slider's ground is its guide's, not its pin's. */
  isGrounded(joint: RealJoint): boolean {
    return (this.mechanism.sliderFor(joint)?.ground ?? joint.ground) === true;
  }

  /** A block with no slot to ride and no ground to fix its direction. */
  hasNowhereToSlide(joint: RealJoint): boolean {
    return this.mechanism.sliderFor(joint)?.isDangling === true;
  }

  /** Why the joint cannot become `type`, in the refusal model's words. */
  refusal(joint: RealJoint, type: JointType): OperationRefusal | undefined {
    return refuseJointType(joint, type, this.grid.operationContext());
  }

  /**
   * What the Joint Type choice draws for this joint.
   *
   * A template asks on every change-detection pass, and the answer is four
   * refusals asked of the whole drawing. Every edit that could change it passes
   * through `updateMechanism`, which moves `cylinderRevision`, so within one
   * revision, for one joint, it is the same choice -- and handing the control
   * the same arrays keeps it from measuring its pill again on every pass.
   */
  choiceFor(joint: RealJoint): JointTypeChoice {
    const key = `${joint.id}@${this.mechanism.cylinderRevision}`;
    if (this.held?.key !== key) {
      const context = this.grid.operationContext();
      const choice = jointTypeChoice(
        jointTypeAt(joint, context),
        this.isGrounded(joint),
        (type) => refuseJointType(joint, type, context),
        this.hasNowhereToSlide(joint)
      );
      this.held = { key, choice };
    }
    return this.held.choice;
  }

  /**
   * Make the joint `type`, as one edit.
   *
   * A change of type is up to two of the edits a joint's two facts already
   * have -- a block on or off, a weld on or off -- and the reader pressed once,
   * so they are one entry in the history. Staged once against the pose on
   * screen when the machine is parked away from its start (the inner edits see
   * that staging and do not stage again), and saved once at the end. The batch
   * runs inside the staging, which is the order that reads: the staging is
   * about the pose, the batch about the history. (`capturingPose` hands the
   * hold back to whoever had it, so this also nests the other way round --
   * which is how the group edit runs one of these per joint.)
   *
   * The slider edit reads the selection, so the selection is pointed at the
   * joint for it (`run`) and put back afterward. Returns whether the joint is
   * `type` after the change.
   */
  set(joint: RealJoint, type: JointType): boolean {
    const from = this.typeOf(joint);
    if (from === type) return true;
    const refused = this.refusal(joint, type);
    if (refused) {
      this.notify.refusal(refused.code, refused.long);
      return false;
    }
    const grounded = this.isGrounded(joint);
    const selected = this.active.selectedJoint;
    try {
      this.mechanism.capturingPose(joint, () =>
        this.mechanism.batched(() => {
          for (const step of stepsBetween(from, type)) this.run(joint, step);
          // Grounded is its own switch beside the choice, and while it is on
          // the choice draws every type standing on the frame (D2) -- so a
          // change of type keeps it. Taking the block away takes the ground its
          // slot carried with it, and that is given back here.
          //
          // Except to a slot that came back riding a carrier: `toggleGround`
          // goes through `groundAt`, which clears `_carrier` and both slot
          // joints, so a pin that once carried a slider on a link, was
          // grounded, and is now made Pin-in-slot again would have the carrier
          // `sliderTopology` just restored from the stash taken off it without
          // a word. A floating slot is already fixed in direction by its
          // carrier, which is what the ground was standing in for.
          if (grounded && !this.isGrounded(joint) && !this.mechanism.sliderFor(joint)?.isFloating) {
            this.active.selectedJoint = joint;
            this.mechanism.toggleGround();
          }
        })
      );
    } finally {
      this.active.selectedJoint = selected;
    }
    return this.typeOf(joint) === type;
  }

  private run(joint: RealJoint, step: JointOperation): void {
    switch (step) {
      case 'add-slider':
      case 'remove-slider':
        // Pointed again before every slider edit rather than once: each edit
        // ends in `finishStructuralEdit`, which puts the selection back on the
        // part the reader selected, and a slider edit after it would land there.
        this.active.selectedJoint = joint;
        this.mechanism.toggleSlider();
        break;
      case 'weld':
        this.mechanism.weldJoint(joint);
        break;
      case 'unweld':
        this.mechanism.unWeldJoint(joint);
        break;
    }
  }
}
