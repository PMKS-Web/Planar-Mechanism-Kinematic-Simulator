// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../test-utils/verification/fixtures';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { RevJoint } from '../../app/model/joint';

/**
 * Which solver a drawing is handed to, and what happens when it is refused.
 *
 * The coupled route exists because the walk has no primitive for a ram
 * attached at a mount, and would place every joint anyway -- quietly violating
 * a weld and reporting nothing. Two things follow that are easy to get wrong
 * and invisible when they are: the route has to be reached whatever kind of
 * actuator drives the mechanism, and a drawing it refuses must not then be
 * handed to the walk, which is the one path it was chosen to avoid.
 */

const solver = PositionSolver as unknown as {
  forceCoupledRoute: boolean;
  jointNumOrderSolverMap: Map<number, string[]>;
  desiredAnalysisJointMap: Map<string, string>;
  unsolvableJoints: string[];
  stepCount: number;
  resetStaticVariables: () => void;
  routeCoupled: (joints: unknown[], links: unknown[], orderNum: number, known: string[]) => void;
};

/** The steps the walk planned, as `how` for each target set. */
function plannedSteps(): string[] {
  return [...solver.jointNumOrderSolverMap].map(
    ([, ids]) => solver.desiredAnalysisJointMap.get(ids[0]) ?? '?'
  );
}

function builtCoupled(fixture: MechanismFixture) {
  solver.forceCoupledRoute = true;
  try {
    const built = buildMechanism(fixture);
    return { built, steps: plannedSteps(), unsolvable: [...solver.unsolvableJoints] };
  } finally {
    solver.forceCoupledRoute = false;
  }
}

describe('every actuator family reaches the coupled route', () => {
  const families: { name: string; fixture: () => MechanismFixture }[] = [
    // A grounded crank: the input step places its body, and everything else
    // goes to the constraint set against that moving boundary.
    { name: 'a grounded crank', fixture: () => teachingLabFourBarFixture() },
    // A driven ram commands a length rather than stepping a neighbor, so it
    // registers as a drive and used to walk the deferred joints and return
    // before the route was ever asked about -- which is the commonest
    // arrangement this route exists for.
    { name: 'a driven ram', fixture: () => cylinderBoomFixture(MODEL_SCALE) },
  ];

  for (const { name, fixture } of families) {
    it(`solves ${name} as one system`, () => {
      const { built, steps } = builtCoupled(fixture());

      // One coupled step, and it is the last thing planned. A grounded input
      // still places its own body first -- that is the moving boundary the
      // system is solved against -- but nothing else may be walked.
      expect(steps.filter((how) => how === 'simultaneousSystem')).toHaveLength(1);
      expect(steps[steps.length - 1]).toBe('simultaneousSystem');
      const placementSteps = ['incrementRevInput', 'incrementPrisInput', 'simultaneousSystem'];
      expect(steps.filter((how) => !placementSteps.includes(how))).toEqual([]);
      expect(built.mechanism.isMechanismValid()).toBe(true);
    });

    it(`and gets the same cycle out of ${name} either way`, () => {
      const walked = buildMechanism(fixture()).mechanism;
      const { built } = builtCoupled(fixture());
      expect(built.mechanism.joints.length).toBe(walked.joints.length);
    });
  }
});

describe('a drawing the coupled route refuses', () => {
  it('is reported unsolvable rather than handed to the walk', () => {
    // The control flow on its own: `orderCoupledPartition` refuses a set of
    // unknowns it has no rows for, and the answer has to be "this cannot be
    // solved" rather than a quiet fall-through to ordinary ordering.
    solver.resetStaticVariables();
    // A joint on nothing: it is an unknown, and no link anywhere writes a row
    // that mentions it, so the constraints cannot determine it.
    const loose = new RevJoint('Z', 1, 2);

    solver.routeCoupled([loose as never], [], 1, []);

    expect(solver.unsolvableJoints).toContain('Z');
    expect(solver.stepCount).toBe(0);
    expect(plannedSteps()).toEqual([]);
    solver.resetStaticVariables();
  });
});

