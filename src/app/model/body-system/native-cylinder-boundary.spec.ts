import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { handOffset } from '../../../test-utils/verification/native-cylinder-example';
import { checkCylinderHandMotion } from '../../../test-utils/verification/check-native-cylinder-motion';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { inverse, subtract } from './body-frame';
import { relaxBodyPosition } from './body-position-solver';
import { BodyMotion, solveBodyRates } from './body-rates';
import { bodyRowGradient } from './body-constraint-rows';
import { numericalGroupRates } from './body-point-rates';
import { STILL_BODY_MOTION } from './simulation-body-context';

describe('native cylinder examples with prescribed moving boundaries', () => {
  for (const [make, label] of [
    [nativeRotatingCylinder, 'rotating carrier'],
    [nativeTranslatingCylinder, 'translating bracket'],
  ] as const)
    it(label + ': boundary acceleration projects into retained rows and cannot be omitted', () => {
      for (const reverse of [false, true]) {
        const fixture = make(reverse),
          compiled = compileBodyDocument(fixture.document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const system = compiled.system,
          admitted = admitBodyPartition(system, system.partitions[0]);
        if (!admitted.ok) throw new Error(admitted.reason);
        const material = fixture.document.bodies.find(
          (body) => body.kind === 'material' && body.label === label
        )!;
        const groupId = system.groupOf.get(material.id)!,
          member = system.groups.get(groupId)!.members.get(material.id)!;
        const original = admitted.frame.partition;
        const partition = {
          ...original,
          unknowns: original.unknowns.filter((id) => id !== groupId),
          boundary: [...original.boundary, groupId],
        };
        let state = initialBodyContinuation(admitted);
        for (const command of fixture.commands) {
          const step = advanceBodyCommand(admitted, state, command);
          if (!step.ok) throw new Error(step.reason);
          state = step.state;
          const velocity = 0.8,
            acceleration = -0.6,
            expected = fixture.hand(command, velocity, acceleration);
          const hand = expected.get(material.id)!,
            group = handOffset(hand, hand.angle, inverse(member));
          const groupPose = { ...group.point, angle: hand.angle.value - member.angle };
          const groupMotion: BodyMotion = {
            velocity: { vx: group.velocity.x, vy: group.velocity.y, omega: hand.angle.velocity },
            acceleration: {
              ax: group.acceleration.x,
              ay: group.acceleration.y,
              alpha: hand.angle.acceleration,
            },
          };
          const motion = numericalGroupRates(admitted.frame, groupId, groupPose, groupMotion)!;
          const boundary = new Map(original.boundary.map((id) => [id, STILL_BODY_MOTION]));
          boundary.set(groupId, motion);
          const commands = new Map([
            [fixture.driver.id, { value: command, velocity, acceleration }],
          ]);
          // A prescribed boundary supplies its pose as well as its derivatives. Keeping the
          // earlier approximate solved pose would test mismatched position and motion data.
          const prescribedPoses = new Map(state.poses);
          prescribedPoses.set(groupId, {
            ...subtract(groupPose, admitted.frame.origin),
            angle: groupPose.angle,
          });
          const placed = relaxBodyPosition(
            partition,
            prescribedPoses,
            new Map([[fixture.driver.id, command]]),
            { residualTolerance: 1e-13 }
          );
          if (!placed.ok) throw new Error(placed.reason);
          const poses = placed.poses;
          const rates = solveBodyRates(partition, poses, commands, boundary);
          if (!rates.ok) throw new Error(rates.reason);
          checkCylinderHandMotion(
            fixture.document,
            system,
            admitted.frame,
            poses,
            rates.motions,
            expected
          );
          expect(rates.motions.get(groupId)).toEqual(motion);
          const projected = partition.rows.map((row) => {
            const gradient = bodyRowGradient(row, poses).get(groupId) ?? [0, 0, 0];
            return gradient[0] * motion.acceleration.ax + gradient[1] * motion.acceleration.ay;
          });
          expect(Math.max(...projected.map(Math.abs))).toBeGreaterThan(0.1);
          const omitted = new Map(boundary);
          omitted.set(groupId, { ...motion, acceleration: STILL_BODY_MOTION.acceleration });
          // The original drive row remains as a redundant compatibility equation.
          expect(solveBodyRates(partition, poses, commands, omitted)).toEqual({
            ok: false,
            reason: 'acceleration-inconsistent',
          });
        }
      }
    });
});
