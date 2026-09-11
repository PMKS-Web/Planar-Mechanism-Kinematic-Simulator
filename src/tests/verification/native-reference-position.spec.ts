import '../../app/model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  stephensonIiiEx2Fixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import {
  guidedRodOnALinkFixture,
  invertedSliderCrankFixture,
  offsetPivotLeverFixture,
} from '../../test-utils/verification/slot-fixtures';
import { nativePositionReferenceFixture } from '../../test-utils/verification/native-position-reference-fixture';
import { doubleButterflyFixture } from '../../test-utils/verification/classic-fixtures';
import { compileBodyDocument } from '../../app/model/body-system/constraint-compiler';
import { admitBodyPartition } from '../../app/model/body-system/body-admission';
import {
  advanceBodyCommand,
  initialBodyContinuation,
} from '../../app/model/body-system/body-continuation';
import { localToWorld } from '../../app/model/body-system/body-frame';
import { solveFramePoint } from '../../app/model/body-system/body-solve-frame';
import { wattI10Rpm } from '../../test-data/verification/watt-i-10rpm';
import { stephensonIiiEx210Rpm } from '../../test-data/verification/stephenson-iii-ex2-10rpm';
import { teachingLabFourBar1031Rpm } from '../../test-data/verification/teaching-lab-four-bar-10-31rpm';
import { teachingLabSliderCrank151Rpm } from '../../test-data/verification/teaching-lab-slider-crank-15-1rpm';

const measurements: object[] = [];
afterAll(() => {
  const directory = resolve('artifacts/bodies-and-joints');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, 'S2-native-reference-errors.json'),
    JSON.stringify(measurements, null, 2)
  );
});

const CASES = [
  { name: 'four-bar', make: teachingLabFourBarFixture, matlab: teachingLabFourBar1031Rpm },
  {
    name: 'slider-crank',
    make: teachingLabSliderCrankFixture,
    matlab: teachingLabSliderCrank151Rpm,
  },
  { name: 'Stephenson III', make: stephensonIiiEx2Fixture, matlab: stephensonIiiEx210Rpm },
  { name: 'Watt I', make: wattIFixture, matlab: wattI10Rpm },
  { name: 'inverted slider-crank', make: invertedSliderCrankFixture },
  { name: 'guided rod', make: guidedRodOnALinkFixture },
  { name: 'offset-pivot lever', make: offsetPivotLeverFixture },
  { name: 'double butterfly', make: doubleButterflyFixture },
];

function solveReference(fixture: MechanismFixture, reversed: boolean) {
  const native = nativePositionReferenceFixture(fixture);
  const doc = native.document;
  const compiled = compileBodyDocument(
    reversed
      ? {
          ...doc,
          bodies: [...doc.bodies].reverse(),
          attachments: [...doc.attachments].reverse(),
          joints: [...doc.joints].reverse(),
        }
      : doc
  );
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  expect(compiled.system.partitions).toHaveLength(1);
  const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
  if (!admitted.ok) throw new Error(`Admission: ${admitted.reason}`);
  expect(admitted.mobility.dof).toBe(1);
  let state = initialBodyContinuation(admitted);
  return {
    native,
    at(command: number) {
      const next = advanceBodyCommand(admitted, state, command);
      if (!next.ok) throw new Error(`Advance ${state.command} -> ${command}: ${next.reason}`);
      state = next.state;
      return new Map(
        [...native.witnesses].map(([id, witness]) => {
          const a = compiled.system.attachments.get(witness)!;
          const local = localToWorld(
            state.poses.get(a.groupId)!,
            solveFramePoint(admitted.frame, a.groupId, a.point)
          );
          return [
            id,
            { x: local.x + admitted.frame.origin.x, y: local.y + admitted.frame.origin.y },
          ];
        })
      );
    },
  };
}

describe('native positions against frozen references', () => {
  for (const example of CASES) {
    it(`${example.name}: every legacy sample on the same commanded branch, both array orders`, () => {
      const fixture = example.make();
      const old = buildMechanism(fixture).mechanism;
      expect(old.isMechanismValid()).toBe(true);
      expect(old.joints.length).toBeGreaterThan(10);
      let worst = 0;
      let diagnostic: unknown;
      for (const reversed of [false, true]) {
        const solver = solveReference(fixture, reversed);
        let angle = solver.native.initialAngle;
        let prior = angle;
        for (const sample of old.joints) {
          const origin = sample.find((point) => point.id === solver.native.input)!;
          const tip = sample.find((point) => point.id === solver.native.crankTip)!;
          const heading = Math.atan2(tip.y - origin.y, tip.x - origin.x);
          angle += Math.atan2(Math.sin(heading - prior), Math.cos(heading - prior));
          prior = heading;
          // Align the coordinate actually retained by the rounded legacy crank, not its
          // nominal degree counter: repeated rounded rotations can drift from that counter.
          const actual = solver.at(angle - solver.native.initialAngle);
          for (const point of sample) {
            const native = actual.get(point.id);
            expect(native, `missing ${point.id}`).toBeDefined();
            const error = Math.hypot(native!.x - point.x, native!.y - point.y);
            if (error > worst) {
              worst = error;
              diagnostic = {
                id: point.id,
                command: angle - solver.native.initialAngle,
                native,
                legacy: { x: point.x, y: point.y },
                lengths: fixture.links.map((link) => {
                  const a = sample.find((p) => p.id === link.joints[0])!;
                  return {
                    link: link.joints,
                    distances: [...link.joints].slice(1).map((id) => {
                      const b = sample.find((p) => p.id === id)!;
                      const aa = fixture.joints.find((p) => p.id === a.id)!;
                      const bb = fixture.joints.find((p) => p.id === b.id)!;
                      return (
                        Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(bb.x - aa.x, bb.y - aa.y)
                      );
                    }),
                  };
                }),
              };
            }
          }
        }
      }
      measurements.push({
        reference: 'legacy',
        name: example.name,
        samples: old.joints.length,
        worst,
        diagnostic,
      });
      expect(worst).toBeLessThan(1e-3);
    });

    if (example.matlab)
      it(`${example.name}: every MATLAB position at its published input angle`, () => {
        const data = example.matlab!;
        const solver = solveReference(example.make(), false);
        let worst = 0,
          count = 0;
        let command = 0,
          prior = data.samples[0].inputAngleRad;
        expect(prior).toBeCloseTo(solver.native.initialAngle, 10);
        for (const [index, sample] of data.samples.entries()) {
          command += Math.atan2(
            Math.sin(sample.inputAngleRad - prior),
            Math.cos(sample.inputAngleRad - prior)
          );
          prior = sample.inputAngleRad;
          const actual = solver.at(command);
          for (const [id, values] of Object.entries(data.jointPos)) {
            // MATLAB's slider-crank E is a sensor at B (the source fixture documents this alias).
            const point = actual.get(example.name === 'slider-crank' && id === 'E' ? 'B' : id);
            expect(point, `missing ${id}`).toBeDefined();
            const [x, y] = values[index];
            worst = Math.max(worst, Math.hypot(point!.x - x, point!.y - y));
            count++;
          }
        }
        measurements.push({
          reference: 'MATLAB',
          name: example.name,
          samples: data.samples.length,
          points: count,
          worst,
        });
        // The original six-bar regression's absolute ceiling is retained for every mechanism.
        expect(worst).toBeLessThan(0.01);
      });
  }
});
