import type { Joint } from '../joint';
import type { Link } from '../link';
import { KinematicsSolver } from './kinematic-solver';
import type { Loop } from './loop-solver';
import { PositionSolver, PositionSolverDriveState } from './position-solver';

export interface KinematicAccelerationSnapshot {
  /** Same coordinate units as the supplied geometry, per second squared. */
  readonly linkAccelerations: ReadonlyMap<string, readonly [number, number]>;
  /** Radians per second squared (unlike the degree-valued position map). */
  readonly linkAngularAccelerations: ReadonlyMap<string, number>;
  /** Optional extension for section recovery; S2 does not require or use velocity. */
  readonly linkAngularVelocities?: ReadonlyMap<string, number>;
}

/**
 * Run the existing analytical equations in fresh contexts, without touching the
 * UI's static maps or needing to save/restore another partition's solver state.
 * No differencing fallback: a missing analytical rate remains missing.
 */
export function snapshotKinematicAccelerations(
  joints: Joint[],
  links: Link[],
  commandRate: number,
  requiredLoops: Loop[],
  driveState: PositionSolverDriveState
): KinematicAccelerationSnapshot {
  // Resolve live imports at invocation time. The full Angular test bundle uses
  // lazy module initialization; a transformed imported superclass can otherwise
  // capture the export before that module's constructor has been initialized.
  const PositionContext = PositionSolver;
  const KinematicContext = KinematicsSolver;
  class SamplePositionSolver extends PositionContext {}
  class SampleKinematicsSolver extends KinematicContext {
    protected static override positionSolver = SamplePositionSolver;
  }
  SamplePositionSolver.resetStaticVariables();
  SamplePositionSolver.restoreDriveState(driveState);
  SampleKinematicsSolver.resetVariables();
  SampleKinematicsSolver.requiredLoops = requiredLoops;
  SampleKinematicsSolver.determineKinematics(joints, links, commandRate);
  return {
    linkAccelerations: SampleKinematicsSolver.linkAccMap,
    linkAngularAccelerations: SampleKinematicsSolver.linkAngAccMap,
    linkAngularVelocities: SampleKinematicsSolver.linkAngVelMap,
  };
}
