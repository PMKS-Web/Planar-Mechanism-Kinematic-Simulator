import { HoldBar, HoldJoint, reachedByHolds, settleHolds } from './hold-solver';

// The edit-time constraint solver, against geometry small enough to check by
// hand. A held bar is a dimension in a sketch: it keeps its number, and the
// joints go where the numbers leave them.

const J = (id: string, x: number, y: number, fixed = false): HoldJoint => ({ id, x, y, fixed });
const bar = (
  id: string,
  a: string,
  b: string,
  hold: 'length' | 'angle',
  joints: HoldJoint[]
): HoldBar => {
  const p = joints.find((j) => j.id === a)!;
  const q = joints.find((j) => j.id === b)!;
  return {
    id,
    a,
    b,
    hold,
    length: Math.hypot(q.x - p.x, q.y - p.y),
    angle: Math.atan2(q.y - p.y, q.x - p.x),
  };
};
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

describe('settling held bars', () => {
  it('slides the free end of a held length on the arc about a fixed end', () => {
    const joints = [J('A', 0, 0, true), J('B', 3, 4)];
    const bars = [bar('AB', 'A', 'B', 'length', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 10, y: 0 }]);
    const b = out.positions.get('B')!;
    expect(out.satisfied).toBe(true);
    expect(out.immovable).toEqual([]);
    // On the circle of radius 5 about A, at the point nearest the ask.
    expect(dist({ x: 0, y: 0 }, b)).toBeCloseTo(5, 6);
    expect(b.x).toBeCloseTo(5, 6);
    expect(b.y).toBeCloseTo(0, 6);
    expect(out.positions.has('A')).toBe(false);
  });

  it('reaches the ask exactly when the other end is free, towing it along', () => {
    const joints = [J('A', 0, 0), J('B', 3, 4)];
    const bars = [bar('AB', 'A', 'B', 'length', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 10, y: 4 }]);
    const a = out.positions.get('A')!;
    const b = out.positions.get('B')!;
    expect(out.satisfied).toBe(true);
    expect(out.shortfall).toBeLessThan(1e-4);
    expect(b.x).toBeCloseTo(10, 3);
    expect(b.y).toBeCloseTo(4, 3);
    expect(dist(a, b)).toBeCloseTo(5, 6);
    // Towed the least it could: straight toward the new B.
    expect(dist({ x: 0, y: 0 }, a)).toBeLessThan(7.1);
  });

  it('keeps a held angle: the dragged end stays on the line through the fixed end', () => {
    const joints = [J('A', 0, 0, true), J('B', 2, 2)];
    const bars = [bar('AB', 'A', 'B', 'angle', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 6, y: 0 }]);
    const b = out.positions.get('B')!;
    expect(out.satisfied).toBe(true);
    // Projected onto the 45 degree line: (6,0) lands at (3,3).
    expect(b.x).toBeCloseTo(3, 6);
    expect(b.y).toBeCloseTo(3, 6);
  });

  it('turns a bar round for an angle on the other side of the line', () => {
    // A fixed, AB pointing at 30 degrees with its length held, asked for
    // -30 degrees: the same line, the other way. B has to swing round to the
    // -30 ray, not stay put where it happens already to be on the line.
    const joints = [
      J('A', 0, 0, true),
      J('B', Math.cos(Math.PI / 6) * 4, Math.sin(Math.PI / 6) * 4),
    ];
    const bars: HoldBar[] = [
      bar('AB', 'A', 'B', 'length', joints),
      { id: 'AB*', a: 'A', b: 'B', hold: 'angle', length: 4, angle: -Math.PI / 6 },
    ];
    // A typed value's ask: B is where it is, and goes where the new hold puts it.
    const out = settleHolds(joints, bars, [{ id: 'B', x: joints[1].x, y: joints[1].y }], {
      holdStill: false,
    });
    const b = out.positions.get('B')!;
    expect(out.satisfied).toBe(true);
    expect(b.x).toBeCloseTo(Math.cos(-Math.PI / 6) * 4, 4);
    expect(b.y).toBeCloseTo(Math.sin(-Math.PI / 6) * 4, 4);
  });

  it('refuses a joint with no freedom left, and says which it is', () => {
    // B between two held lengths from two grounds: a rigid triangle.
    const joints = [J('A', 0, 0, true), J('B', 3, 4), J('C', 6, 0, true)];
    const bars = [bar('AB', 'A', 'B', 'length', joints), bar('BC', 'B', 'C', 'length', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 3, y: 6 }]);
    expect(out.immovable).toEqual(['B']);
    // And it stays put rather than hopping to the mirror assembly.
    expect(out.positions.get('B')?.y ?? 4).toBeCloseTo(4, 4);
  });

  it('carries a chain: a held bar beyond the dragged one moves as little as it must', () => {
    // A fixed, AB and BC held lengths, C free. Dragging B on the arc about A
    // tows C along by however much BC needs.
    const joints = [J('A', 0, 0, true), J('B', 0, 5), J('C', 5, 5)];
    const bars = [bar('AB', 'A', 'B', 'length', joints), bar('BC', 'B', 'C', 'length', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 5, y: 0 }]);
    const b = out.positions.get('B')!;
    // C happens to be five from where B lands, so it need not move at all.
    const c = out.positions.get('C') ?? { x: 5, y: 5 };
    expect(out.satisfied).toBe(true);
    expect(dist({ x: 0, y: 0 }, b)).toBeCloseTo(5, 6);
    expect(dist(b, c)).toBeCloseTo(5, 6);
    expect(b.x).toBeCloseTo(5, 5);
    expect(b.y).toBeCloseTo(0, 5);

    // And when it must: ask B somewhere C cannot reach from where it stands.
    const towed = settleHolds(joints, bars, [{ id: 'B', x: -5, y: 0 }]);
    const b2 = towed.positions.get('B')!;
    const c2 = towed.positions.get('C')!;
    expect(towed.satisfied).toBe(true);
    expect(dist(b2, c2)).toBeCloseTo(5, 6);
    expect(dist({ x: 0, y: 0 }, b2)).toBeCloseTo(5, 6);
  });

  it('leaves bars without holds, and joints beyond them, alone', () => {
    const joints = [J('A', 0, 0, true), J('B', 3, 4), J('C', 8, 4)];
    const bars = [bar('AB', 'A', 'B', 'length', joints)];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 3, y: 5 }]);
    expect(out.positions.has('C')).toBe(false);
    expect(reachedByHolds(['B'], bars).joints.has('C')).toBe(false);
  });

  it('translates a whole held drawing without complaint', () => {
    // Every joint asked to move by the same offset: every hold stays true and
    // every ask is met exactly.
    const joints = [J('A', 0, 0), J('B', 3, 4), J('C', 6, 0)];
    const bars = [bar('AB', 'A', 'B', 'length', joints), bar('BC', 'B', 'C', 'angle', joints)];
    const out = settleHolds(
      joints,
      bars,
      joints.map((j) => ({ id: j.id, x: j.x + 2, y: j.y - 1 }))
    );
    expect(out.satisfied).toBe(true);
    expect(out.shortfall).toBeLessThan(1e-6);
    expect(out.immovable).toEqual([]);
  });

  it('reports a conflict it cannot settle', () => {
    // Two fixed ends, a held length between them, and a bar asked to be
    // longer than it is: nothing can move, and the hold is already false.
    const joints = [J('A', 0, 0, true), J('B', 4, 0, true)];
    const bars = [{ id: 'AB', a: 'A', b: 'B', hold: 'length' as const, length: 6, angle: 0 }];
    const out = settleHolds(joints, bars, [{ id: 'B', x: 6, y: 0 }]);
    expect(out.satisfied).toBe(false);
  });
});

