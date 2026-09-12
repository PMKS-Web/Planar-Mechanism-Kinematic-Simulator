import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../model/joint';
import { frictionPropertyError, hasFriction, JointFriction } from '../model/joint-friction';
import { guideFrictionRefusal } from '../model/friction-contacts';
import { MechanismService } from './mechanism.service';
import { EditPermissionService } from './edit-permission.service';
import { SettingsService } from './settings.service';
import { AnalysisSampleService } from './analysis-sample.service';

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

  reading(joint: RealJoint): { values?: number[]; message?: string; sign?: string } {
    const machineIndex = this.mechanism.indexOfMechanismSolving(joint);
    const solved = this.mechanism.mechanisms[machineIndex];
    if (!solved?.isMechanismValid())
      return { message: 'Complete a driven mechanism to calculate friction.' };
    const index = this.mechanism.currentSampleOf(machineIndex);
    const mode = this.settings.forceAnalysisMode.value;
    const frame = solved.getForceAnalysis(mode).frames[index];
    if (frame.status !== 'ok') return { message: frame.message };
    const values = ['Friction Normal', 'Friction Effort', 'Friction Static Limit'].map(
      (property) => this.samples.sampleAt(solved, index, 'force', mode, property, joint.id)[0]
    );
    const result = frame.friction?.get(joint.id);
    const body = solved.links[index].find((one) => one.id === result?.positiveBodyId);
    const sign =
      joint instanceof PrisJoint
        ? 'Force on the block is positive along the guide angle.'
        : `Torque on Link ${body?.name ?? result?.positiveBodyId} is positive counterclockwise.`;
    return { values, sign };
  }
}
