import '../joint';
import katex from 'katex';
import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { fixturePayload } from '../../../test-utils/verification/fixture-gallery';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../../test-utils/verification/fixtures';
import { jansenLegFixture } from '../../../test-utils/verification/library-fixtures';
import { SolverExplanationService } from '../../services/solver-explanation.service';
import { WorksheetPreferencesService } from '../../services/worksheet-preferences.service';
import { forceWorksheet } from './force-worksheet';
import { kinematicWorksheet } from './kinematic-worksheet';
import {
  defaultWorksheetLoops,
  replaceWorksheetLoop,
  reverseWorksheetLoop,
} from './worksheet-loops';
import { LinearSystemExplanation } from './solver-explanation';
import { matLeastSquares } from '../utils';

const build = (fixture: ReturnType<typeof teachingLabFourBarFixture>) =>
  buildMechanismFixture(fixturePayload(fixture)).mechanism;
const inspect = new SolverExplanationService();
function solves(system: LinearSystemExplanation) {
  const result = matLeastSquares(
    system.A.map((r) => [...r]),
    system.b.map((v) => [v])
  );
  result.forEach((row, i) => expect(row[0]).toBeCloseTo(system.x[i], 6));
  system.A.forEach((row, i) =>
    expect(row.reduce((sum, a, j) => sum + a * system.x[j], 0)).toBeCloseTo(system.b[i], 6)
  );
}
function typesets(equations: string[]) {
  equations.forEach((e) =>
    expect(() => katex.renderToString(e, { throwOnError: true })).not.toThrow()
  );
}

