import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../model/joint';
import { SplitJointChoice, splitJoint, splitJointChoice } from '../model/split-joint';
import { ActiveObjService } from './active-obj.service';
import { EditPermissionService } from './edit-permission.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { GridUtilsService } from './grid-utils.service';
import { Coord } from '../model/coord';
import { SettingsService } from './settings.service';

/** Each unconstrained pin moves this far from the former shared center. */
const SPLIT_SEPARATION_FACTOR = 0.2;

@Injectable({ providedIn: 'root' })
export class SplitJointService {
  private mechanism = inject(MechanismService);
  private active = inject(ActiveObjService);
  private permission = inject(EditPermissionService);
  private notify = inject(NotificationService);
  private grid = inject(GridUtilsService);
  private settings = inject(SettingsService);

  choiceFor(joint: RealJoint): SplitJointChoice {
    const live = this.live(joint.id) ?? joint;
    return splitJointChoice(live, this.mechanism.links, this.mechanism.sealedStructures());
  }

  split(joint: RealJoint): boolean {
    const live = this.live(joint.id);
    const permission = this.permission.refusal('structure');
    if (permission) {
      this.notify.refusal(permission.short, permission.long);
      return false;
    }
    if (!live) return false;
    const choice = this.choiceFor(live);
    if (choice.refusal) {
      this.notify.refusal(choice.short!, choice.long!);
      return false;
    }
    let result: ReturnType<typeof splitJoint>;
    const wasSlider = live instanceof PrisJoint;
    const detachesSlider = wasSlider && live.isFloating;
    const slotAngle = detachesSlider ? live.slotAngle : undefined;
    const removesInput = !detachesSlider && live.input && (!live.ground || wasSlider);
    this.mechanism.capturingPose(live, () => {
      result = splitJoint(
        live,
        this.mechanism.joints as RealJoint[],
        this.mechanism.links,
        this.mechanism.forces,
        this.mechanism.sealedStructures()
      );
      if (result) {
        if (removesInput) result.original.input = false;
        this.active.selectedJoint = result.original;
        // Connectivity and cylinder roles must name the new pins before the
        // ordinary constrained drag path is asked to move them.
        this.mechanism.finishStructuralEdit(false);
        const pins = [result.original, ...result.created];
        const separation = SPLIT_SEPARATION_FACTOR * this.settings.objectScale;
        pins.forEach((pin, index) => {
          const angle =
            slotAngle === undefined
              ? (2 * Math.PI * index) / pins.length + Math.PI
              : slotAngle + Math.PI / 2;
          this.grid.dragJoint(
            pin,
            new Coord(live.x + separation * Math.cos(angle), live.y + separation * Math.sin(angle)),
            false
          );
        });
        this.mechanism.finishStructuralEdit(true);
      }
    });
    if (result && removesInput) {
      this.notify.news(
        'split-removed-input',
        wasSlider
          ? 'The slider input was removed because splitting replaces it with revolute pins.'
          : 'The input was removed because its two links are now separate.'
      );
    }
    return result !== undefined;
  }

  private live(id: string): RealJoint | undefined {
    const found = this.mechanism.joints.find((candidate) => candidate.id === id);
    return found instanceof RealJoint ? found : undefined;
  }
}
