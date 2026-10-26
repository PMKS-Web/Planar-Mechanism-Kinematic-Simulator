import { Injectable, inject } from '@angular/core';
import { cylinderAtSeal, cylinderSizeOf, Cylinder } from '../model/cylinder';
import {
  DriveKind,
  driveDirectionIcon,
  driveDirectionLabel,
  driveKindOf,
  speedTurning,
  turnsClockwise,
} from '../model/drive-direction';
import { PrisJoint, RealJoint } from '../model/joint';
import { AngularVelocityUnit } from '../model/unit-enums';
import { EditPermissionService } from './edit-permission.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';

/**
 * Input Settings unit choices for a turning drive, in the order the picker
 * shows them. The labels match how the unit parser prints these units.
 */
export const INPUT_SPEED_UNITS = [
  { unit: AngularVelocityUnit.RPM, label: 'RPM' },
  { unit: AngularVelocityUnit.DEG_PER_SEC, label: 'deg/s' },
  { unit: AngularVelocityUnit.RAD_PER_SEC, label: 'rad/s' },
];

/**
 * One driven joint's speed and direction, as every control that edits them
 * reads and writes them.
 *
 * The Edit panel's Input Settings and the Mechanism Overview both offer these
 * two controls, and they must not disagree about what a typed minus sign means,
 * when the direction is not a choice, or what a speed of zero is. So the rules
 * live here and each panel only draws them.
 */
@Injectable({ providedIn: 'root' })
export class DriveControlService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private permission = inject(EditPermissionService);
  private notify = inject(NotificationService);

  /** A pin turns; a block or a cylinder's rod travels. */
  isLinear(joint: RealJoint): boolean {
    return joint instanceof PrisJoint;
  }

  /** A pin, a cylinder or a bare slider: the three that have different words. */
  kind(joint: RealJoint): DriveKind {
    return driveKindOf(this.isLinear(joint), cylinderAtSeal(joint) !== undefined);
  }

  /** Which way this drive is set, read off the joint itself. */
  clockwise(joint: RealJoint): boolean {
    return turnsClockwise(this.mechanism.driveSpeedOf(joint));
  }

  directionLabel(joint: RealJoint): string {
    return driveDirectionLabel(this.kind(joint), this.clockwise(joint));
  }

  directionIcon(joint: RealJoint): string {
    return driveDirectionIcon(this.kind(joint), this.clockwise(joint));
  }

  /**
   * Whether the direction cannot be turned round just now.
   *
   * Turning a drive round re-samples the same geometry onto a different time
   * axis, so at a displaced pose it moves what is on screen; and a ram parked
   * at one stop has only one way to go. Both gray the control rather than leave
   * it to be pressed and silently undone.
   */
  directionLocked(joint: RealJoint): boolean {
    if (!this.permission.may('drive')) return true;
    const sealed = cylinderAtSeal(joint);
    return !!sealed && !!sealed.seal.input && this.travelEnd(sealed) !== undefined;
  }

  /**
   * A ram parked at one end of its travel: 0 fully closed, 1 fully open.
   *
   * The bound is *Starts at*'s resolution, one decimal of a percent, so
   * anything that reads 0.0% or 100.0% counts as parked.
   */
  travelEnd(sealed: Cylinder): 0 | 1 | undefined {
    const { start } = cylinderSizeOf(sealed, 0.15 * SettingsService.cylinderObjectScale);
    if (start < 5e-4) return 0;
    if (start > 1 - 5e-4) return 1;
    return undefined;
  }

  /** One control for both directions: flip rather than pick. One undo entry. */
  flip(joint: RealJoint): void {
    this.mechanism.setDriveSpeed(joint, -this.mechanism.driveSpeedOf(joint));
    this.mechanism.updateMechanism(true);
  }

  /** The unit a typed speed is read in: length per second, or the picker's choice. */
  speedUnitLabel(joint: RealJoint): string {
    if (this.isLinear(joint)) return `${this.nup.unitLabel(this.settings.lengthUnit.value)}/s`;
    const unit = this.settings.inputSpeedUnit.value;
    return INPUT_SPEED_UNITS.find((option) => option.unit === unit)?.label ?? 'RPM';
  }

  /** The speed's magnitude as a field shows it, in `speedUnitLabel`'s unit. */
  speedText(joint: RealJoint): string {
    const own = Math.abs(this.mechanism.driveSpeedOf(joint));
    const shown = this.isLinear(joint)
      ? own
      : this.nup.convertAngularVelocity(
          own,
          AngularVelocityUnit.RPM,
          this.settings.inputSpeedUnit.value
        );
    return Number(shown.toFixed(2)).toString();
  }

  /**
   * Take a typed speed, in `speedUnitLabel`'s unit. A field carries the
   * magnitude, so a minus sign reads as "the other way": -20 becomes 20 with
   * the direction flipped. Zero or text is refused with the reason and changes
   * nothing, so it mints no undo entry. Answers whether it was taken.
   */
  setSpeed(joint: RealJoint, typed: number): boolean {
    if (!Number.isFinite(typed) || typed === 0) {
      this.refuseSpeed();
      return false;
    }
    const magnitude = this.isLinear(joint)
      ? Math.abs(typed)
      : this.nup.convertAngularVelocity(
          Math.abs(typed),
          this.settings.inputSpeedUnit.value,
          AngularVelocityUnit.RPM
        );
    const clockwise = typed < 0 ? !this.clockwise(joint) : this.clockwise(joint);
    this.mechanism.setDriveSpeed(joint, speedTurning(clockwise, magnitude));
    this.mechanism.updateMechanism(true);
    return true;
  }

  /** What a refused speed says, wherever it was typed. */
  refuseSpeed(): void {
    this.notify.refusal(
      'input.speed',
      'Input Speed must be a nonzero number. Use Pause to stop the animation.'
    );
  }
}
