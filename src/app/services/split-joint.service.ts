import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PrisJoint, RealJoint } from '../model/joint';
import {
  SplitJointChoice,
  SplitJointPlan,
  splitJoint,
  splitJointBodies,
  splitJointChoice,
  splitJointPlanRefusal,
} from '../model/split-joint';
import { splitJointPreview } from '../model/split-joint-preview';
import { nextFreeLetter } from '../model/joint-letters';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { editPanelHandle } from './edit-panel-handle';
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
  private tabs = inject(SelectedTabService);
  private requested = new BehaviorSubject<{ id: string; revision: number } | undefined>(undefined);

  /** Simple pins stay one click; larger connections need an explicit partition. */
  request(joint: RealJoint): void {
    const live = this.live(joint.id);
    if (!live) return;
    if (this.choiceFor(live).refusal || this.permission.refusal('structure')) {
      this.split(live);
      return;
    }
    if (!(live instanceof PrisJoint) && this.bodiesFor(live).length === 2) {
      this.split(live);
      return;
    }
    this.tabs.setTab(TabID.EDIT);
    this.active.updateSelectedObj(live);
    this.tabs.sheetExpanded.set(true);
    editPanelHandle()?.expandSection('JBasic');
    this.requested.next({ id: live.id, revision: this.mechanism.cylinderRevision });
  }

  requestedFor(joint: RealJoint): boolean {
    const request = this.requested.value;
    return request?.id === joint.id && request.revision === this.mechanism.cylinderRevision;
  }

  cancel(): void {
    this.requested.next(undefined);
  }

  bodiesFor(joint: RealJoint) {
    return splitJointBodies(this.live(joint.id) ?? joint, this.mechanism.links);
  }

  canDisconnectGuide(joint: RealJoint): boolean {
    const live = this.live(joint.id);
    return live instanceof PrisJoint && live.isFloating;
  }

  refusalFor(joint: RealJoint, plan: SplitJointPlan): string | undefined {
    const live = this.live(joint.id);
    if (!live) return 'This joint is no longer in the drawing.';
    return (
      this.permission.refusal('structure')?.long ??
      splitJointPlanRefusal(live, this.mechanism.links, this.mechanism.sealedStructures(), plan)
    );
  }

  previewFor(joint: RealJoint, plan: SplitJointPlan): string {
    return splitJointPreview(
      joint,
      this.bodiesFor(joint),
      plan,
      nextFreeLetter(new Set(this.mechanism.joints.map((one) => one.id)))
    );
  }

  choiceFor(joint: RealJoint): SplitJointChoice {
    const live = this.live(joint.id) ?? joint;
    return splitJointChoice(live, this.mechanism.links, this.mechanism.sealedStructures());
  }

  split(joint: RealJoint, plan?: SplitJointPlan): boolean {
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
    if (plan) {
      const refusal = this.refusalFor(live, plan);
      if (refusal) {
        this.notify.refusal('Choose a split', refusal);
        return false;
      }
    }
    let result: ReturnType<typeof splitJoint>;
    const wasSlider = live instanceof PrisJoint;
    const grouped = plan?.kind === 'detach';
    const detachesSlider = wasSlider && live.isFloating && !grouped;
    const wasPrismatic = wasSlider && !live.rotates;
    const slotAngle = detachesSlider ? live.slotAngle : undefined;
    const remaining = grouped ? this.bodiesFor(live).length - plan.links.length : 1;
    const removesInput = grouped
      ? !wasSlider && live.input && !live.ground && remaining < 2
      : !detachesSlider && live.input && (!live.ground || wasSlider);
    this.mechanism.capturingPose(live, () =>
      this.mechanism.batched(() => {
        // Release only this slider's weld, using the ordinary unweld path so
        // other welds, body metadata and force ownership survive the partition.
        if (wasPrismatic && !detachesSlider) this.mechanism.unWeldJoint(live);
        result = splitJoint(
          live,
          this.mechanism.joints as RealJoint[],
          this.mechanism.links,
          this.mechanism.forces,
          this.mechanism.sealedStructures(),
          plan
        );
        if (result) {
          if (removesInput) result.original.input = false;
          this.active.selectedJoint = result.original;
          // Connectivity and cylinder roles must name the new pins before the
          // ordinary constrained drag path is asked to move them.
          this.mechanism.finishStructuralEdit(false);
          if (grouped && wasPrismatic) this.mechanism.weldJoint(result.original);
          // A retained slider keeps its guide, speed, weld and authored position.
          const pins = grouped ? result.created : [result.original, ...result.created];
          // A cluster of three or more pins needs room for each hit target,
          // just as a detached group needs to clear its former slider block.
          const separation =
            (grouped || pins.length > 2 ? 0.6 : SPLIT_SEPARATION_FACTOR) *
            this.settings.objectScale;
          pins.forEach((pin, index) => {
            const angle =
              slotAngle === undefined
                ? grouped
                  ? this.groupDirection(pin)
                  : (2 * Math.PI * index) / pins.length + Math.PI
                : slotAngle + Math.PI / 2;
            this.grid.dragJoint(
              pin,
              new Coord(
                live.x + separation * Math.cos(angle),
                live.y + separation * Math.sin(angle)
              ),
              false
            );
          });
          this.mechanism.finishStructuralEdit(true);
          this.cancel();
        }
      })
    );
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

  /** Move the new pin toward its own links, clear of a retained slider block. */
  private groupDirection(pin: RealJoint): number {
    const points = pin.links.flatMap((link) => link.joints.filter((joint) => joint.id !== pin.id));
    const x = points.reduce((sum, joint) => sum + joint.x - pin.x, 0);
    const y = points.reduce((sum, joint) => sum + joint.y - pin.y, 0);
    return Math.hypot(x, y) > 0 ? Math.atan2(y, x) : Math.PI / 2;
  }
}
