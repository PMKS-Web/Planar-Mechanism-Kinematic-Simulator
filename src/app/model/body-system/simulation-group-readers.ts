import { BodyId, WORLD } from './body-id';
import { add, localToWorld, Point } from './body-frame';
import { bodyPointRates, PointRates } from './body-point-rates';
import { solveFramePoint } from './body-solve-frame';
import { SimulationView } from './simulation-view';
import { SimulationValue, simulationAvailable, simulationUnavailable } from './simulation-values';
import { simulationBodyContext, SimulationBodyContext } from './simulation-body-context';

function centerContext(
  view: SimulationView,
  id: BodyId
): SimulationValue<SimulationBodyContext & { readonly center: Point }> {
  if (id === WORLD) return simulationUnavailable('world-group');
  const group = view.snapshot.system.groups.get(id);
  if (!group) return simulationUnavailable('unknown-group');
  if (!group.mass.center) return simulationUnavailable('zero-mass');
  const context = simulationBodyContext(view, id);
  if (!context.ok) return context;
  let center = group.mass.center;
  if (!group.fixed) {
    const part = view.snapshot.partitions.get(view.snapshot.bodyPartition.get(id)!)!;
    if (!part.ok) return simulationUnavailable(part.reason);
    center = solveFramePoint(part.frame, id, center);
  }
  return { ok: true, value: { ...context.value, center } };
}

/** Aggregate overrides affect the group's dynamics and center, never its members' raw properties.
 * WORLD is a computational collection of separate foundations, not one physical group center. */
export function simulationGroupCenter(view: SimulationView, id: BodyId): SimulationValue<Point> {
  const context = centerContext(view, id);
  if (!context.ok) return context;
  const { pose, center, origin } = context.value;
  return simulationAvailable(add(localToWorld(pose, center), origin));
}

export function simulationGroupCenterRates(
  view: SimulationView,
  id: BodyId
): SimulationValue<PointRates> {
  const context = centerContext(view, id);
  if (!context.ok) return context;
  const { pose, center, motion } = context.value;
  if (!motion.ok) return motion;
  const rates = bodyPointRates(pose, center, motion.value);
  return rates ? simulationAvailable(rates) : simulationUnavailable('invalid');
}