describe('two machines in one drawing, analyzed one after the other', () => {
  it('puts the coupled one back on its own route before answering for it', () => {
    // Every one of these solvers is static, so the last mechanism built owns
    // them. A drawing holds several machines and the panel graphs whichever
    // the reader is looking at, which is routinely not the last one solved --
    // so a machine's own route has to be something it can be put back on.
    // Left stale, a coupled machine standing beside an ordinary one is asked
    // for its rates as though it had been walked, and answered out of the loop
    // formulation that has no equation for its shape.
    //
    // Asked of the route itself rather than of the numbers, because the
    // mechanisms that can be built today have a loop answer that *agrees*: the
    // whole of `coupled-route-agreement` is that they do. A drawing where the
    // two disagree is the one this route exists for and cannot be drawn yet,
    // so the guard has to be on the record rather than on a discrepancy
    // nothing can currently produce.
    const solverAt = PositionSolver as unknown as {
      forceCoupledRoute: boolean;
      coupledRoute: boolean;
    };
    solverAt.forceCoupledRoute = true;
    let coupled: Mechanism;
    try {
      coupled = buildMechanism(teachingLabFourBarFixture()).mechanism;
    } finally {
      solverAt.forceCoupledRoute = false;
    }
    expect(solverAt.coupledRoute).toBe(true);

    // The neighbor, solved over the top of it.
    buildMechanism(teachingLabSliderCrankFixture());
    expect(solverAt.coupledRoute).toBe(false);

    coupled.prepareSolvers();
    expect(solverAt.coupledRoute).toBe(true);

    // And it still answers, which is the reason any of that matters.
    KinematicsSolver.resetVariables();
    coupled.prepareSolvers();
    KinematicsSolver.determineKinematics(
      coupled.joints[1],
      coupled.links[1],
      coupled.inputAngularVelocities[1]
    );
    for (const joint of coupled.joints[1]) {
      const velocity = KinematicsSolver.jointVelMap.get(joint.id);
      expect(velocity, `no velocity at ${joint.id}`).toBeDefined();
      expect(velocity!.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('a coupled partition whose rates cannot be found', () => {
  it('is left without them rather than handed to the loop solver', () => {
    // The loop formulation cannot express these drawings any better than the
    // walk can place them -- that is why their positions did not come from the
    // walk either. Falling through to it would not be a cheaper answer to the
    // same question; it would be a confident answer to a different one, drawn
    // as a curve on the graph the reader is looking at.
    const walked = buildMechanism(teachingLabFourBarFixture()).mechanism;
    const rates = PositionSolver as unknown as {
      constraintKinematics: (...args: unknown[]) => unknown;
      coupledRoute: boolean;
    };
    const original = rates.constraintKinematics;
    /** Every joint the rate solver came away with an answer for. */
    const answered = (coupled: boolean): number => {
      rates.constraintKinematics = () => undefined;
      rates.coupledRoute = coupled;
      try {
        KinematicsSolver.resetVariables();
        KinematicsSolver.requiredLoops = walked.requiredLoops;
        KinematicsSolver.determineKinematics(walked.joints[1], walked.links[1], 1);
        return [...KinematicsSolver.jointVelMap.values()].filter(
          (velocity) => Math.hypot(velocity[0], velocity[1]) > 1e-9
        ).length;
      } finally {
        rates.constraintKinematics = original;
        rates.coupledRoute = false;
      }
    };

    // Stated as a pair, because "nothing came back" is only meaningful beside
    // the run that shows something would have.
    expect(answered(false)).toBeGreaterThan(0);
    expect(answered(true)).toBe(0);
  });
});

describe('the command the admission gate judges a drawing at', () => {
  it('reads an angular drive as an angle, not as nothing', () => {
    // `drivenAngle` is a signed angle at a pivot; read as zero -- which is
    // what omitting it amounted to -- every row of a perfectly ordinary crank
    // looks unsatisfied, and the gate refuses a mechanism for standing
    // somewhere it is not. A unit arm out at a right angle is the case: it
    // satisfies its rows and has full rank there, and at zero it has neither.
    const solverAt = PositionSolver as unknown as {
      commandOf: (system: unknown, positions: Map<string, number[]>) => number;
    };
    const positions = new Map([
      ['P', [0, 0]],
      ['R', [1, 0]],
      ['D', [0, 1]],
    ]);
    const system = {
      unknownIds: ['D'],
      constraints: [{ kind: 'drivenAngle', pivot: 'P', reference: 'R', driven: 'D' }],
    };

    expect(solverAt.commandOf(system, positions)).toBeCloseTo(Math.PI / 2, 12);

    // Signed, and measured the way the row measures it.
    positions.set('D', [0, -1]);
    expect(solverAt.commandOf(system, positions)).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('still reads a length drive as a length', () => {
    const solverAt = PositionSolver as unknown as {
      commandOf: (system: unknown, positions: Map<string, number[]>) => number;
    };
    const positions = new Map([
      ['A', [1, 1]],
      ['B', [4, 5]],
    ]);
    const system = { unknownIds: ['B'], constraints: [{ kind: 'driven', a: 'A', b: 'B' }] };
    expect(solverAt.commandOf(system, positions)).toBeCloseTo(5, 12);
  });
});
