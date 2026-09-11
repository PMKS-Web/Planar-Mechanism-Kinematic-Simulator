import { BodyId } from './body-id';
import { BodyDocument } from './body-document';
import { GroupPoses } from './body-constraint-rows';
import { CompiledBodyPartition, CompiledBodySystem } from './compiled-body-system';
import { bodyAnchorMaterialPoses } from './body-anchor-material-poses';
import { BodySolveFrame } from './body-solve-frame';

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
