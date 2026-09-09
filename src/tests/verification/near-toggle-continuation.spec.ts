// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { PositionSolver } from '../../app/model/mechanism/position-solver';

/**
 * How a refused sample is read: as a limit, or as a step taken too boldly.
 *
 * The walk continues from the pose before it, so near a toggle the two roots
 * of the next pose are close together and a whole step can land on the wrong
 * one -- a welded rider back to front, a ram inside out. The acceptance checks
 * catch that and refuse, correctly. What the refusal *means* is the question
 * here: the near root was reachable all along by going a shorter way, so
 * reversing there turns a mechanism round in the middle of travel it has.
 *
 * The other refusals are genuine limits -- circles that no longer reach, a
 * rider at the end of its slot -- and read the same however finely they are
 * approached. Refining at one of those only creeps up on a wall, and spends
 * the sample budget doing it, which is why the two are told apart rather than
 * every refusal being retried.
 *
 * Asked of the decision itself. Producing a real near-toggle wrong-branch
 * landing on demand means steering a solver into one particular pair of roots;
 * what has to hold is the rule, and the rule is right here.
 */
describe('a sample the walk is refused', () => {
  /** Enough of a Mechanism for `solveLookingAhead`, which reads only these. */
  function walker() {
    const mechanism = Object.create(Mechanism.prototype) as Mechanism;
    const empty = mechanism as unknown as { _joints: []; _links: []; _forces: [] };
    empty._joints = [[]] as never;
    empty._links = [[]] as never;
    empty._forces = [[]] as never;
    return mechanism as unknown as {
      solveLookingAhead: (
        at: number,
        angVelDir: boolean,
        baseStep: number,
        jumpLimit: number,
        subdividing: boolean,
        room: number
      ) => { solved: boolean; fraction: number };
    };
  }

  /**
   * Stand in for the solver: refuse until the step is `succeedsAt` of a whole
   * one or finer, and say which kind of refusal it was on the way.
   */
  function refusingUntil(options: { succeedsAt: number; branch: boolean }) {
    const solver = PositionSolver as unknown as {
      determinePositionAnalysis: (...args: unknown[]) => boolean;
      revoluteSampleStep: number;
      refusedOnBranch: boolean;
    };
    const original = solver.determinePositionAnalysis;
    const attempts: number[] = [];
    solver.determinePositionAnalysis = () => {
      const fraction = solver.revoluteSampleStep;
      attempts.push(fraction);
      if (fraction <= options.succeedsAt + 1e-12) {
        solver.refusedOnBranch = false;
        return true;
      }
      solver.refusedOnBranch = options.branch;
      return false;
    };
    return { attempts, restore: () => (solver.determinePositionAnalysis = original) };
  }

  afterEach(() => PositionSolver.resetStaticVariables());

  it('walks the interval at a shorter step when the branch was what was wrong', () => {
    // A quarter of a step is reachable and a whole one is not: the answer is
    // to take a quarter, not to turn round.
    const stub = refusingUntil({ succeedsAt: 0.25, branch: true });
    try {
      const taken = walker().solveLookingAhead(0, true, 1, 1e9, true, 1);
      expect(taken.solved).toBe(true);
      expect(taken.fraction).toBe(0.25);
      // Halves, so the original spacing stays a subset of the samples.
      expect(stub.attempts).toEqual([1, 0.5, 0.25]);
    } finally {
      stub.restore();
    }
  });

  it('and does not, when the refusal was a limit of its travel', () => {
    // The same refusal at the same place, differing only in what it was for.
    // A wall is a wall at every step size, so asking again is wasted work and
    // the sample it would eventually take is a sliver against the wall.
    const stub = refusingUntil({ succeedsAt: 0.25, branch: false });
    try {
      const taken = walker().solveLookingAhead(0, true, 1, 1e9, true, 1);
      expect(taken.solved).toBe(false);
      expect(taken.fraction).toBe(1);
      expect(stub.attempts).toEqual([1]);
    } finally {
      stub.restore();
    }
  });

  it('gives up on a branch it cannot reach, rather than halving forever', () => {
    // Sixty-four cuts, matching the boundary solver's own cap.
    const stub = refusingUntil({ succeedsAt: 0, branch: true });
    try {
      const taken = walker().solveLookingAhead(0, true, 1, 1e9, true, 1);
      expect(taken.solved).toBe(false);
      expect(taken.fraction).toBe(1 / 64);
      expect(stub.attempts.length).toBe(7);
    } finally {
      stub.restore();
    }
  });

  it('leaves a mechanism sampled at fixed spacing alone', () => {
    // Subdivision is what the retry rides on; without it a refusal is a limit
    // whatever it was for, and the verification tables keep their one degree.
    const stub = refusingUntil({ succeedsAt: 0.25, branch: true });
    try {
      const taken = walker().solveLookingAhead(0, true, 1, 1e9, false, 1);
      expect(taken.solved).toBe(false);
      expect(stub.attempts).toEqual([1]);
    } finally {
      stub.restore();
    }
  });
});
