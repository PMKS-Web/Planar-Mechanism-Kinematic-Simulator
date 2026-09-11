import { BodyId, DriverId, JointId } from './body-id';
import { Wrench } from './joint-wrenches';
import { DriverEffort, ForcePower, pairBodyWrench, driverForceValue } from './force-frame-result';
import { SimulationView } from './simulation-view';
import { SimulationValue, simulationAvailable, simulationUnavailable } from './simulation-values';

export interface SimulationReaction {
  readonly wrench: Wrench;
  readonly basis: 'unique' | 'evenest';
}
export function simulationJointReaction(
  view: SimulationView,
  id: JointId,
  body: BodyId
): SimulationValue<SimulationReaction> {
  const snapshot = view.snapshot,
    joint = snapshot.document.joints.find((item) => item.id === id);
  if (!joint) return simulationUnavailable('unknown-joint');
  if (body !== joint.bodyA && body !== joint.bodyB) return simulationUnavailable('wrong-body');
  const key = snapshot.bodyPartition.get(joint.bodyA) ?? snapshot.bodyPartition.get(joint.bodyB);
  let pair;
  if (key) {
    const selected = view.samples.get(key);
    if (!selected?.ok) return selected ?? simulationUnavailable('missing-sample');
    const forces = selected.value.forces;
    if (!forces) return simulationUnavailable('invalid');
    if (!forces.ok) return simulationUnavailable(forces.reason);
    pair = forces.joints.get(id);
  } else {
    if (!view.fixedForces.ok) return simulationUnavailable('invalid');
    pair = view.fixedForces.joints.get(id);
  }
  const value = pairBodyWrench(pair, body);
  if (!value.ok) return value;
  return pair?.ok
    ? simulationAvailable({ wrench: value.value, basis: pair.value.basis })
    : simulationUnavailable('invalid');
}
export function simulationDriverEffort(
  view: SimulationView,
  id: DriverId
): SimulationValue<DriverEffort> {
  const snapshot = view.snapshot,
    driver = snapshot.document.drivers.find((item) => item.id === id);
  if (!driver) return simulationUnavailable('unknown-driver');
  const joint = snapshot.document.joints.find((item) => item.id === driver.coordinate.jointId)!;
  const key = snapshot.bodyPartition.get(joint.bodyA) ?? snapshot.bodyPartition.get(joint.bodyB);
  if (!key) return simulationUnavailable('frame-context');
  const selected = view.samples.get(key);
  if (!selected?.ok) return selected ?? simulationUnavailable('missing-sample');
  const forces = selected.value.forces;
  return forces ? driverForceValue(forces, id) : simulationUnavailable('invalid');
}
export function simulationPower(view: SimulationView, key: string): SimulationValue<ForcePower> {
  const selected = view.samples.get(key);
  if (!selected?.ok) return selected ?? simulationUnavailable('outside-sample');
  const forces = selected.value.forces;
  return !forces
    ? simulationUnavailable('invalid')
    : forces.ok
      ? forces.power
      : simulationUnavailable(forces.reason);
}
