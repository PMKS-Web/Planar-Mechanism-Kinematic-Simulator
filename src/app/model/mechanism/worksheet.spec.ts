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
    expect(middle.momentVector).not.toContain('-\\left[');
    for (const body of work.bodies) {
      expect(body.momentVector).not.toContain('-\\left[');
      typesets(body.forceVector);
      typesets(body.momentVector);
      body.forceComponentEquations.forEach(typesets);
      body.forceDefinitions.forEach(typesets);
      body.momentDefinitions.forEach(typesets);
      body.positionDefinitions.forEach(typesets);
      for (const row of body.components) {
        typesets(row.symbolic);
        typesets(row.collected);
        typesets(row.substitution);
      }
    }
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
