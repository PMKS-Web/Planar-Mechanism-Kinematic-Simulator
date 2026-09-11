import { AdmittedBodySystem, initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { buildBodyCycle } from './body-cycle';
import { bodyCycleCrossings } from './body-cycle-crossings';
import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { bodyAnchorTurns } from './body-anchor-turns';
import { bodyRowValue, GroupPoses } from './body-constraint-rows';
import { checkBodyLimits } from './body-limits';

/** A stop on the direct angular route is not proof that the same start cannot be reached around it. */
export function reachBodyAnchor(
  admitted: AdmittedBodySystem,
  system: CompiledBodySystem,
  source: BodyDocument,
  target: number,
  length: number
):
  | { readonly ok: true; readonly poses: GroupPoses }
  | { readonly ok: false; readonly status: 'unreachable' | 'anchor-unsolved' } {
  const driver = admitted.frame.partition.drivers[0],
    angular = driver.row.kind === 'angle';
  const reached = inspectBodyInterval(admitted, initialBodyContinuation(admitted), target);
  const tolerance = 1e-9 * (angular ? 1 : admitted.scale.length);
  if (reached.ok && Math.abs(reached.state.command - target) <= tolerance)
    return { ok: true, poses: reached.state.poses };
  if (!angular)
    return { ok: false, status: reached.ok && reached.stop ? 'unreachable' : 'anchor-unsolved' };
  const cycle = buildBodyCycle(admitted);
  if (!cycle.ok) return { ok: false, status: 'anchor-unsolved' };
  const { candidates, commands } = bodyCycleCrossings(
    admitted,
    system,
    source,
    target,
    length,
    cycle
  );
  if (!commands.length) return { ok: false, status: 'unreachable' };
  candidates.sort((a, b) => a.error - b.error || a.time - b.time);
  for (const candidate of candidates) {
    const poses = bodyAnchorTurns(
      system,
      admitted.frame,
      source,
      candidate.groups,
      candidate.command,
      target,
      length
    );
    if (!poses) continue;
    const part = admitted.frame.partition,
      values = new Map([[driver.id, target]]);
    // Finite angular limits name an unwrapped coordinate, so physical equivalence alone is insufficient.
    if (
      checkBodyLimits(part, poses, admitted.scale) ||
      part.rows.some(
        (row, i) => Math.abs(bodyRowValue(row, poses, values) * admitted.scale.rows[i]) > 1e-8
      )
    )
      continue;
    return { ok: true, poses };
  }
  return { ok: false, status: 'anchor-unsolved' };
}
