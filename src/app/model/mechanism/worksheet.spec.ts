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
import { kinematicWorksheet } from './kinematic-worksheet';

const typesets = (equation: string) =>
  expect(() => katex.renderToString(equation, { throwOnError: true })).not.toThrow();
describe('Worked derivations', () => {
  const service = new SolverExplanationService();
  it('writes joint-based force symbols, opposite reactions, and valid equations for every body', () => {
    const mechanism = buildMechanismFixture(fixturePayload(teachingLabFourBarFixture())).mechanism;
    const result = service.forceAt(mechanism, 30, 'dynamic');
    const work = forceWorksheet(result.frame.explanation!, result.system!, true);
    expect(work.system.unknowns[0].label).toBe('A_{x}');
    const first = work.bodies.find((b) => b.id.includes('A'))!;
    const middle = work.bodies.find((b) => b.id.startsWith('BC'))!;
    expect(first.forceDefinitions.find((equation) => equation.includes('\\vec{F}_{B}'))).toContain(
      'B_{x}'
    );
    expect(middle.forceDefinitions.find((equation) => equation.includes('\\vec{F}_{B}'))).toContain(
      '-B_{x}'
    );
    expect(first.forceDefinitions.find((equation) => equation.includes('\\vec{F}_{B}'))).toContain(
      `^{(${first.id})}`
    );
    for (const row of first.forceComponentEquations) {
      expect(row.vector).toContain(`^{(${first.id})}`);
      expect(row.vector.split('=').at(-1)).toBe(row.scalar.split('=').at(-1));
      expect(row.scalar).not.toContain('\\vec');
    }
    expect(middle.momentVector).not.toContain('-\\left[');
    expect(work.coefficientMatrix).toHaveLength(work.system.A.length);
    work.coefficientMatrix.forEach((row, i) => {
      expect(row).toHaveLength(work.system.unknowns.length);
      row.forEach((coefficient, j) => {
        typesets(coefficient);
        if (coefficient === '0') expect(Math.abs(work.system.A[i][j])).toBeLessThan(1e-12);
      });
    });
    expect(work.coefficientMatrix.flat().some((coefficient) => coefficient.includes('r_{'))).toBe(
      true
    );
    expect(work.knownTerms).toHaveLength(work.system.b.length);
    work.knownTerms.forEach(typesets);
    expect(work.knownTerms.some((term) => term.includes('W_{'))).toBe(true);
    for (const body of work.bodies) {
      expect(body.forceVector).toMatch(/^\\sum\\vec F=/);
      expect(body.momentVector).toMatch(/^\\sum\\vec M_/);
      body.momentDefinitions.forEach((equation) => {
        expect(equation).toContain('\\begin{bmatrix}0\\\\0\\\\');
        expect(equation).toContain(',z}');
      });
      expect(body.momentVector).not.toContain('-\\left[');
      typesets(body.forceVector);
      typesets(body.momentVector);
      body.forceComponentEquations.flatMap((row) => [row.vector, row.scalar]).forEach(typesets);
      body.forceDefinitions.forEach(typesets);
      body.momentDefinitions.forEach(typesets);
      body.positionDefinitions.forEach(typesets);
      for (const row of body.components) {
        typesets(row.symbolic);
        typesets(row.values);
        typesets(row.knownSymbolic);
        expect(row.values.match(/=/g)).toHaveLength(2);
        typesets(row.collected);
        typesets(row.substitution);
      }
    }
  });
  it('lists known force inputs in the selected axes and moment reference', () => {
    const mechanism = buildMechanismFixture(fixturePayload(teachingLabFourBarFixture())).mechanism;
    const result = service.forceAt(mechanism, 30, 'dynamic', true);
    const trace = result.frame.explanation!;
    const body = trace.bodies[0];
    const base = forceWorksheet(trace, result.system!, true, {}, {}, mechanism.unit);
    const rotated = forceWorksheet(
      trace,
      result.system!,
      true,
      {},
      { [body.id]: body.points[0].id },
      mechanism.unit,
      90
    );
    const baseValues = base.bodies[0].knownValues;
    const rotatedValues = rotated.bodies[0].knownValues;
    expect(baseValues.some((row) => row.symbol.startsWith('r_{'))).toBe(true);
    expect(baseValues.some((row) => row.symbol.startsWith('m_{'))).toBe(true);
    expect(baseValues.some((row) => row.symbol.startsWith('I_{'))).toBe(true);
    expect(baseValues.some((row) => row.symbol.startsWith('a_{'))).toBe(true);
    expect(baseValues.some((row) => row.symbol.startsWith('\\alpha_{'))).toBe(true);
    const weight = `\\vec{W}_{${body.id}}`;
    expect(rotatedValues.find((row) => row.symbol === weight)?.value).not.toBe(
      baseValues.find((row) => row.symbol === weight)?.value
    );
    expect(rotatedValues.some((row) => row.symbol.includes(`/${body.points[0].id}`))).toBe(true);
    rotatedValues.forEach((row) => {
      typesets(row.symbol);
      typesets(row.value);
    });
  });
  it('derives all joint and center-of-mass rates from rigid-body relative motion', () => {
    const mechanism = buildMechanismFixture(fixturePayload(teachingLabFourBarFixture())).mechanism;
    const work = kinematicWorksheet(mechanism, 45, service.kinematicsAt(mechanism, 45));
    expect(work.points.length).toBe(mechanism.joints[0].length - 2);
    expect(work.centers.length).toBe(3);
    for (const point of [...work.points, ...work.centers]) {
      const { vs, as, omega, alpha, dx, dy, v, acc } = point;
      expect(v![0]).toBeCloseTo(vs![0] - omega! * dy * 200, 5);
      expect(v![1]).toBeCloseTo(vs![1] + omega! * dx * 200, 5);
      expect(acc![0]).toBeCloseTo(as![0] - (alpha! * dy + omega! ** 2 * dx) * 200, 5);
      expect(acc![1]).toBeCloseTo(as![1] + (alpha! * dx - omega! ** 2 * dy) * 200, 5);
      for (const equation of [
        point.velocity,
        point.acceleration,
        point.radius,
        point.velocityNumbers,
        point.accelerationNumbers,
      ])
        typesets(equation);
    }
    for (const loop of work.loops)
      for (const equation of [
        loop.position,
        loop.velocity,
        loop.acceleration,
        loop.velocityExpanded,
        loop.accelerationExpanded,
        ...loop.velocityRows,
        ...loop.accelerationRows,
      ])
        typesets(equation);
  });
  it('finds both circle–guide roots for a slider without using a finite slope', () => {
    const mechanism = buildMechanismFixture(
      fixturePayload(teachingLabSliderCrankFixture())
    ).mechanism;
    for (const step of [0, 30, 75]) {
      const constructions = service.circleLinesAt(mechanism, step);
      expect(constructions.length).toBeGreaterThan(0);
      for (const c of constructions) {
        expect(c.residual).toBeLessThan(1e-6);
        expect(c.candidates.length).toBe(2);
        for (const [x, y] of c.candidates) {
          expect(Math.hypot(x - c.center.x, y - c.center.y)).toBeCloseTo(c.radius, 5);
          expect((x - c.origin.x) * -c.u[1] + (y - c.origin.y) * c.u[0]).toBeCloseTo(0, 5);
        }
      }
    }
  });
});
