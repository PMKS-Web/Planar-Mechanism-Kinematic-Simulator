import '../joint';
import katex from 'katex';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import { teachingLabFourBarFixture } from '../../../test-utils/verification/fixtures';
import { jansenLegFixture } from '../../../test-utils/verification/library-fixtures';
import { SolverExplanationService } from '../../services/solver-explanation.service';
import { forceWorksheet } from './force-worksheet';
import { labelApplicationPoints } from './force-reference';
import {
  defaultWorksheetLoops,
  replaceWorksheetLoop,
  reverseWorksheetLoop,
} from './worksheet-loops';
import { worksheetLoopOptions } from './worksheet-loop-options';
import { matLeastSquares } from '../utils';
import { ForceExplanation } from './solver-explanation';
import { offsetLoadFourBarFixture } from '../../../test-utils/verification/force-fixtures';

const service = new SolverExplanationService();
const build = () => buildMechanismFixture(fixturePayload(teachingLabFourBarFixture())).mechanism;

describe('Visual force references and loop choices', () => {
  for (const mode of ['static', 'dynamic'] as const) {
    it(`keeps physical forces while independently changing X/Y signs and every moment reference (${mode})`, () => {
      const mechanism = build();
      const result = service.forceAt(mechanism, 30, mode);
      const trace = result.frame.explanation!;
      const base = forceWorksheet(
        trace,
        result.system!,
        mode === 'dynamic',
        {},
        {},
        mechanism.unit
      );
      const choice = base.choices.find((c) => c.label === 'Joint B')!;
      const xcol = choice.columns[0];
      const convention = { [`${choice.key}:${xcol}`]: -1 as const };
      const flipped = forceWorksheet(
        trace,
        result.system!,
        mode === 'dynamic',
        convention,
        {},
        mechanism.unit
      );
      base.system.x.forEach((x, i) => expect(flipped.system.x[i]).toBe(i === xcol ? -x : x));
      for (const original of base.bodies.filter((b) => b.rowCount === 3)) {
        for (const point of original.referenceOptions) {
          const work = forceWorksheet(
            trace,
            result.system!,
            mode === 'dynamic',
            convention,
            { [original.id]: point.id },
            mechanism.unit
          );
          const body = work.bodies.find((b) => b.id === original.id)!;
          expect(body.reference.id).toBe(point.id);
          expect(work.system.x).toEqual(flipped.system.x);
          const solved = matLeastSquares(
            work.system.A.map((r) => [...r]),
            work.system.b.map((v) => [v])
          );
          solved.forEach((row, i) => expect(row[0]).toBeCloseTo(work.system.x[i], 5));
          // Independently total the physical moments at the chosen point, including known loads.
          const moment = body.loads.reduce(
            (sum, load) =>
              sum +
              (load.couple !== undefined
                ? load.couple / 200
                : ((load.point[0] - point.point[0]) * load.vector[1] -
                    (load.point[1] - point.point[1]) * load.vector[0]) *
                  body.lengthToM),
            0
          );
          expect(moment).toBeCloseTo(body.inertia[2] / 200, 5);
          const dx = (original.center[0] - point.point[0]) * body.lengthToM;
          const dy = (original.center[1] - point.point[1]) * body.lengthToM;
          expect(body.inertia[2] / 200).toBeCloseTo(
            original.inertia[2] / 200 + dx * original.inertia[1] - dy * original.inertia[0],
            8
          );
          body.loads.forEach((load, i) => expect(load.vector).toEqual(original.loads[i].vector));
          const equations = [
            body.forceVector,
            body.momentVector,
            ...body.components.flatMap((r) => [r.symbolic, r.collected, r.substitution]),
            ...body.crossProducts.flatMap((p) => [
              p.definition,
              p.determinant,
              p.expansion,
              p.numbers,
              p.evaluation,
            ]),
          ];
          equations.forEach((eq) =>
            expect(() => katex.renderToString(eq, { throwOnError: true })).not.toThrow()
          );
          if (point.id === 'B')
            expect(body.crossProducts.find((p) => p.point === 'B')!.zero).toBe(true);
        }
      }
      expect(base.bodies[0].referenceOptions.map((p) => p.id)).toContain('H');
      expect(flipped.bodies[0].crossProducts.find((p) => p.point === 'B')!.definition).toContain(
        '-B_{x}'
      );
    });
  }
  it('balances an offset applied load about its named application point', () => {
    const mechanism = buildMechanismFixture(fixturePayload(offsetLoadFourBarFixture())).mechanism;
    const result = service.forceAt(mechanism, 30, 'dynamic');
    const work = forceWorksheet(
      result.frame.explanation!,
      result.system!,
      true,
      {},
      { CDL: 'P1' },
      mechanism.unit
    );
    const body = work.bodies.find((b) => b.id === 'CDL')!;
    expect(body.reference.id).toBe('P1');
    expect(body.crossProducts.find((p) => p.point === 'P1')!.zero).toBe(true);
    expect(body.momentVector).not.toContain('F}_{P1}');
    body.crossProducts.forEach((p) =>
      [p.definition, p.determinant, p.expansion, p.numbers, p.evaluation].forEach((eq) =>
        expect(() => katex.renderToString(eq, { throwOnError: true })).not.toThrow()
      )
    );
    const moment = body.loads.reduce(
      (sum, load) =>
        sum +
        (load.couple !== undefined
          ? load.couple / 200
          : ((load.point[0] - body.reference.point[0]) * load.vector[1] -
              (load.point[1] - body.reference.point[1]) * load.vector[0]) *
            body.lengthToM),
      0
    );
    expect(moment).toBeCloseTo(body.inertia[2] / 200, 5);
    work.system.A.forEach((row, i) =>
      expect(row.reduce((sum, a, j) => sum + a * work.system.x[j], 0)).toBeCloseTo(
        work.system.b[i],
        5
      )
    );
  });
  it('labels applied forces without moving them or colliding with existing point names', () => {
    const mechanism = build();
    const trace = service.forceAt(mechanism, 30, 'static').frame.explanation!;
    // Exercise the naming boundary on an existing solver trace, without introducing a new mechanism.
    const body = trace.bodies[0];
    const copy: ForceExplanation = {
      ...trace,
      bodies: [
        {
          ...body,
          points: [...body.points, { id: 'P1', x: 0, y: 0 }],
          loads: [
            ...body.loads,
            { kind: 'applied', label: 'Load', point: [12, 34], vector: [8, -3] },
          ],
        },
      ],
    };
    const load = labelApplicationPoints(copy).bodies[0].loads.at(-1)!;
    expect(load.applicationId).toBe('P2');
    expect(load.point).toEqual([12, 34]);
    expect(copy.bodies[0].loads.at(-1)!.applicationId).toBeUndefined();
  });
  it('offers valid alternative loops and disables dependent choices', () => {
    const mechanism = buildMechanismFixture(fixturePayload(jansenLegFixture())).mechanism;
    const basis = defaultWorksheetLoops(mechanism.requiredLoops);
    const menu = worksheetLoopOptions(mechanism, basis, 1);
    expect(menu.limited).toBe(false);
    expect(menu.options.find((o) => o.value === 'A → B → C → E → D → A')?.disabled).toBe(false);
    expect(menu.options.find((o) => o.value === basis[0].id)?.disabled).toBe(true);
    menu.options
      .filter((o) => !o.disabled)
      .forEach((o) =>
        expect(replaceWorksheetLoop(mechanism, basis, 1, o.value).reason).toBeUndefined()
      );
    const reversed = basis.map(reverseWorksheetLoop);
    expect(
      worksheetLoopOptions(mechanism, reversed, 1).options.find((o) => o.value === reversed[1].id)
        ?.disabled
    ).toBe(false);
  });
});
