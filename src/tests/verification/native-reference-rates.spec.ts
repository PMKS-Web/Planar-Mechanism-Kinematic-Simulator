import '../../app/model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  stephensonIiiEx2Fixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import { nativePositionReferenceFixture } from '../../test-utils/verification/native-position-reference-fixture';
import { teachingLabFourBar1031Rpm } from '../../test-data/verification/teaching-lab-four-bar-10-31rpm';
import { teachingLabSliderCrank151Rpm } from '../../test-data/verification/teaching-lab-slider-crank-15-1rpm';
import { stephensonIiiEx210Rpm } from '../../test-data/verification/stephenson-iii-ex2-10rpm';
import { wattI10Rpm } from '../../test-data/verification/watt-i-10rpm';
import { compileBodyDocument } from '../../app/model/body-system/constraint-compiler';
import { admitBodyPartition } from '../../app/model/body-system/body-admission';
import {
  advanceBodyCommand,
  initialBodyContinuation,
} from '../../app/model/body-system/body-continuation';
import { solveBodyRates } from '../../app/model/body-system/body-rates';
import { bodyPointRates } from '../../app/model/body-system/body-point-rates';
import { solveFramePoint } from '../../app/model/body-system/body-solve-frame';
import { STILL_BODY_MOTION } from '../../app/model/body-system/simulation-body-context';
import { KinematicsQuantity, VerificationDataset } from '../../test-data/verification/types';

const CASES = [
  { name: 'four-bar', make: teachingLabFourBarFixture, data: teachingLabFourBar1031Rpm },
  { name: 'slider-crank', make: teachingLabSliderCrankFixture, data: teachingLabSliderCrank151Rpm },
  { name: 'Stephenson III', make: stephensonIiiEx2Fixture, data: stephensonIiiEx210Rpm },
  { name: 'Watt I', make: wattIFixture, data: wattI10Rpm },
];
const measurements: object[] = [];
afterAll(() => {
  const directory = resolve('artifacts/bodies-and-joints');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'S3-native-reference-rate-errors.json'),
    JSON.stringify(measurements, null, 2)
  );
});

function compare(
  data: VerificationDataset,
  quantity: KinematicsQuantity,
  actual: number,
  expected: number
) {
  const tolerance = data.tolerances[quantity],
    error = Math.abs(actual - expected);
  expect(Number.isFinite(actual)).toBe(true);
  expect(error).toBeLessThanOrEqual(tolerance.abs + tolerance.rel * Math.abs(expected));
  return error;
}

describe('native point and angular rates against frozen MATLAB answers', () => {
  for (const example of CASES)
    it(example.name + ': all published samples, both construction orders', () => {
      const data = example.data;
      let worstVelocity = 0,
        worstAcceleration = 0,
        worstOmega = 0,
        worstAlpha = 0,
        count = 0;
      for (const reverse of [false, true]) {
        const native = nativePositionReferenceFixture(example.make()),
          source = native.document;
        const document = reverse
          ? {
              ...source,
              bodies: [...source.bodies].reverse(),
              joints: [...source.joints].reverse(),
              attachments: [...source.attachments].reverse(),
            }
          : source;
        const compiled = compileBodyDocument(document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        const system = compiled.system,
          admitted = admitBodyPartition(system, system.partitions[0]);
        if (!admitted.ok) throw new Error(admitted.reason);
        let state = initialBodyContinuation(admitted),
          command = 0,
          previousAngle = data.samples[0].inputAngleRad;
        expect(previousAngle).toBeCloseTo(native.initialAngle, 10);
        for (const [index, sample] of data.samples.entries()) {
          command += Math.atan2(
            Math.sin(sample.inputAngleRad - previousAngle),
            Math.cos(sample.inputAngleRad - previousAngle)
          );
          previousAngle = sample.inputAngleRad;
          const advanced = advanceBodyCommand(admitted, state, command);
          if (!advanced.ok) throw new Error(sample.sampleId + ': ' + advanced.reason);
          state = advanced.state;
          // These four frozen datasets contain no excluded or singular rate samples.
          expect(sample.eligibility).toBe('eligible');
          const rates = solveBodyRates(
            admitted.frame.partition,
            state.poses,
            new Map([
              [
                native.driver.id,
                {
                  value: command,
                  velocity: sample.inputDirection * data.inputSpeedRadS,
                  acceleration: 0,
                },
              ],
            ]),
            new Map(admitted.frame.partition.boundary.map((id) => [id, STILL_BODY_MOTION]))
          );
          if (!rates.ok) throw new Error(sample.sampleId + ': ' + rates.reason);
          for (const [id, velocities] of Object.entries(data.jointVel)) {
            const witness = native.witnesses.get(
              example.name === 'slider-crank' && id === 'E' ? 'B' : id
            );
            expect(witness, id).toBeDefined();
            const anchor = system.attachments.get(witness!)!,
              motion = rates.motions.get(anchor.groupId)!;
            const point = bodyPointRates(
              state.poses.get(anchor.groupId)!,
              solveFramePoint(admitted.frame, anchor.groupId, anchor.point),
              motion
            )!;
            const [vx, vy] = velocities[index],
              [ax, ay] = data.jointAcc[id][index];
            worstVelocity = Math.max(
              worstVelocity,
              compare(data, 'jointVel', point.velocity.x, vx),
              compare(data, 'jointVel', point.velocity.y, vy)
            );
            worstAcceleration = Math.max(
              worstAcceleration,
              compare(data, 'jointAcc', point.acceleration.x, ax),
              compare(data, 'jointAcc', point.acceleration.y, ay)
            );
            count++;
          }
          for (const [id, omegas] of Object.entries(data.linkAngVel)) {
            // MATLAB's slider-crank E coincides with B; its BCE material body is the native BC.
            const body = native.bodies.get(
              example.name === 'slider-crank' && id === 'BCE' ? 'BC' : id
            );
            expect(body, id).toBeDefined();
            const motion = rates.motions.get(system.groupOf.get(body!)!)!;
            worstOmega = Math.max(
              worstOmega,
              compare(data, 'linkAngVel', motion.velocity.omega, omegas[index])
            );
            worstAlpha = Math.max(
              worstAlpha,
              compare(data, 'linkAngAcc', motion.acceleration.alpha, data.linkAngAcc[id][index])
            );
          }
        }
      }
      measurements.push({
        name: example.name,
        samples: example.data.samples.length,
        pointComparisons: count,
        worstVelocity,
        worstAcceleration,
        worstOmega,
        worstAlpha,
      });
    });
});
