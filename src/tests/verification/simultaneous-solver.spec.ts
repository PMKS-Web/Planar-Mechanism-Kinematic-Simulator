import {
  Constraint,
  SimultaneousSystem,
  commandDerivative,
  jacobian,
  residuals,
  solveSimultaneous,
} from '../../app/model/mechanism/simultaneous-solver';
import { circleCircleIntersection } from '../../app/model/utils';

// A numerical solver cannot be verified by the constraints it was given: it
// satisfies those by construction, and a wrong answer that satisfies them is
// exactly the failure mode worth catching. So it is checked here against
// geometry it was never told about.
//
// The elliptical trammel is the instrument. A bar with one end on the x axis
// and the other on the y axis carries every point of itself around an ellipse:
// with the bar of length L and the point d from the end on the x axis,
//
//   Rx = p (L - d) / L,  Ry = q d / L,  p^2 + q^2 = L^2
//   =>  Rx^2 / (L - d)^2  +  Ry^2 / d^2  =  1
//
// Nothing in the constraint set mentions an ellipse. If the solver has found
// the mechanism's actual poses, the traced point satisfies that equation; if it
// has found some other set of points that happens to satisfy the constraints,
// it does not.

const L = 10;
const D = 3;

const trammel = (): SimultaneousSystem => ({
  // P slides on the x axis, Q on the y axis, R rides the bar between them.
  unknownIds: ['P', 'Q', 'R'],
  constraints: [
    { kind: 'onFixedLine', point: 'P', at: [0, 0], dir: [1, 0] },
    { kind: 'onFixedLine', point: 'Q', at: [0, 0], dir: [0, 1] },
    { kind: 'distance', a: 'P', b: 'Q', length: L },
    { kind: 'distance', a: 'R', b: 'P', length: D },
    { kind: 'onLine', point: 'R', from: 'P', to: 'Q' },
    { kind: 'driven', a: 'P', b: 'ORIGIN' },
  ],
});

function seededTrammel(): Map<string, number[]> {
  // Started somewhere legal and unremarkable: p = 6, q = 8.
  const positions = new Map<string, number[]>([['ORIGIN', [0, 0]]]);
  positions.set('P', [6, 0]);
  positions.set('Q', [0, 8]);
  positions.set('R', [6 * (1 - D / L), (8 * D) / L]);
  return positions;
}

