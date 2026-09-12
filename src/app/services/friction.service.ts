import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../model/joint';
import { frictionPropertyError, hasFriction, JointFriction } from '../model/joint-friction';
import { guideFrictionRefusal } from '../model/friction-contacts';
import { MechanismService } from './mechanism.service';
import { EditPermissionService } from './edit-permission.service';
import { SettingsService } from './settings.service';
import { AnalysisSampleService } from './analysis-sample.service';
import { labelForBody } from '../model/body-label';

export const FRICTION_REWIND_MESSAGE =
  'Friction results are hidden while playback is set to rewind. Rewind traverses existing samples; it does not reverse the prescribed drive. Switch to forward playback to show friction.';

export interface FrictionReading {
  state: 'Off' | 'Sliding' | 'Relative Rotation' | 'Stationary' | 'Unavailable';
  values?: number[];
  message?: string;
  sign?: string;
  additionalEffort?: number;
  totalEffort?: number;
  frictionlessEffort?: number;
  inputJoint?: string;
  inputIsTorque?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FrictionService {
  private mechanism = inject(MechanismService);
  private permission = inject(EditPermissionService);
  private settings = inject(SettingsService);
  private samples = inject(AnalysisSampleService);

  set(joint: RealJoint, value: JointFriction): string | undefined {
    const error =
      this.permission.refusal('properties')?.long ??
      frictionPropertyError(value, !(joint instanceof PrisJoint)) ??
      (hasFriction(value) ? guideFrictionRefusal(joint) : undefined);
    if (error) return error;
    if (!this.mechanism.joints.includes(joint))
      return 'Select this joint again before editing friction.';
    if (JSON.stringify(joint.friction) === JSON.stringify(value)) return undefined;
    joint.friction = { ...value };
    this.mechanism.updateMechanism(true);
    return undefined;
  }

  reading(joint: RealJoint): FrictionReading {
    if (!hasFriction(joint.friction)) return { state: 'Off' };
    const machineIndex = this.mechanism.indexOfMechanismSolving(joint);
    const solved = this.mechanism.mechanisms[machineIndex];
    if (!solved?.isMechanismValid())
      return {
        state: 'Unavailable',
        message: 'Complete a driven mechanism to calculate friction.',
      };
    // A traversal flag is not a reversed drive solve. Keep this guard while paused too,
    // so pausing or scrubbing a rewind cannot briefly reveal misleading directional loads.
    // Ordinary backward scrubbing does not change directionOf and still reads its sample.
    if (this.mechanism.directionOf(machineIndex) < 0)
      return { state: 'Unavailable', message: FRICTION_REWIND_MESSAGE };
    const index = this.mechanism.currentSampleOf(machineIndex);
    const mode = this.settings.forceAnalysisMode.value;
    const frame = solved.getForceAnalysis(mode).frames[index];
    if (frame.status !== 'ok')
      return {
        state:
          frame.frictionUnavailable?.reason === 'stationary' &&
          frame.frictionUnavailable.jointId === joint.id
            ? 'Stationary'
            : 'Unavailable',
        message: frame.message,
      };
    const result = frame.friction?.get(joint.id);
    if (!result)
      return { state: 'Unavailable', message: 'No solved friction contact at this joint.' };
    const values = ['Friction Normal', 'Friction Effort', 'Friction Static Limit'].map(
      (property) => this.samples.sampleAt(solved, index, 'force', mode, property, joint.id)[0]
    );
    const body = solved.links[index].find((one) => one.id === result?.positiveBodyId);
    const bodyName = body ? labelForBody(body, undefined) : result.positiveBodyId;
    const sign =
      joint instanceof PrisJoint
        ? `Force on ${bodyName} is positive along the guide angle.`
        : `Torque on ${bodyName} is positive counterclockwise.`;
    const additionalEffort = frame.additionalFrictionEffort
      ? this.samples.sampleAt(
          solved,
          index,
          'force',
          mode,
          'Additional Input Effort',
          frame.additionalFrictionEffort.jointId
        )[0]
      : undefined;
    const totalEffort = frame.inputEffort
      ? this.samples.sampleAt(
          solved,
          index,
          'force',
          mode,
          'Input Effort',
          frame.inputEffort.jointId
        )[0]
      : undefined;
    return {
      state: joint instanceof PrisJoint ? 'Sliding' : 'Relative Rotation',
      values,
      sign,
      additionalEffort,
      totalEffort,
      frictionlessEffort:
        frame.inputEffort && additionalEffort !== undefined
          ? this.samples.sampleAt(
              solved,
              index,
              'force',
              mode,
              'Frictionless Input Effort',
              frame.inputEffort.jointId
            )[0]
          : undefined,
      inputJoint: frame.inputEffort?.jointId,
      inputIsTorque: frame.additionalFrictionEffort?.kind === 'torque',
    };
  }
}
