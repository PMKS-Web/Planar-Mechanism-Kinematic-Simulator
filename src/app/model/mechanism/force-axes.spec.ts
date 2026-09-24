import '../joint';
import katex from 'katex';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../../test-utils/verification/fixtures';
import { SolverExplanationService } from '../../services/solver-explanation.service';
import { forceWorksheet } from './force-worksheet';
import { axisCoordinates, forceAxisPairs } from './force-axes';

describe('Force worksheet axes', () => {
  const service = new SolverExplanationService();
  for (const fixture of [teachingLabFourBarFixture, teachingLabSliderCrankFixture])
    for (const mode of ['static', 'dynamic'] as const)
      it(`preserves physical balance in rotated frames: ${fixture.name} ${mode}`, () => {
        const mechanism = buildMechanismFixture(fixturePayload(fixture(true))).mechanism;
        const result = service.forceAt(mechanism, 30, mode, true);
        const args = [result.frame.explanation!, result.system!, mode === 'dynamic'] as const;
        const base = forceWorksheet(...args, {}, {}, mechanism.unit);
        const paired = new Set(forceAxisPairs(args[0]).flat());
        for (const angle of [30, 90, 180, 270]) {
          const signs = Object.fromEntries(
            base.choices.flatMap((c) => c.columns.map((i) => [`${c.key}:${i}`, -1 as const]))
          );
          const refs = Object.fromEntries(base.bodies.map((b) => [b.id, b.points[0].id]));
          const work = forceWorksheet(...args, signs, refs, mechanism.unit, angle);
          work.system.A.forEach((row, i) =>
            expect(row.reduce((s, a, j) => s + a * work.system.x[j], 0)).toBeCloseTo(
              work.system.b[i],
              6
            )
          );
          for (const body of work.bodies) {
            const original = base.bodies.find((b) => b.id === body.id)!;
            const sum = body.loads.reduce(
              (s, l) => [s[0] + l.vector[0], s[1] + l.vector[1]],
              [0, 0]
            );
            const originalSum = original.loads.reduce(
              (s, l) => [s[0] + l.vector[0], s[1] + l.vector[1]],
              [0, 0]
            );
            const expected = axisCoordinates(originalSum, angle);
            sum.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 7));
            sum.forEach((v, i) => expect(v).toBeCloseTo(body.inertia[i], 6));
            const moment = body.loads.reduce(
              (s, l) =>
                s +
                (l.couple !== undefined
                  ? l.couple / 200
                  : ((l.point[0] - body.reference.point[0]) * l.vector[1] -
                      (l.point[1] - body.reference.point[1]) * l.vector[0]) *
                    body.lengthToM),
              0
            );
            if (body.rowCount === 3) expect(moment).toBeCloseTo(body.inertia[2] / 200, 6);
            for (const load of body.loads.filter(
              (l) => l.column !== undefined && l.couple === undefined
            )) {
              if (!paired.has(load.column!) && load.kind === 'reaction')
                expect(load.symbol).toMatch(/_\{n/);
              load.vector.forEach((v, i) =>
                expect(v).toBeCloseTo(
                  load.direction![i] * load.sign! * work.system.x[load.column!],
                  6
                )
              );
            }
            for (const equation of [
              ...body.components.map((e) => e.symbolic),
              ...body.crossProducts.flatMap((p) => [
                p.definition,
                p.determinant,
                p.expansion,
                p.numbers,
                p.distanceComponents,
                p.evaluation,
              ]),
            ])
              expect(() => katex.renderToString(equation, { throwOnError: true })).not.toThrow();
            body.crossProducts
              .filter((p) => !p.zero && p.point !== 'CoM')
              .forEach((p) => {
                expect(p.evaluation).toMatch(/[A-Z]_/);
                expect(p.numbers).not.toContain('\\mathrm N');
              });
          }
        }
      });
});