describe('a four-bar with every length held', () => {
  // A and D grounded, AB, BC and CD held: the one freedom left is the
  // four-bar's own motion, and dragging B has to move C with it.
  const joints = [J('A', 0, 0, true), J('B', 0, 200), J('C', 300, 300), J('D', 400, 0, true)];
  const bars = [
    bar('AB', 'A', 'B', 'length', joints),
    bar('BC', 'B', 'C', 'length', joints),
    bar('CD', 'C', 'D', 'length', joints),
  ];

  it('moves the coupler with the crank and keeps every length', () => {
    const out = settleHolds(joints, bars, [{ id: 'B', x: 60, y: 190 }]);
    const b = out.positions.get('B')!;
    const c = out.positions.get('C')!;
    expect(out.satisfied).toBe(true);
    expect(out.immovable).toEqual([]);
    expect(dist({ x: 0, y: 0 }, b)).toBeCloseTo(200, 4);
    expect(dist(b, c)).toBeCloseTo(bars[1].length, 4);
    expect(dist(c, { x: 400, y: 0 })).toBeCloseTo(bars[2].length, 4);
  });

  it('says so when the ask cannot be reached', () => {
    // A shorter coupler and rocker: with B swung to the far side of A, the
    // coupler and the rocker together cannot span from B to D, so no
    // configuration has every length true there.
    const short = [J('A', 0, 0, true), J('B', 0, 100), J('C', 150, 100), J('D', 300, 0, true)];
    const shortBars = [
      bar('AB', 'A', 'B', 'length', short),
      bar('BC', 'B', 'C', 'length', short),
      bar('CD', 'C', 'D', 'length', short),
    ];
    const out = settleHolds(short, shortBars, [{ id: 'B', x: -100, y: 0 }]);
    expect(out.satisfied).toBe(false);
  });
});
