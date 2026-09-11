import { JointCoordinateRef } from './joint-record';
import { BodyConstraintRow } from './compiled-body-system';
import { GroupPoses, bodyRowValue } from './body-constraint-rows';
import { createBodySolveFrame, solveFramePoint } from './body-solve-frame';
import { BodyRatesResult, CommandMotion } from './body-rates';
import { bodyCoordinateMotion } from './body-coordinate-rates';
import { SimulationView } from './simulation-view';
import { SimulationValue, simulationAvailable, simulationUnavailable } from './simulation-values';
import { STILL_BODY_MOTION } from './simulation-body-context';

interface CoordinateContext {
  readonly row: BodyConstraintRow;
  readonly poses: GroupPoses;
  readonly rates?: BodyRatesResult;
}
function context(
  view: SimulationView,
  ref: JointCoordinateRef
): SimulationValue<CoordinateContext> {
  const snapshot = view.snapshot;
  const coordinate = snapshot.system.coordinates.find(
    (item) => item.jointId === ref.jointId && item.coordinate === ref.coordinate
  );
  if (!coordinate) return simulationUnavailable('unknown-coordinate');
  const joint = snapshot.document.joints.find((item) => item.id === ref.jointId)!;
  const key = snapshot.bodyPartition.get(joint.bodyA) ?? snapshot.bodyPartition.get(joint.bodyB);
  if (!key) {
    const boundary = [...new Set([coordinate.row.pair.groupA, coordinate.row.pair.groupB])];
    const frame = createBodySolveFrame(
      {
        key: 'fixed-coordinate',
        unknowns: [],
        boundary,
        materialIds: [],
        rows: [coordinate.row],
        drivers: [],
        limits: [],
      },
      new Map(boundary.map((id) => [id, snapshot.system.groups.get(id)!.pose]))
    );
    return {
      ok: true,
      value: {
        row: frame.partition.rows[0],
        poses: frame.initialPoses,
        rates: { ok: true, motions: new Map(boundary.map((id) => [id, STILL_BODY_MOTION])) },
      },
    };
  }
  const selected = view.samples.get(key);
  if (!selected?.ok) return selected ?? simulationUnavailable('missing-sample');
  const partition = snapshot.partitions.get(key)!;
  if (!partition.ok) return simulationUnavailable(partition.reason);
  const input = selected.value.input;
  if (!input.pose.ok) return simulationUnavailable(input.pose.reason);
  const pair = coordinate.row.pair;
  if (
    !partition.frame.groupOffsets.has(pair.groupA) ||
    !partition.frame.groupOffsets.has(pair.groupB)
  )
    return simulationUnavailable('outside-sample');
  const row = {
    ...coordinate.row,
    pair: {
      ...pair,
      anchorA: solveFramePoint(partition.frame, pair.groupA, pair.anchorA),
      anchorB: solveFramePoint(partition.frame, pair.groupB, pair.anchorB),
    },
  };
  return { ok: true, value: { row, poses: input.pose.poses, rates: input.rates } };
}

export function simulationCoordinateValue(
  view: SimulationView,
  ref: JointCoordinateRef
): SimulationValue<number> {
  const result = context(view, ref);
  if (!result.ok) return result;
  const value = bodyRowValue(result.value.row, result.value.poses);
  return Number.isFinite(value) ? simulationAvailable(value) : simulationUnavailable('invalid');
}
export function simulationCoordinateRates(
  view: SimulationView,
  ref: JointCoordinateRef
): SimulationValue<CommandMotion> {
  const result = context(view, ref);
  if (!result.ok) return result;
  const { row, poses, rates } = result.value;
  if (!rates) return simulationUnavailable('missing-rates');
  if (!rates.ok) return simulationUnavailable(rates.reason);
  const value = bodyCoordinateMotion(row, poses, rates.motions);
  return value ? simulationAvailable(value) : simulationUnavailable('invalid');
}
