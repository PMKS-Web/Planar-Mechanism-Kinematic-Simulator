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
   * runs *inside* the staging: a staging holds saves and lets the hold go when
   * it settles, so a batch wrapped around one would find its hold already gone
   * and write a second entry.
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
    // By letter, not by object. Gaining or losing a slot exchanges the joint for
    // one of the other class -- a `PrisJoint` for a `RevJoint` -- keeping its
    // letter (`MechanismService.sliderTopology`), so every step after the first
    // has to find the joint that is in the drawing *now*. Held as an object, the
    // weld that finishes a change of type from Revolute to Prismatic landed on
    // the pin that had just been replaced and did nothing at all.
    const id = joint.id;
    try {
      this.mechanism.capturingPose(joint, () =>
        this.mechanism.batched(() => {
          for (const step of stepsBetween(from, type)) this.run(id, step);
          // Grounded is its own switch beside the choice, and while it is on
          // the choice draws every type standing on the frame (D2) -- so a
          // change of type keeps it. Taking the slot away takes the ground it
          // carried with it, and that is given back here.
          const now = this.live(id);
          if (now && grounded && !this.isGrounded(now)) {
            this.active.selectedJoint = now;
            this.mechanism.toggleGround();
          }
        })
      );
    } finally {
      // By letter here too, and for the same reason. The selection is normally
      // the joint being retyped -- the panel changes the type of whatever is
      // selected -- and gaining or losing a slot exchanges that joint for one
      // of the other class. Put back as an object it is the joint the drawing
      // has just dropped, and the panel reads the selection on every press: the
      // next one would ask a joint that is no longer there, be told it already
      // has the type wanted, and quietly do nothing.
      //
      // Written to the field rather than through `updateSelectedObj`, which
      // replaces the whole part selection: a group changing type one joint at a
      // time would be collapsed to the last one it touched.
      this.active.selectedJoint = (selected && this.live(selected.id)) ?? selected;
    }
    const after = this.live(id);
    return after !== undefined && this.typeOf(after) === type;
  }

  /** The joint with this letter as the drawing holds it now. */
  private live(id: string): RealJoint | undefined {
    const found = this.mechanism.joints.find((candidate) => candidate.id === id);
    return found instanceof RealJoint ? found : undefined;
  }

  private run(id: string, step: JointOperation): void {
    const joint = this.live(id);
    if (!joint) return;
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