describe('the simultaneous solver', () => {
  it('traces the ellipse a trammel traces, which it was never told about', () => {
    const system = trammel();
    const positions = seededTrammel();

    // Walk the bar's end along the axis and check the carried point every step.
    for (let p = 6; p >= 1; p -= 0.25) {
      expect(solveSimultaneous(system, positions, p)).toBe(true);
      const [rx, ry] = positions.get('R')!;
      // To within the solver's own convergence: it stops when every residual is
      // under 1e-6 of a length, and a length of ~10 carries that through as
      // about a part in ten million of the ellipse equation.
      const onEllipse = (rx * rx) / ((L - D) * (L - D)) + (ry * ry) / (D * D);
      expect(Math.abs(onEllipse - 1)).toBeLessThan(1e-6);
    }
    // And the far end really did stay on its own axis the whole way.
    expect(positions.get('Q')![0]).toBeCloseTo(0, 9);
  });

  it('lands on the same point the analytic dyad does', () => {
    // Two lengths from two known joints is the one case both this solver and
    // the ordering walk can do, so the two have to agree exactly.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 5 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [4, 3]],
    ]);

    expect(solveSimultaneous(system, positions, 6)).toBe(true);

    const analytic = circleCircleIntersection(0, 0, 5, 8, 0, 6);
    expect(analytic).toBeTruthy();
    const [bx, by] = positions.get('B')!;
    // Whichever of the two intersections is the one the seed was nearest.
    const nearest = (analytic as number[][]).reduce((best, point) =>
      Math.hypot(point[0] - 4, point[1] - 3) < Math.hypot(best[0] - 4, best[1] - 3) ? point : best
    );
    expect(Math.abs(bx - nearest[0])).toBeLessThan(1e-6);
    expect(Math.abs(by - nearest[1])).toBeLessThan(1e-6);
  });

  it('stays on the branch it started on', () => {
    // The mirror pose satisfies every constraint just as well. Continuity is
    // the only thing that says which one the mechanism is actually in, so a
    // seed below the axis has to stay below it.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 5 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [4, -3]],
    ]);

    for (let target = 6; target <= 9; target += 0.25) {
      expect(solveSimultaneous(system, positions, target)).toBe(true);
      expect(positions.get('B')![1]).toBeLessThan(0);
    }
  });

  it('refuses a command the geometry cannot reach', () => {
    // Two circles that cannot meet. Reporting success here would draw a
    // mechanism pulled apart at the joints.
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'B', b: 'O', length: 2 },
        { kind: 'driven', a: 'B', b: 'C' },
      ],
    };
    const positions = new Map<string, number[]>([
      ['O', [0, 0]],
      ['C', [8, 0]],
      ['B', [2, 0]],
    ]);

    expect(solveSimultaneous(system, positions, 100)).toBe(false);
  });

  it('derives the same Jacobian the residuals actually have', () => {
    // The analytic rows are the reason this solver converges at all near a
    // toggle, and an error in one of them is invisible until a mechanism that
    // needs it stops solving. Checked against central differences, which are
    // accurate enough to catch a wrong term even where they are not accurate
    // enough to solve with.
    expectDerivedJacobian(trammel(), seededTrammel(), 6);
  });

  it('derives the same Jacobian for a rigid offset, in line and out of it', () => {
    // The constraint that exists for bodies whose joints are collinear, where
    // two distances would say one thing twice. Checked both flat and bent,
    // because the flat case is the one whose terms could silently be zero.
    const straight: SimultaneousSystem = {
      unknownIds: ['A', 'B', 'C'],
      constraints: [
        { kind: 'distance', a: 'A', b: 'B', length: 4 },
        { kind: 'rigidOffset', point: 'C', from: 'A', to: 'B', along: 10, across: 0 },
        { kind: 'driven', a: 'A', b: 'ORIGIN' },
      ],
    };
    // A on a circle about the origin, B four away from it, C ten along the same
    // ray. Nothing axis-aligned, so no term drops out by accident.
    const along = (from: number[], distance: number) => [
      from[0] + distance * 0.6,
      from[1] + distance * 0.8,
    ];
    const a = [3, 1];
    const flat = new Map<string, number[]>([
      ['ORIGIN', [0, 0]],
      ['A', a],
      ['B', along(a, 4)],
      ['C', along(a, 10)],
    ]);
    expectDerivedJacobian(straight, flat, Math.hypot(a[0], a[1]));

    const bent: SimultaneousSystem = {
      ...straight,
      constraints: straight.constraints.map((c) =>
        c.kind === 'rigidOffset' ? { ...c, across: 2.5 } : c
      ),
    };
    const offLine = new Map(flat);
    offLine.set('C', [along(a, 10)[0] - 2.5 * 0.8, along(a, 10)[1] + 2.5 * 0.6]);
    expectDerivedJacobian(bent, offLine, Math.hypot(a[0], a[1]));
  });
});

