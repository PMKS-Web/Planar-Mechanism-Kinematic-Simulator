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
  reachSpan: (system: SimultaneousSystem, from: number, to: number, restore: () => void) => boolean;
  refusalKind: string;
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

describe('a rider sitting in its slot back to front', () => {
  // The slot runs along x between P and Q; the rider stands square to it, so
  // the angle the weld was captured at is a right angle.
  const system: SimultaneousSystem = {
    unknownIds: ['W', 'F'],
    constraints: [{ kind: 'fixedAngle', a1: 'W', a2: 'F', b1: 'P', b2: 'Q', sin: 1, cos: 0 }],
  };
  const square = new Map<string, number[]>([
    ['P', [0, 0]],
    ['Q', [1, 0]],
    ['W', [0, 0]],
    ['F', [0, 1]],
  ]);

  it('satisfies the row exactly, the same as standing the right way up', () => {
    // A `fixedAngle` row vanishes at the captured angle and again half a turn
    // from it. Both of these are exact answers, not near ones -- which is why
    // no tightening of the solver could ever tell them apart.
    const turned = new Map(square);
    turned.set('F', [0, -1]);
    for (const pose of [square, turned]) {
      for (const value of residuals(system, pose, 0)) {
        expect(Math.abs(value)).toBeLessThan(1e-12);
      }
    }
  });

  it('is refused when the sample is accepted', () => {
    solver.resetStaticVariables();
    solver.simultaneousSystem = system;

    solver.jointMapPositions = new Map(square);
    expect(solver.headingsHeld()).toBe(true);

    solver.jointMapPositions.set('F', [0, -1]);
    expect(solver.headingsHeld()).toBe(false);
    solver.resetStaticVariables();
  });

  it('and refused whichever way the slot itself is drawn', () => {
    // The slot's own two joints can be listed either way round; the rider is
    // no more back to front for that, and no less.
    solver.resetStaticVariables();
    solver.simultaneousSystem = {
      unknownIds: ['W', 'F'],
      constraints: [{ kind: 'fixedAngle', a1: 'W', a2: 'F', b1: 'Q', b2: 'P', sin: -1, cos: 0 }],
    };

    solver.jointMapPositions = new Map(square);
    expect(solver.headingsHeld()).toBe(true);

    solver.jointMapPositions.set('F', [0, -1]);
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

describe('a commanded ram that settles on the wrong root', () => {
  // `cylinderBetween` lays the fixture out at a mark radius of 0.15, which is
  // what an object scale of 1 means; the stroke bounds are read from the live
  // scale, so the two have to be talking about the same ram.
  let previousScale = 0;
  beforeEach(() => {
    previousScale = SettingsService.objectScale;
    SettingsService._objectScale.next(1);
  });
  afterEach(() => {
    SettingsService._objectScale.next(previousScale);
    solver.resetStaticVariables();
  });

  /**
   * The ram's interior as a system, with its two mounts prescribed.
   *
   * The barrel's buried end sits on the axis at its own length from the mount,
   * which is two places: in front of the mount, where the part is, and behind
   * it, where every row is just as happy. That second root is the one a step
   * taken too boldly lands on.
   */
  function interior() {
    solver.resetStaticVariables();
    const parts = ram();
    solver.registerSealedCylinders(parts.joints);
    const barrel = parts.barrelNear.x;
    const rod = parts.rodFar.x - parts.pin.x;
    const system: SimultaneousSystem = {
      unknownIds: ['B', 'C', 'P'],
      constraints: [
        { kind: 'distance', a: 'A', b: 'B', length: barrel },
        { kind: 'onFixedLine', point: 'B', at: [0, 0], dir: [1, 0] },
        { kind: 'distance', a: 'C', b: 'D', length: rod },
        { kind: 'onFixedLine', point: 'C', at: [0, 0], dir: [1, 0] },
        { kind: 'coincident', a: 'C', b: 'P' },
      ],
    };
    solver.simultaneousSystem = system;
    const seated = new Map(parts.joints.map((joint) => [joint.id, [joint.x, joint.y]]));
    solver.jointMapPositions = new Map(seated);
    return { parts, system, barrel, seated };
  }

  it('is refused rather than accepted, on the path a command actually takes', () => {
    // Stated first and on its own: before this, the commanded continuation
    // asked only whether the numbers converged. They do, on both roots.
    const { system, barrel } = interior();
    solver.jointMapPositions.set('B', [-barrel, 0]);

    const settled = (
      solver as unknown as {
        settledOnItsBranch: (s: SimultaneousSystem, at: number) => boolean;
      }
    ).settledOnItsBranch(system, 10);

    expect(settled).toBe(false);
    expect(solver.refusalKind).toBe('branch');
  });

  it('walks the interval again in shorter steps, and keeps what that finds', () => {
    // The whole retry, through the real `reachSpan`. The first attempt is
    // seeded on the far root and lands there; the restore that follows every
    // rejected attempt puts the solver back where the sample began, and the
    // subdivided walk from there stays on the near one.
    //
    // Seeding the bad root rather than arriving at it is the arranged part,
    // and it is the only part: a step long enough to cross between two roots
    // half a mechanism apart is not something a fixture can be asked for on
    // demand. What is being shown is that the commanded path now asks the
    // question, refuses on it, and recovers -- which it did not.
    const { system, barrel, seated } = interior();
    solver.jointMapPositions.set('B', [-barrel, 0]);

    const reached = solver.reachSpan(system, 10, 10, () => {
      solver.jointMapPositions = new Map(seated);
    });

    expect(reached).toBe(true);
    expect(solver.jointMapPositions.get('B')![0]).toBeCloseTo(barrel, 9);
  });

  it('and accepts the near root without any of that when it is already on it', () => {
    const { system, barrel, seated } = interior();
    let restored = 0;

    const reached = solver.reachSpan(system, 10, 10, () => {
      restored += 1;
      solver.jointMapPositions = new Map(seated);
    });

    expect(reached).toBe(true);
    expect(restored).toBe(0);
    expect(solver.jointMapPositions.get('B')![0]).toBeCloseTo(barrel, 9);
  });
});
