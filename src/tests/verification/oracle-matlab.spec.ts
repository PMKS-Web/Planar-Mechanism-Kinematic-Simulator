// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import '../../app/model/joint';
import { mkdirSync, writeFileSync } from 'node:fs';
import { matlabCases } from '../../test-utils/oracle/matlab-cases';
import { MATLAB_DIR } from '../../test-utils/oracle/published-problems';
import { readReference, REPOSITORY_ROOT } from '../../test-utils/oracle/reference';
import { KinematicsQuantity } from '../../test-data/verification/types';

// The third side of the triangle. The MATLAB v1 tables check PMKS+
// (verification/*.spec.ts) and the oracle checks PMKS+ (oracle.spec.ts); this
// checks the oracle against MATLAB, with no PMKS+ code between them: the
// problems are read straight from the fixtures that transcribe the MATLAB
// models (fixture-problem.ts). Each table is compared to the tolerance it
// carries for itself, the precision MATLAB claims for its own numbers.

type Vec = [number, number];

/** What `registerDynamicsSuite` holds PMKS+ to against the same tables. */
const MATLAB_DYNAMICS_TOLERANCE = { abs: 1e-3, rel: 5e-3 };

const worst: Record<string, { share: number; at: string }> = {};

describe('the oracle against the MATLAB v1 tables', () => {
  afterAll(() => {
    mkdirSync(`${REPOSITORY_ROOT}/artifacts/oracle`, { recursive: true });
    writeFileSync(
      `${REPOSITORY_ROOT}/artifacts/oracle/matlab.json`,
      JSON.stringify(worst, null, 1)
    );
  });
  for (const { dataset, problem } of matlabCases()) {
    it(dataset.name, () => {
      const reference = readReference(
        `${REPOSITORY_ROOT}/${MATLAB_DIR}/${problem.id}.reference.json`
      );
      const sweep = reference.sweep!;
      expect(sweep, 'the oracle runs it').not.toBeNull();
      const perTurn = Math.round((2 * Math.PI) / sweep.step);
      const period = sweep.closesAfterTurns ? perTurn * sweep.closesAfterTurns : undefined;
      const indexOf = new Map(sweep.samples.k.map((k, i) => [k, i]));
      const angle0 = dataset.samples[0].inputAngleRad;
      const s = sweep.samples;
      const firstBodyAt = (joint: string): string | undefined => {
        const found = problem.joints.find((j) => j.id === joint);
        if (!found) return undefined;
        return found.kind === 'pin' ? found.bodies[0] : found.riders[0];
      };
      const failures: string[] = [];
      let compared = 0;
      let rows = 0;
      let unwrapped = 0;
      let previous = angle0;

      dataset.samples.forEach((sample, row) => {
        unwrapped += Math.atan2(
          Math.sin(sample.inputAngleRad - previous),
          Math.cos(sample.inputAngleRad - previous)
        );
        previous = sample.inputAngleRad;
        if (sample.eligibility !== 'eligible') return;
        let k = Math.round(unwrapped / sweep.step);
        if (period) k = ((k % period) + period) % period;
        const i = indexOf.get(k);
        if (i === undefined) return;
        rows++;
        const direction = sample.inputDirection;
        const check = (
          quantity: KinematicsQuantity,
          part: string,
          expected: number[] | undefined,
          actual: Vec,
          peak: number
        ): void => {
          if (!expected) return;
          const tolerance = dataset.tolerances[quantity];
          const error = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
          compared++;
          const share = error / (tolerance.abs + tolerance.rel * peak);
          if (share > (worst[dataset.name]?.share ?? -1)) {
            worst[dataset.name] = { share, at: `${quantity} ${part} row ${row}` };
          }
          if (error > tolerance.abs + tolerance.rel * peak && failures.length < 10) {
            failures.push(
              `${quantity} ${part} row ${row} (k=${k}): off by ${error.toExponential(2)}`
            );
          }
        };
        const dynamic = (
          quantity: string,
          part: string,
          expected: number[],
          actual: Vec,
          peak: number
        ): void => {
          const error = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
          const allowed = MATLAB_DYNAMICS_TOLERANCE.abs + MATLAB_DYNAMICS_TOLERANCE.rel * peak;
          compared++;
          const share = error / allowed;
          const key = `${dataset.name} dynamics`;
          if (share > (worst[key]?.share ?? -1)) {
            worst[key] = { share, at: `${quantity} ${part} row ${row}` };
          }
          if (error > allowed && failures.length < 10) {
            failures.push(
              `${quantity} ${part} row ${row} (k=${k}): off by ${error.toExponential(2)}`
            );
          }
        };
        const peakOf = (series: number[][]): number =>
          Math.max(...series.map((v) => Math.hypot(v[0], v[1] ?? 0)));
        const signed = (v: Vec): Vec => [v[0] * direction, v[1] * direction];
        for (const [id, series] of Object.entries(dataset.jointPos)) {
          const oracle = s.points[id];
          if (!oracle) continue;
          check('jointPos', id, series[row], oracle.pos[i], peakOf(series));
          const vel = dataset.jointVel[id];
          if (vel) check('jointVel', id, vel[row], signed(oracle.vel[i]), peakOf(vel));
          const acc = dataset.jointAcc[id];
          if (acc) check('jointAcc', id, acc[row], oracle.acc[i], peakOf(acc));
        }
        for (const [id, series] of Object.entries(dataset.linkCoMPos)) {
          const body = s.bodies[id];
          if (!body) continue;
          check('linkCoMPos', id, series[row], body.com[i], peakOf(series));
          const vel = dataset.linkCoMVel[id];
          if (vel) check('linkCoMVel', id, vel[row], signed(body.comVel[i]), peakOf(vel));
          const acc = dataset.linkCoMAcc[id];
          if (acc) check('linkCoMAcc', id, acc[row], body.comAcc[i], peakOf(acc));
        }
        for (const [id, series] of Object.entries(dataset.linkAngVel)) {
          const body = s.bodies[id];
          if (!body) continue;
          const peak = Math.max(...series.map(Math.abs));
          check('linkAngVel', id, [series[row], 0], [body.omega[i] * direction, 0], peak);
          const acc = dataset.linkAngAcc[id];
          if (acc) {
            check(
              'linkAngAcc',
              id,
              [acc[row], 0],
              [body.alpha[i], 0],
              Math.max(...acc.map(Math.abs))
            );
          }
        }
        // The MATLAB dynamics, with gravity: the force each joint exerts on the
        // first link listed there, and the input torque. Compared to the
        // tolerance the MATLAB dynamics specs use (suites.ts), because the
        // tables carry none of their own for forces.
        const dynamics = dataset.dynamics?.grav;
        if (dynamics) {
          const forces = s.forces.dynamic;
          for (const [joint, series] of Object.entries(dynamics.jointForce)) {
            const first = firstBodyAt(joint);
            const oracle = first ? forces.reactions[joint]?.[first] : undefined;
            if (!oracle) {
              failures.push(`no oracle reaction at ${joint} on its first link`);
              continue;
            }
            dynamic('jointForce', joint, series[row], oracle[i], peakOf(series));
          }
          const torque = forces.effort[i];
          if (torque !== null) {
            dynamic(
              'torque',
              'input',
              [dynamics.torque[row], 0],
              [torque, 0],
              Math.max(...dynamics.torque.map(Math.abs))
            );
          }
        }
      });
      expect(rows, 'rows on the stored grid').toBeGreaterThan(5);
      expect(compared).toBeGreaterThan(0);
      expect(failures, 'outside the MATLAB tolerance').toEqual([]);
    });
  }
});
