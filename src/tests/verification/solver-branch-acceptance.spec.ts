// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { residuals, SimultaneousSystem } from '../../app/model/mechanism/simultaneous-solver';
import { ram } from '../../test-utils/cylinder-graph';
import { SettingsService } from '../../app/services/settings.service';

/**
 * Two poses a constraint set is perfectly happy with and a reader would call
 * broken.
 *
 * A numerical solver accepts anything whose residuals vanish, and residuals
 * are built from lengths and cross products — neither of which can tell a body
 * from its mirror image, or a ram from the same ram assembled inside out.
 * Every length is still right in both. So the *branch* is a separate question
 * from the residual, and it has to be asked separately, which is what these
 * two checks do at the point a sample is accepted.
 */

const solver = PositionSolver as unknown as {
  jointMapPositions: Map<string, number[]>;
  simultaneousSystem?: SimultaneousSystem;
  cylinderInteriorMap: Map<string, unknown>;
  registerSealedCylinders: (joints: unknown) => unknown;
  cylindersAreIntact: () => boolean;
  headingsHeld: () => boolean;
  resetStaticVariables: () => void;
};

describe('a welded heading that has turned end for end', () => {
  const dir: [number, number] = [1, 0];
  const system: SimultaneousSystem = {
    unknownIds: ['B'],
    constraints: [
      { kind: 'distance', a: 'A', b: 'B', length: 4 },
      { kind: 'fixedDirection', a1: 'A', a2: 'B', dir },
    ],
  };

  it('satisfies every row, which is why the row alone cannot refuse it', () => {
    // Stated first because it is the reason the check exists: the flipped
    // pose is not an approximate answer the solver would drift away from, it
    // is an exact one.
    const flipped = new Map([
      ['A', [0, 0]],
      ['B', [-4, 0]],
    ]);
    for (const value of residuals(system, flipped, 0)) {
      expect(Math.abs(value)).toBeLessThan(1e-12);
    }
  });

  it('is refused when the sample is accepted', () => {
    solver.resetStaticVariables();
    solver.simultaneousSystem = system;

    solver.jointMapPositions = new Map([
      ['A', [0, 0]],
      ['B', [4, 0]],
    ]);
    expect(solver.headingsHeld()).toBe(true);

    solver.jointMapPositions.set('B', [-4, 0]);
    expect(solver.headingsHeld()).toBe(false);
    solver.resetStaticVariables();
  });
});

describe('a ram assembled inside out', () => {
  // `cylinderBetween` lays the fixture out at a mark radius of 0.15, which is
  // what an object scale of 1 means. The stroke bounds the solver records are
  // read from the *live* scale, so the two have to be talking about the same
  // ram or the bounds describe a different part entirely.
  let previousScale = 0;
  beforeEach(() => {
    previousScale = SettingsService.objectScale;
    SettingsService._objectScale.next(1);
  });
  afterEach(() => {
    SettingsService._objectScale.next(previousScale);
  });

  /** The ram's own five joints, as the solver holds them. */
  function seated() {
    solver.resetStaticVariables();
    const parts = ram();
    solver.registerSealedCylinders(parts.joints);
    solver.jointMapPositions = new Map(parts.joints.map((joint) => [joint.id, [joint.x, joint.y]]));
    return parts;
  }

  it('is intact as drawn', () => {
    seated();
    expect(solver.cylindersAreIntact()).toBe(true);
    solver.resetStaticVariables();
  });

  it('is refused when the head has gone behind its own mount', () => {
    // Every length still right: the barrel is its own length from the mount
    // and the rod its own length from the far one. What is wrong is the order
    // along the axis, and only the order.
    const parts = seated();
    const behind = -parts.barrelNear.x;
    solver.jointMapPositions.set('B', [behind, 0]);
    solver.jointMapPositions.set('C', [behind, 0]);
    solver.jointMapPositions.set('P', [behind, 0]);

    expect(solver.cylindersAreIntact()).toBe(false);
    solver.resetStaticVariables();
  });

  it('is refused when the rod reaches back past its own mount', () => {
    const parts = seated();
    solver.jointMapPositions.set('C', [parts.rodFar.x + 2, 0]);
    solver.jointMapPositions.set('P', [parts.rodFar.x + 2, 0]);

    expect(solver.cylindersAreIntact()).toBe(false);
    solver.resetStaticVariables();
  });
});
