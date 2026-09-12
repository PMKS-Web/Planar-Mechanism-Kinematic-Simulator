import { SolverExplanationService } from './solver-explanation.service';
import { LinearSystemExplanation } from '../model/mechanism/solver-explanation';
import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import { PositionSolver } from '../model/mechanism/position-solver';
import { MODEL_SCALE } from '../model/render-scale';
import {
  buildMechanismFixture,
  LOOPLESS_WELDED_MECHANISM,
} from '../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';
import { ellipticalCrankFixture } from '../../test-utils/verification/slot-fixtures';

function balances(system: LinearSystemExplanation) {
  expect(system.unknowns.length).toBe(system.x.length);
  expect(system.rows.length).toBe(system.A.length);
  system.A.forEach((row, i) => {
    expect(row.length).toBe(system.x.length);
    const total = row.reduce((sum, a, j) => sum + a * system.x[j], 0);
    expect(Math.abs(total - system.b[i]) / Math.max(1, Math.abs(system.b[i]))).toBeLessThan(1e-6);
  });
}

describe('SolverExplanationService: explanations of the actual solve', () => {
  const service = new SolverExplanationService();

  for (const mode of ['static', 'dynamic'] as const) {
    it(`matches the cached ${mode} force solution and balances every drawn load`, () => {
      const mechanism = buildMechanismFixture(
        fixturePayload(teachingLabFourBarFixture())
      ).mechanism;
      for (const step of [0, 30, 90]) {
        const cached = mechanism.getForceAnalysis(mode).frames[step];
        const { frame, system } = service.forceAt(mechanism, step, mode);
        expect(frame.status).toBe('ok');
        expect(frame.inputEffort?.valueSI).toBeCloseTo(cached.inputEffort!.valueSI, 7);
        expect(frame.jointReactionsByLink).toEqual(cached.jointReactionsByLink);
        expect(frame.explanation!.bodies.length).toBe(3);
        balances(system!);
        balances(frame.explanation!.system);
        for (const body of frame.explanation!.bodies) {
          const sum = body.loads.reduce(
            (total, load) => {
              total[0] += load.vector[0];
              total[1] += load.vector[1];
              // Fixture is in cm; solver moment arms are converted to meters.
              total[2] +=
                load.couple ??
                ((load.point[0] - body.center[0]) * load.vector[1] -
                  (load.point[1] - body.center[1]) * load.vector[0]) *
                  0.01;
              return total;
            },
            [0, 0, 0]
          );
          body.inertia
            .slice(0, body.rowCount)
            .forEach((inertia, axis) => expect(sum[axis]).toBeCloseTo(inertia, 5));
        }
      }
    });
  }

  it('captures ordered loop systems without changing the angular solution', () => {
    const mechanism = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
    for (const step of [0, 45, 120]) {
      mechanism.prepareSolvers();
      KinematicsSolver.resetVariables();
      KinematicsSolver.determineKinematics(
        mechanism.joints[step],
        mechanism.links[step],
        mechanism.inputAngularVelocities[step]
      );
      const velocities = new Map(KinematicsSolver.linkAngVelMap);
      const accelerations = new Map(KinematicsSolver.linkAngAccMap);
      const result = service.kinematicsAt(mechanism, step);
      expect(result.route).toBe('loops');
      balances(result.velocity!);
      balances(result.acceleration!);
      expect(KinematicsSolver.linkAngVelMap).toEqual(velocities);
      expect(KinematicsSolver.linkAngAccMap).toEqual(accelerations);
      expect(KinematicsSolver.captureExplanation).toBe(false);
    }
  });

  it('shows the two geometric candidates and preserves the plan across other solves', () => {
    const mechanism = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
    const plan = structuredClone(mechanism.positionExplanation);
    buildMechanismFixture(TEMPLATE_LINKAGES.Slider_Crank);
    expect(mechanism.positionExplanation).toEqual(plan);
    for (const step of [0, 45, 120]) {
      const circles = service.circlesAt(mechanism, step);
      expect(circles.length).toBeGreaterThan(0);
      for (const circle of circles) {
        expect(circle.residual).toBeLessThan(1e-6);
        expect(circle.candidates.length).toBe(2);
        for (const [x, y] of circle.candidates) {
          expect(Math.hypot(x - circle.a.x, y - circle.a.y)).toBeCloseTo(circle.r0, 5);
          expect(Math.hypot(x - circle.b.x, y - circle.b.y)).toBeCloseTo(circle.r1, 5);
        }
        const nearest =
          Math.min(
            ...circle.candidates.map(([x, y]) => Math.hypot(x - circle.point.x, y - circle.point.y))
          ) / MODEL_SCALE;
        expect(nearest).toBeLessThan(1e-6);
      }
    }
  });

  it('does not leave a previous loop matrix on a rigid-body solve', () => {
    service.kinematicsAt(buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism, 0);
    const mechanism = buildMechanismFixture(LOOPLESS_WELDED_MECHANISM).mechanism;
    const result = service.kinematicsAt(mechanism, 0);
    expect(result.route).toBe('rigid-body');
    expect(result.velocity).toBeUndefined();
    expect(result.acceleration).toBeUndefined();
  });

  it('records every joint belonging to a simultaneous position step', () => {
    const mechanism = buildMechanismFixture(fixturePayload(ellipticalCrankFixture())).mechanism;
    expect(service.circlesAt(mechanism, 10)).toEqual([]);
    const together = mechanism.positionExplanation.filter(
      (step) => step.method === 'simultaneousSystem'
    );
    expect(together.map((step) => step.jointId)).toEqual(expect.arrayContaining(['C', 'D', 'E']));
  });

  it('restores a coupled mechanism before explaining its differentiated constraints', () => {
    // Existing solver regression seam: ask a known four-bar to take the coupled route.
    const solver = PositionSolver as unknown as { forceCoupledRoute: boolean };
    solver.forceCoupledRoute = true;
    let mechanism;
    try {
      mechanism = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']).mechanism;
    } finally {
      solver.forceCoupledRoute = false;
    }
    buildMechanismFixture(TEMPLATE_LINKAGES.Slider_Crank);
    expect(mechanism.usesCoupledPositionSolve).toBe(true);
    expect(service.circlesAt(mechanism, 10)).toEqual([]);
    const result = service.kinematicsAt(mechanism, 10);
    expect(result.route).toBe('constraints');
    expect(result.velocity).toBeUndefined();
  });
});
