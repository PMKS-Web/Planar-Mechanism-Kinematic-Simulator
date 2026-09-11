import { NativeCylinderExample, HandBody, handOffset } from './native-cylinder-example';
import { compileBodyDocument } from '../../app/model/body-system/constraint-compiler';
import { admitBodyPartition } from '../../app/model/body-system/body-admission';
import {
  advanceBodyCommand,
  initialBodyContinuation,
} from '../../app/model/body-system/body-continuation';
import { bodyRowValue } from '../../app/model/body-system/body-constraint-rows';
import { solveBodyRates } from '../../app/model/body-system/body-rates';
import { STILL_BODY_MOTION } from '../../app/model/body-system/simulation-body-context';
import { solveBodyForceFrame } from '../../app/model/body-system/body-force-frame';
import { newRecordId } from '../../app/model/body-system/body-id';
import { reverseJoint } from '../../app/model/body-system/reverse-joint';

import { close, dot, checkCylinderHandMotion } from './check-native-cylinder-motion';

/** Every material body's hand motion is independent of group choice, row order and the solver's output. */
export function checkNativeCylinderExample(example: NativeCylinderExample, reverse = false) {
  const witness = example.document.attachments.find((a) => a.id === example.witness)!;
  const load = {
    id: newRecordId<'force'>(),
    bodyId: witness.bodyId,
    point: witness.point,
    vector: { x: 2, y: -3 },
    couple: 0.6,
    frame: 'world' as const,
    label: 'off-axis verification load',
  };
  const source = { ...example.document, forces: [load] };
  // Assemblies retain canonical barrel/rod order. External binary R/P/weld equations may reverse.
  const document = reverse
    ? {
        ...source,
        bodies: [...source.bodies].reverse(),
        attachments: [...source.attachments].reverse(),
        joints: [...source.joints]
          .reverse()
          .map((j) =>
            j.id === example.assembly.internalJoint || j.id === example.driver.coordinate.jointId
              ? j
              : reverseJoint(j)
          ),
        limits: source.limits.map((limit) => {
          const reversed =
            limit.coordinate.jointId !== example.assembly.internalJoint &&
            limit.coordinate.jointId !== example.driver.coordinate.jointId;
          return reversed ? { ...limit, lower: -limit.upper, upper: -limit.lower } : limit;
        }),
      }
    : source;
  const before = JSON.stringify(document),
    compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system;
  expect(document.bodies.length).toBe(example.bodyCount);
  expect(document.joints.length).toBe(example.jointCount);
  expect(system.partitions.length).toBe(1);
  const admitted = admitBodyPartition(system, system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  expect(admitted.mobility.dof).toBe(1);
  expect(admitted.frame.partition.unknowns.length).toBe(example.unknownCount);
  let state = initialBodyContinuation(admitted);
  for (const [index, command] of example.commands.entries()) {
    const step = advanceBodyCommand(admitted, state, command);
    if (!step.ok) throw new Error(command + ': ' + step.reason);
    state = step.state;
    const commands = new Map([[example.driver.id, command]]);
    for (const row of admitted.frame.partition.rows)
      close(bodyRowValue(row, state.poses, commands), 0);
    for (const limit of admitted.frame.partition.limits) {
      const coordinate = bodyRowValue(limit.row, state.poses);
      expect(coordinate).toBeGreaterThanOrEqual(limit.lower - 1e-8);
      expect(coordinate).toBeLessThanOrEqual(limit.upper + 1e-8);
    }
    for (const [v, a] of [
      [0.2, 0.3],
      [-0.4, -0.7],
    ]) {
      const rates = solveBodyRates(
        admitted.frame.partition,
        state.poses,
        new Map([[example.driver.id, { value: command, velocity: v, acceleration: a }]]),
        new Map(admitted.frame.partition.boundary.map((id) => [id, STILL_BODY_MOTION]))
      );
      if (!rates.ok) throw new Error(rates.reason);
      const expected = example.hand(command, v, a);
      expect(expected.size).toBe(example.bodyCount - 1);
      const kineticPower = checkCylinderHandMotion(
        document,
        system,
        admitted.frame,
        state.poses,
        rates.motions,
        expected
      );
      const forces = solveBodyForceFrame(
        document,
        system,
        admitted.frame,
        {
          sample: {
            revision: 1,
            partitionKey: admitted.frame.partition.key,
            index,
            time: index,
            command,
            direction: v > 0 ? 1 : -1,
          },
          pose: { ok: true, poses: state.poses, commands },
          rates,
        },
        { mode: 'dynamic', gravity: { x: 0, y: 0 } }
      );
      if (!forces.ok) throw new Error(forces.reason);
      const hand = expected.get(witness.bodyId) as HandBody,
        point = handOffset(hand, hand.angle, witness.point);
      const applied = dot(load.vector, point.velocity) + load.couple * hand.angle.velocity;
      const effort = forces.drivers.get(example.driver.id)!;
      if (!effort.ok || !forces.power.ok) throw new Error('Expected available power and effort');
      close(effort.value.value * v, kineticPower - applied);
      close(forces.power.value.kineticEnergyRate, kineticPower);
      close(forces.power.value.applied, applied);
      close(forces.power.value.residual, 0);
    }
  }
  expect(JSON.stringify(document)).toBe(before);
}