describe('the heading a weld holds against a grounded guide', () => {
  /**
   * A rider welded to a block on a world-fixed guide. Nothing in the drawing
   * points along that guide except the guide itself, so the row carries the
   * heading rather than borrowing two joints from the world to name it —
   * inventing joints to express an angle is how a solver acquires freedoms
   * nobody drew.
   */
  function weldedOnAGuide(dir: [number, number]): SimultaneousSystem {
    return {
      unknownIds: ['A', 'B'],
      constraints: [
        { kind: 'distance', a: 'A', b: 'B', length: 4 },
        { kind: 'fixedDirection', a1: 'A', a2: 'B', dir },
      ],
    };
  }

  it('reads as the far end’s distance off the heading it is held at', () => {
    const held: [number, number] = [1, 0];
    const straight = new Map([
      ['A', [0, 0]],
      ['B', [4, 0]],
    ]);
    expect(residuals(weldedOnAGuide(held), straight, 0)[1]).toBeCloseTo(0, 12);

    // Swung a little off the heading: the row is how far the far end has gone
    // round, in model units, like every other row.
    const angle = 0.05;
    const swung = new Map([
      ['A', [0, 0]],
      ['B', [4 * Math.cos(angle), 4 * Math.sin(angle)]],
    ]);
    expect(residuals(weldedOnAGuide(held), swung, 0)[1]).toBeCloseTo(4 * Math.sin(angle), 12);
  });

  it('derives the same Jacobian a central difference does, at any heading', () => {
    // Both a flat heading and an oblique one: a term that is silently zero
    // along an axis is exactly what a flat-only check would miss.
    for (const theta of [0, 0.7, Math.PI / 2, 2.4]) {
      const dir: [number, number] = [Math.cos(theta), Math.sin(theta)];
      const positions = new Map([
        ['A', [1, -2]],
        ['B', [1 + 4 * Math.cos(theta + 0.03), -2 + 4 * Math.sin(theta + 0.03)]],
      ]);
      expectDerivedJacobian(weldedOnAGuide(dir), positions, 0);
    }
  });

  it('carries a body along its guide without letting it turn', () => {
    // The point of the row, as a solve rather than as an assertion about
    // rows. `A` is the moving boundary here and not an unknown: with both
    // ends free the system is short a row and the assembly can translate
    // anywhere along the guide, so nudging one end only moves the seed and
    // the answer proves nothing.
    const dir: [number, number] = [Math.cos(0.6), Math.sin(0.6)];
    const system: SimultaneousSystem = {
      unknownIds: ['B'],
      constraints: [
        { kind: 'distance', a: 'A', b: 'B', length: 4 },
        { kind: 'fixedDirection', a1: 'A', a2: 'B', dir },
      ],
    };
    const positions = new Map([
      ['A', [0, 0]],
      ['B', [4 * dir[0], 4 * dir[1]]],
    ]);

    // The boundary moves; the welded body has to follow it exactly.
    positions.set('A', [1.5, 0]);
    expect(solveSimultaneous(system, positions, 0)).toBe(true);

    const [ax, ay] = positions.get('A')!;
    const [bx, by] = positions.get('B')!;
    expect(ax).toBe(1.5);
    expect(ay).toBe(0);
    expect(bx).toBeCloseTo(1.5 + 4 * dir[0], 6);
    expect(by).toBeCloseTo(4 * dir[1], 6);
    // The heading itself, and the *sign* of it: a cross product of zero is
    // equally happy with the body turned end for end, so the branch has to be
    // asserted rather than assumed.
    expect((bx - ax) * dir[1] - (by - ay) * dir[0]).toBeCloseTo(0, 9);
    expect((bx - ax) * dir[0] + (by - ay) * dir[1]).toBeGreaterThan(0);
  });

  it('is one row of a determined system when something drives it', () => {
    // Four rows, four unknown coordinates: the guide holds `A` to its line, a
    // drive says how far along it has come, the weld holds the heading, and
    // the bar holds its length. Nothing here is free.
    const dir: [number, number] = [Math.cos(-0.4), Math.sin(-0.4)];
    const system: SimultaneousSystem = {
      unknownIds: ['A', 'B'],
      constraints: [
        { kind: 'onFixedLine', point: 'A', at: [0, 0], dir: [1, 0] },
        { kind: 'driven', a: 'G', b: 'A' },
        { kind: 'fixedDirection', a1: 'A', a2: 'B', dir },
        { kind: 'distance', a: 'A', b: 'B', length: 4 },
      ],
    };
    const positions = new Map([
      ['G', [-2, 0]],
      ['A', [0, 0]],
      ['B', [4 * dir[0], 4 * dir[1]]],
    ]);

    // Commanded three and a half from the reference, along the guide.
    expect(solveSimultaneous(system, positions, 3.5)).toBe(true);

    const [ax, ay] = positions.get('A')!;
    const [bx, by] = positions.get('B')!;
    expect(ax).toBeCloseTo(1.5, 6);
    expect(ay).toBeCloseTo(0, 6);
    expect(bx).toBeCloseTo(1.5 + 4 * dir[0], 6);
    expect(by).toBeCloseTo(4 * dir[1], 6);
    expect((bx - ax) * dir[0] + (by - ay) * dir[1]).toBeGreaterThan(0);
  });
});

/**
 * Every analytic row checked against a central difference of the residual it
 * claims to be the derivative of.
 *
 * The analytic rows are the reason this solver converges at all near a toggle,
 * and an error in one of them is invisible until a mechanism that needs it
 * stops solving. Central differences are accurate enough to catch a wrong term
 * even where they are not accurate enough to solve with.
 */
function expectDerivedJacobian(
  system: SimultaneousSystem,
  positions: Map<string, number[]>,
  drive: number
): void {
  const ids = system.unknownIds;
  const columnOf = new Map(ids.map((id, index) => [id, index]));
  const analytic = jacobian(system, positions, columnOf, drive);
  const step = 1e-6;
  // Three vectors indexed by the same residual row. A constraint that forgets
  // it contributes two rows rather than one shifts every row after it against
  // the other two, and the rates come out of a system silently misaligned.
  const rows = residuals(system, positions, drive).length;
  expect(analytic.length).toBe(rows);
  expect(commandDerivative(system, positions, drive).length).toBe(rows);
  ids.forEach((id, index) => {
    for (const axis of [0, 1]) {
      const original = [...positions.get(id)!];
      const moved = [...original];
      moved[axis] = original[axis] + step;
      positions.set(id, moved);
      const forward = residuals(system, positions, drive);
      moved[axis] = original[axis] - step;
      positions.set(id, moved);
      const backward = residuals(system, positions, drive);
      positions.set(id, original);

      forward.forEach((_, row) => {
        const numeric = (forward[row] - backward[row]) / (2 * step);
        expect(analytic[row][index * 2 + axis]).toBeCloseTo(numeric, 5);
      });
    }
  });
}
