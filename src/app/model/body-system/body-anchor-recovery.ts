import { turnsClockwise } from '../drive-direction';
import { BodyDocument, BodyDriver } from './body-document';
import { BodyClockState } from './body-document-authority';
import { BodyEditFrame } from './body-edit-frame';
import { BodyId, JointId } from './body-id';
import { Pose, localToWorld } from './body-frame';
import { BodyAnchorChange } from './body-anchor-change';
import { CompiledBodySystem, CompiledBodyPartition } from './compiled-body-system';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { AdmittedBodySystem, initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { buildBodyCycle, BodyCycle } from './body-cycle';
import { bodyRowValue, GroupPoses } from './body-constraint-rows';
import { checkBodyLimits } from './body-limits';
import { BodySolveFrame } from './body-solve-frame';
import { relaxBodyPosition } from './body-position-solver';
import { geometryCenter } from './body-center-geometry';

type RestoredAnchor =
  | {
      readonly ok: true;
      readonly poses: ReadonlyMap<BodyId, Pose>;
      readonly shownPoses?: ReadonlyMap<BodyId, Pose>;
      readonly clock: BodyClockState;
      readonly change: BodyAnchorChange;
    }
  | { readonly ok: false; readonly status: BodyAnchorChange['status'] };

/** Reach the original coordinate before selecting the edited pose on the rebuilt motion's leg. */
export function restoreBodyPartitionAnchor(
  source: BodyDocument,
  proposed: BodyDocument,
  frame: BodyEditFrame,
  system: CompiledBodySystem,
  part: CompiledBodyPartition,
  length: number,
  axisEdits: ReadonlySet<JointId> = new Set()
): RestoredAnchor {
  const admitted = admitBodyPartition(system, part);
  if (!admitted.ok) return { ok: false, status: 'motion-unavailable' };
  const driver = proposed.drivers.find((item) => item.id === part.drivers[0].id)!;
  const oldDriver = source.drivers.find((item) => item.id === driver.id);
  const clock = frame.clocks.find((item) => item.driverId === driver.id);
  const sign =
    oldDriver && bodyAnchorCoordinateSign(source, proposed, oldDriver, driver, axisEdits);
  if (!clock || !sign) return { ok: false, status: 'coordinate-changed' };
  const factor = driver.coordinate.coordinate === 'angle' ? 1 : length;
  const target = clock.anchor * sign * factor;
  const reached = reachBodyAnchor(admitted, system, source, target, length);
  if (!reached.ok) return reached;
  const restored = bodyAnchorMaterialPoses(system, admitted.frame, reached.poses, length);
  const oldSpeed = oldDriver!.profile.speed * sign;
  const reversed =
    oldSpeed !== 0 &&
    driver.profile.speed !== 0 &&
    Math.sign(oldSpeed) !== Math.sign(driver.profile.speed);
  // Changing a coordinate's sign preserves physical direction; changing drive direction reverses the current leg.
  const direction =
    oldSpeed === 0 && driver.profile.speed !== 0
      ? turnsClockwise(driver.profile.speed)
        ? -1
        : 1
      : (((clock.direction ?? (turnsClockwise(oldDriver!.profile.speed) ? -1 : 1)) *
          sign *
          (reversed ? -1 : 1)) as 1 | -1);
  let shown: ReturnType<typeof bodyAnchorClock>;
  if (clock.time === 0 && driver.profile.initial * factor === target) {
    // Another machine being displaced does not make this machine's unchanged start require a cycle.
    shown = { command: target, time: 0, direction };
  } else {
    const candidate: BodyDocument = {
      ...proposed,
      bodies: proposed.bodies.map((body) => ({
        ...body,
        pose: restored.get(body.id) ?? body.pose,
      })),
      drivers: proposed.drivers.map((item) =>
        item.id === driver.id
          ? { ...item, profile: { ...item.profile, initial: target / factor } }
          : item
      ),
    };
    const rebuilt = compileBodyDocument(candidate);
    const newPart =
      rebuilt.ok &&
      rebuilt.system.partitions.find((item) =>
        item.drivers.some((drive) => drive.id === driver.id)
      );
    const start = rebuilt.ok && newPart && admitBodyPartition(rebuilt.system, newPart);
    if (start && start.ok && rebuilt.ok)
      shown = bodyAnchorClock(
        start,
        rebuilt.system,
        proposed,
        driver.profile.initial * factor,
        direction,
        length,
        frame.paths.get(driver.id) ?? 'cycle'
      );
  }
  if (!shown) return { ok: false, status: 'anchor-unsolved' };
  return {
    ok: true,
    poses: restored,
    shownPoses: shown.poses,
    clock: {
      ...clock,
      anchor: target / factor,
      command: shown.command / factor,
      time: shown.time,
      direction: shown.direction,
    },
    change: {
      driverId: driver.id,
      status: 'retained',
      previous: clock.anchor,
      anchor: target / factor,
    },
  };
}

/** Carry only the same physical coordinate, including the explicit sign change of an ordered P pair. */
export function bodyAnchorCoordinateSign(
  before: BodyDocument,
  after: BodyDocument,
  old: BodyDriver,
  next: BodyDriver,
  axisEdits: ReadonlySet<JointId> = new Set()
): 1 | -1 | undefined {
  if (old.coordinate.coordinate !== next.coordinate.coordinate) return undefined;
  const a = before.joints.find((joint) => joint.id === old.coordinate.jointId);
  const b = after.joints.find((joint) => joint.id === next.coordinate.jointId);
  if (!a || !b || a.kind === 'weld' || b.kind === 'weld') return undefined;
  const sign =
    a.bodyA === b.bodyA && a.bodyB === b.bodyB
      ? 1
      : a.bodyA === b.bodyB && a.bodyB === b.bodyA
        ? -1
        : undefined;
  if (!sign) return undefined;
  if (old.coordinate.coordinate === 'angle')
    return b.angleZero === sign * a.angleZero ? sign : undefined;
  if (a.kind === 'revolute' || b.kind === 'revolute' || b.travelZero !== sign * a.travelZero)
    return undefined;
  const oldCarrier = sign === 1 ? a.bodyA : a.bodyB;
  const axis = sign === 1 ? a.frameA.angle : a.frameA.angle - a.angleZero;
  const first = sign === 1 ? a.frameA.attachmentId : a.frameB.attachmentId;
  const second = sign === 1 ? a.frameB.attachmentId : a.frameA.attachmentId;
  return oldCarrier === b.bodyA &&
    // An explicit guide-axis edit carries the same signed distance onto the newly authored axis.
    (b.frameA.angle === axis || (a.id === b.id && axisEdits.has(a.id))) &&
    b.frameA.attachmentId === first &&
    b.frameB.attachmentId === second
    ? sign
    : undefined;
}

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
    return { time, command, direction: turnsClockwise(driver.speed) ? -1 : 1, poses };
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

/** Equivalent rotations need one coherent lift: independently wrapping bodies breaks P angle rows. */
export function bodyAnchorTurns(
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  source: BodyDocument,
  poses: GroupPoses,
  from: number,
  target: number,
  length: number
): GroupPoses | undefined {
  const part: CompiledBodyPartition = frame.partition,
    driver = part.drivers[0];
  const turn = (target - from) / (2 * Math.PI),
    count = Math.round(turn);
  if (Math.abs(turn - count) > 1e-9 || driver.row.kind !== 'angle') return undefined;
  const roots = new Map([...part.unknowns, ...part.boundary].map((id) => [id, id]));
  const root = (id: BodyId): BodyId => (roots.get(id) === id ? id : root(roots.get(id)!));
  for (const row of part.rows) {
    if (row.kind === 'angle' && row.commandId === undefined)
      roots.set(root(row.pair.groupB), root(row.pair.groupA));
  }
  const fixed = new Set(part.boundary.map(root));
  const preferences = new Map<BodyId, { sum: number; weight: number }>();
  const material = bodyAnchorMaterialPoses(system, frame, poses, length);
  for (const body of source.bodies) {
    const pose = material.get(body.id);
    if (!pose) continue;
    const id = root(system.groupOf.get(body.id)!);
    const previous = preferences.get(id) ?? { sum: 0, weight: 0 };
    preferences.set(id, {
      sum: previous.sum + (body.pose.angle - pose.angle) / (2 * Math.PI),
      weight: previous.weight + 1,
    });
  }
  const shifts = new Map(
    [...roots.keys()].map((id) => {
      const group = root(id),
        preference = preferences.get(group);
      return [
        group,
        fixed.has(group) ? 0 : Math.round(preference ? preference.sum / preference.weight : 0),
      ];
    })
  );
  const a = root(driver.row.pair.groupA),
    b = root(driver.row.pair.groupB);
  if (a === b || (fixed.has(a) && fixed.has(b))) {
    if (count !== 0) return undefined;
  } else if (fixed.has(a)) shifts.set(b, count);
  else if (fixed.has(b)) shifts.set(a, -count);
  else {
    const pa = preferences.get(a) ?? { sum: 0, weight: 0 };
    const pb = preferences.get(b) ?? { sum: 0, weight: 0 };
    const shift = Math.round(
      (pa.sum + pb.sum - count * pb.weight) / Math.max(1, pa.weight + pb.weight)
    );
    shifts.set(a, shift);
    shifts.set(b, shift + count);
  }
  return new Map(
    [...poses].map(([id, pose]) => [
      id,
      { ...pose, angle: pose.angle + shifts.get(root(id))! * 2 * Math.PI },
    ])
  );
}

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

/** A remote world origin affects position precision, never the tolerance for a wrong assembly angle. */
export function bodyAnchorPoseError(
  admitted: AdmittedBodySystem,
  source: BodyDocument,
  material: ReadonlyMap<BodyId, Pose>,
  length: number
): number {
  let error = 0;
  for (const [id, pose] of material) {
    const body = source.bodies.find((item) => item.id === id);
    if (!body || body.kind === 'world') continue;
    const center = geometryCenter(body.geometry);
    const first = localToWorld(pose, center),
      second = localToWorld(body.pose, center);
    const distance = Math.max(
      0,
      Math.hypot(first.x - second.x, first.y - second.y) * length - admitted.frame.inputPrecision
    );
    error = Math.max(
      error,
      distance / admitted.scale.length,
      Math.abs(Math.sin((pose.angle - body.pose.angle) / 2))
    );
  }
  return error;
}
