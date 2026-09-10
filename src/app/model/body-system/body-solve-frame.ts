import { BodyId } from './body-id';
import { add, compose, inverse, Point, Pose, subtract, worldToLocal } from './body-frame';
import { GroupPoses } from './body-constraint-rows';
import { BodyConstraintRow, CompiledBodyPartition, ConstraintPair } from './compiled-body-system';

export interface BodySolveFrame {
  readonly origin: Point;
  readonly partition: CompiledBodyPartition;
  readonly initialPoses: GroupPoses;
  /** Translation of each numerical group frame in its original compiled local axes. */
  readonly groupOffsets: ReadonlyMap<BodyId, Point>;
  /** Authored world coordinates have finite precision before any numerical correction. */
  readonly inputPrecision: number;
}

/** Continuation stays local: adding a distant world origin is a presentation boundary only. */
export function createBodySolveFrame(
  partition: CompiledBodyPartition,
  worldPoses: GroupPoses
): BodySolveFrame {
  const ids = [...partition.unknowns, ...partition.boundary];
  const reference = partition.unknowns[0] ?? partition.boundary[0];
  const origin = reference
    ? { x: worldPoses.get(reference)!.x, y: worldPoses.get(reference)!.y }
    : { x: 0, y: 0 };
  const boundary = new Set(partition.boundary);
  const groupOffsets = new Map<BodyId, Point>();
  const initialPoses = new Map<BodyId, Pose>();
  let largest = Math.max(Math.abs(origin.x), Math.abs(origin.y));
  for (const id of ids) {
    const pose = worldPoses.get(id)!;
    largest = Math.max(largest, Math.abs(pose.x), Math.abs(pose.y));
    const offset = boundary.has(id) ? worldToLocal(pose, origin) : { x: 0, y: 0 };
    groupOffsets.set(id, offset);
    initialPoses.set(
      id,
      boundary.has(id)
        ? { x: 0, y: 0, angle: pose.angle }
        : { ...subtract(pose, origin), angle: pose.angle }
    );
  }
  const pairs = new Map<ConstraintPair, ConstraintPair>();
  const transformRow = (row: BodyConstraintRow): BodyConstraintRow => {
    let pair = pairs.get(row.pair);
    if (!pair) {
      pair = {
        ...row.pair,
        anchorA: subtract(row.pair.anchorA, groupOffsets.get(row.pair.groupA)!),
        anchorB: subtract(row.pair.anchorB, groupOffsets.get(row.pair.groupB)!),
      };
      pairs.set(row.pair, pair);
    }
    return { ...row, pair };
  };
  return {
    origin,
    initialPoses,
    groupOffsets,
    inputPrecision: 16 * Number.EPSILON * largest,
    partition: {
      ...partition,
      rows: partition.rows.map(transformRow),
      drivers: partition.drivers.map((driver) => ({ ...driver, row: transformRow(driver.row) })),
      limits: partition.limits.map((limit) => ({ ...limit, row: transformRow(limit.row) })),
    },
  };
}

export function solveFramePoint(
  frame: BodySolveFrame,
  id: BodyId,
  compiledLocalPoint: Point
): Point {
  const offset = frame.groupOffsets.get(id);
  if (!offset) throw new Error('Group is outside the numerical partition');
  return subtract(compiledLocalPoint, offset);
}

/** Do not feed this rounded world result back into a continued solve. */
export function worldGroupPose(frame: BodySolveFrame, id: BodyId, numericalPose: Pose): Pose {
  const offset = frame.groupOffsets.get(id);
  if (!offset) throw new Error('Group is outside the numerical partition');
  const oldFrame = compose(numericalPose, inverse({ ...offset, angle: 0 }));
  return { ...add(oldFrame, frame.origin), angle: oldFrame.angle };
}
