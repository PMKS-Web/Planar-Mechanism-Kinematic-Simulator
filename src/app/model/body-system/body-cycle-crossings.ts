import { AdmittedBodySystem } from './body-continuation';
import { BodyCycle } from './body-cycle';
import { GroupPoses } from './body-constraint-rows';
import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { relaxBodyPosition } from './body-position-solver';
import { Pose } from './body-frame';
import { bodyAnchorPoseError } from './body-anchor-pose-error';
import { checkBodyLimits } from './body-limits';
import { BodyId } from './body-id';

/** Correct crossings inside accepted cycle intervals; geometry is the seed for repeated assembly choices. */
export function bodyCycleCrossings(
  admitted: AdmittedBodySystem,
  system: CompiledBodySystem,
  displayed: BodyDocument,
  command: number,
  length: number,
  cycle: Extract<BodyCycle, { ok: true }>
) {
  const samples = cycle.samples;
  const driver = admitted.frame.partition.drivers[0];
  const commands = [command];
  if (driver.row.kind === 'angle') {
    const low = Math.min(...samples.map((sample) => sample.state.command));
    const high = Math.max(...samples.map((sample) => sample.state.command));
    commands.length = 0;
    for (
      let turn = Math.ceil((low - command) / (2 * Math.PI) - 1e-10);
      turn <= Math.floor((high - command) / (2 * Math.PI) + 1e-10);
      turn++
    )
      commands.push(command + turn * 2 * Math.PI);
  }
  const candidates: {
    time: number;
    command: number;
    direction: 1 | -1;
    error: number;
    poses: ReadonlyMap<BodyId, Pose>;
    groups: GroupPoses;
  }[] = [];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i],
      b = samples[i + 1];
    const span = b.state.command - a.state.command;
    if (span === 0) continue;
    const heading = span < 0 ? -1 : 1;
    for (const value of commands) {
      const blend = (value - a.state.command) / span;
      if (blend < -1e-10 || blend > 1 + 1e-10) continue;
      const fraction = Math.max(0, Math.min(1, blend));
      const seed: GroupPoses = new Map(
        [...a.state.poses].map(([id, pose]) => {
          const end = b.state.poses.get(id)!;
          return [
            id,
            {
              x: pose.x + (end.x - pose.x) * fraction,
              y: pose.y + (end.y - pose.y) * fraction,
              angle: pose.angle + (end.angle - pose.angle) * fraction,
            },
          ];
        })
      );
      const corrected = relaxBodyPosition(
        admitted.frame.partition,
        seed,
        new Map([[driver.id, value]]),
        { allowSingularCorrection: true }
      );
      if (!corrected.ok) continue;
      const material = bodyAnchorMaterialPoses(system, admitted.frame, corrected.poses, length);
      if (checkBodyLimits(admitted.frame.partition, corrected.poses, admitted.scale)) continue;
      const error = bodyAnchorPoseError(admitted, displayed, material, length);
      candidates.push({
        poses: material,
        groups: corrected.poses,
        command: value,
        time: a.time + fraction * (b.time - a.time),
        direction: heading,
        error,
      });
    }
  }
  return { candidates, commands };
}
