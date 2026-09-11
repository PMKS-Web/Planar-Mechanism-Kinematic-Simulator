import { BodyContinuationState } from './body-continuation';
import { GroupPoses } from './body-constraint-rows';
import { freezeResult, snapshotMap } from './sample-results';

export interface BodyPoseSample {
  readonly poses: GroupPoses;
  readonly command: number;
  readonly regular: boolean;
}

/** A continuation predictor may survive a singularity; it is never a published rate. */
export function bodyPoseSample(state: BodyContinuationState): BodyPoseSample {
  return freezeResult({
    command: state.command,
    regular: state.regular,
    poses: snapshotMap(
      [...state.poses].map(([id, pose]) => [id, freezeResult({ ...pose })] as const)
    ),
  });
}
