import { AdmittedBodySystem, initialBodyContinuation } from './body-continuation';
import { buildBodyCycle } from './body-cycle';
import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { Pose } from './body-frame';
import { BodyId } from './body-id';
import { bodyCycleCrossings } from './body-cycle-crossings';
import { inspectBodyInterval } from './body-interval';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { bodyAnchorPoseError } from './body-anchor-pose-error';

/** Elapsed time belongs to the new cycle; repeated coordinates are selected by direction and material pose. */
export function bodyAnchorClock(
  admitted: AdmittedBodySystem,
  system: CompiledBodySystem,
  displayed: BodyDocument,
  command: number,
  direction: 1 | -1,
  length: number,
  path: 'window' | 'cycle'
):
  | {
      readonly time: number;
      readonly command: number;
      readonly direction: 1 | -1;
      readonly poses?: ReadonlyMap<BodyId, Pose>;
    }
  | undefined {
  const driver = admitted.frame.partition.drivers[0];
  if (path === 'window') {
    const time = (command - driver.initial) / driver.speed;
    if (!Number.isFinite(time) || time < 0) return undefined;
    const reached = inspectBodyInterval(admitted, initialBodyContinuation(admitted), command);
    const tolerance = 1e-9 * (driver.row.kind === 'angle' ? 1 : admitted.scale.length);
    if (!reached.ok || Math.abs(reached.state.command - command) > tolerance) return undefined;
    const poses = bodyAnchorMaterialPoses(system, admitted.frame, reached.state.poses, length);
    if (bodyAnchorPoseError(admitted, displayed, poses, length) > 1e-7) return undefined;
    return { time, command, direction: driver.speed < 0 ? -1 : 1, poses };
  }
  const cycle = buildBodyCycle(admitted);
  if (!cycle.ok) return undefined;
  const { candidates } = bodyCycleCrossings(admitted, system, displayed, command, length, cycle);
  const matching = candidates.filter((candidate) => candidate.error <= 1e-7);
  matching.sort(
    (a, b) =>
      Number(b.direction === direction) - Number(a.direction === direction) ||
      a.error - b.error ||
      a.time - b.time
  );
  return matching[0];
}