describe('Worksheet equation conventions', () => {
  for (const mode of ['static', 'dynamic'] as const) {
    it(`reverses shared reactions and input moments consistently in ${mode} analysis`, () => {
      const mechanism = build(teachingLabFourBarFixture());
      const result = inspect.forceAt(mechanism, 30, mode);
      const trace = result.frame.explanation!,
        original = JSON.stringify(trace);
      const base = forceWorksheet(trace, result.system!, mode === 'dynamic');
      const choice = base.choices.find((c) => c.label === 'Joint B')!;
      const flipped = forceWorksheet(trace, result.system!, mode === 'dynamic', {
        [choice.key]: -1,
      });
      solves(flipped.system);
      base.system.x.forEach((x, i) =>
        expect(flipped.system.x[i]).toBe(choice.columns.includes(i) ? -x : x)
      );
      expect(flipped.bodies[0].forceVector).toContain('-\\vec{F}_{B}');
      expect(flipped.bodies[1].forceVector).toContain('\\vec{F}_{B}');
      flipped.bodies.forEach((body, i) => {
        body.loads.forEach((load, j) => {
          expect(load.vector).toEqual(base.bodies[i].loads[j].vector);
          expect(load.couple).toEqual(base.bodies[i].loads[j].couple);
        });
        typesets([
          body.forceVector,
          body.momentVector,
          ...body.components.flatMap((c) => [c.symbolic, c.collected, c.substitution]),
        ]);
      });
      for (const group of base.choices) {
        const one = forceWorksheet(trace, result.system!, mode === 'dynamic', { [group.key]: -1 });
        solves(one.system);
      }
      expect(JSON.stringify(trace)).toBe(original);
    });
  }
  it('reverses a guide-normal reference without changing the physical slider reaction', () => {
    const mechanism = build(teachingLabSliderCrankFixture());
    const result = inspect.forceAt(mechanism, 30, 'dynamic');
    const base = forceWorksheet(result.frame.explanation!, result.system!, true);
    for (const choice of base.choices) {
      const flipped = forceWorksheet(result.frame.explanation!, result.system!, true, {
        [choice.key]: -1,
      });
      solves(flipped.system);
    }
  });
  it('reverses a closed loop and angular convention independently for both derivatives', () => {
    const mechanism = build(teachingLabFourBarFixture());
    const rates = inspect.kinematicsAt(mechanism, 30);
    const loops = defaultWorksheetLoops(mechanism.requiredLoops);
    const reversed = loops.map(reverseWorksheetLoop);
    const work = kinematicWorksheet(mechanism, 30, rates, reversed, -1);
    solves(work.velocity!);
    solves(work.acceleration!);
    expect(work.velocity!.x).toEqual(rates.velocity!.x.map((n) => -n));
    expect(work.acceleration!.x).toEqual(rates.acceleration!.x.map((n) => -n));
    expect(reverseWorksheetLoop(reversed[0])).toEqual(loops[0]);
    for (const loop of work.loops)
      typesets([
        loop.position,
        loop.velocityExpanded,
        loop.accelerationExpanded,
        ...loop.velocityRows,
        ...loop.accelerationRows,
      ]);
    for (const point of [...work.points, ...work.centers])
      typesets([
        point.velocity,
        point.acceleration,
        point.velocityNumbers,
        point.accelerationNumbers,
      ]);
  });
  it('changes to an alternative independent Jansen loop, including an internal closed path', () => {
    const mechanism = build(jansenLegFixture());
    const basis = defaultWorksheetLoops(mechanism.requiredLoops);
    expect(basis.length).toBe(3);
    for (const path of ['O A D E C G O', 'A B C E D A']) {
      const result = replaceWorksheetLoop(mechanism, basis, 1, path);
      expect(result.reason).toBeUndefined();
      const chosen = basis.map((loop, i) => (i === 1 ? result.loop! : loop));
      for (const step of [0, 30, 90]) {
        const rates = inspect.kinematicsAt(mechanism, step);
        const work = kinematicWorksheet(mechanism, step, rates, chosen);
        solves(work.velocity!);
        solves(work.acceleration!);
        expect(work.velocity!.x).toEqual(rates.velocity!.x);
        expect(work.acceleration!.x).toEqual(rates.acceleration!.x);
        const edges = work.loops[1].edges;
        expect(edges.reduce((sum, edge) => sum + edge.to.x - edge.from.x, 0)).toBeCloseTo(0, 8);
        expect(edges.reduce((sum, edge) => sum + edge.to.y - edge.from.y, 0)).toBeCloseTo(0, 8);
      }
    }
  });
  it('uses different angular directions on different links, including the known input', () => {
    const mechanism = build(teachingLabFourBarFixture());
    const rates = inspect.kinematicsAt(mechanism, 30);
    const work = kinematicWorksheet(mechanism, 30, rates, undefined, 1, { ABH: -1, BCFG: -1 });
    for (const name of ['velocity', 'acceleration'] as const) {
      solves(work[name]!);
      work[name]!.unknowns.forEach((u, i) =>
        expect(work[name]!.x[i]).toBe(
          u.label.endsWith('_BCFG') ? -rates[name]!.x[i] : rates[name]!.x[i]
        )
      );
    }
    expect(work.loops[0].velocityExpanded).toContain('\\left(-\\vec{\\omega}_{ABH}\\right)');
    expect(work.loops[0].velocityExpanded).not.toContain('\\left(-\\vec{\\omega}_{CDEI}\\right)');
  });
  it('rejects disconnected, unclosed, repeated, and dependent paths without altering the basis', () => {
    const mechanism = build(jansenLegFixture());
    const basis = defaultWorksheetLoops(mechanism.requiredLoops),
      original = JSON.stringify(basis);
    for (const path of ['O A B', 'O missing G O', 'O C O', 'O A B A O', basis[0].id])
      expect(replaceWorksheetLoop(mechanism, basis, 1, path).reason).toBeTruthy();
    expect(JSON.stringify(basis)).toBe(original);
  });
  it('shares choices across worksheet instances while isolating mechanisms and reset', () => {
    const a = build(teachingLabFourBarFixture()),
      b = build(teachingLabFourBarFixture());
    const preferences = new WorksheetPreferencesService();
    preferences.setForce(a, 'reaction', -1);
    preferences.setAngular(a, -1);
    preferences.reverseLoop(a, 0);
    expect(preferences.get(a).forces['reaction']).toBe(-1);
    expect(preferences.get(a).angular).toBe(-1);
    expect(preferences.get(b).angular).toBe(1);
    expect(preferences.get(b).forces).toEqual({});
    preferences.reset(a);
    expect(preferences.get(a).angular).toBe(1);
    expect(preferences.get(a).forces).toEqual({});
    expect(preferences.get(a).loops).toEqual(defaultWorksheetLoops(a.requiredLoops));
  });
});
