import './joint';
import {
  CylinderLengths,
  HEAD_CLEARANCE_R,
  cylinderBarrelFloor,
  cylinderMinimumSpan,
  cylinderPoseAlong,
  cylinderRodFloor,
  cylinderSpanLayout,
  cylinderSpanLayoutFrom,
  cylinderSpanRange,
  cylinderStroke,
  cylinderStrokeAlong,
} from './cylinder';

/**
 * Two members with their own lengths (decision S3), and who gives when a mount
 * is dragged past a stop (decision S4).
 *
 * The first `describe` is the one that matters most: for two *equal* members
 * every function here answers exactly what it answered when they had to be
 * equal. It is checked against `cylinderSpanLayoutFrom`, which is the old
 * implementation untouched — creation still uses it, so it is a live oracle
 * rather than a copy of the numbers that would drift with them.
 */

const R = 0.15;
const CLEARANCE = HEAD_CLEARANCE_R * R;

/** The two members a cylinder of this stroke is drawn with, as creation draws them. */
const equal = (stroke: number): CylinderLengths => ({
  barrel: stroke + CLEARANCE,
  rod: stroke + CLEARANCE,
});

describe('equal members answer exactly what one number answered', () => {
  it('reads the same two ends of the span', () => {
    for (const stroke of [0.5, 4, 40]) {
      const members = equal(stroke);
      const { retracted, extended } = cylinderSpanRange(members, R);
      const asOne = cylinderSpanLayoutFrom(retracted, 0, R);
      expect(asOne.span).toBeCloseTo(retracted, 9);
      expect(asOne.stroke).toBeCloseTo(stroke, 9);
      expect(cylinderSpanLayoutFrom(extended, 1, R).span).toBeCloseTo(extended, 9);
    }
  });

  it('holds the size for any span inside the travel', () => {
    const members = equal(7);
    const { retracted, extended } = cylinderSpanRange(members, R);
    for (let i = 0; i <= 20; i++) {
      const span = retracted + ((extended - retracted) * i) / 20;
      const fit = cylinderSpanLayout(span, members, R);
      expect(fit.lengths).toEqual(members);
      expect(fit.span).toBeCloseTo(span, 9);
      expect(fit.start).toBeCloseTo(i / 20, 9);
      expect(fit.atMinimum).toBe(false);
    }
  });

  it('resizes past a stop exactly as the one-number layout does', () => {
    const members = equal(5);
    const { retracted, extended } = cylinderSpanRange(members, R);
    for (const [span, start] of [
      [extended + 3, 1],
      [extended + 0.2, 1],
      [retracted - 2, 0],
      [retracted - 0.1, 0],
      // Below the floor, where both stop.
      [0.001, 0],
    ] as const) {
      const fit = cylinderSpanLayout(span, members, R);
      const asOne = cylinderSpanLayoutFrom(span, start, R);
      expect(fit.lengths.barrel).toBeCloseTo(asOne.barrel, 9);
      expect(fit.lengths.rod).toBeCloseTo(asOne.rod, 9);
      expect(fit.along).toBeCloseTo(asOne.sealAlong, 9);
      expect(fit.span).toBeCloseTo(asOne.span, 9);
    }
  });

  it('stops at the shortest cylinder there is, and says so', () => {
    const fit = cylinderSpanLayout(0.001, equal(5), R);
    expect(fit.span).toBeCloseTo(cylinderMinimumSpan(R), 9);
    expect(cylinderStroke(fit.lengths.barrel, R)).toBeCloseTo(
      cylinderBarrelFloor(R) - CLEARANCE,
      9
    );
    expect(fit.lengths.rod).toBeCloseTo(fit.lengths.barrel, 9);
    expect(fit.atMinimum).toBe(true);
  });
});

describe('the travel is the barrel’s and the rod only reaches', () => {
  it('shifts both ends of the span by a longer rod, leaving the stroke alone', () => {
    const short = cylinderSpanRange({ barrel: 6, rod: 6 }, R);
    const long = cylinderSpanRange({ barrel: 6, rod: 9 }, R);
    expect(long.retracted - short.retracted).toBeCloseTo(3, 12);
    expect(long.extended - short.extended).toBeCloseTo(3, 12);
    expect(long.extended - long.retracted).toBeCloseTo(short.extended - short.retracted, 12);
  });

  it('floors the rod at the barrel’s own travel, which equal members always clear', () => {
    expect(cylinderRodFloor(6, R)).toBeCloseTo(cylinderStroke(6, R), 12);
    const members = equal(4);
    expect(members.rod).toBeGreaterThan(cylinderRodFloor(members.barrel, R));
  });

  it('reads the start off the seal, so a longer rod does not move the cylinder', () => {
    const along = cylinderStrokeAlong(6, R).min + 2;
    const fit = cylinderSpanLayout(along + 9, { barrel: 6, rod: 9 }, R);
    expect(fit.along).toBeCloseTo(along, 9);
    expect(fit.start).toBeCloseTo(2 / cylinderStroke(6, R), 9);
  });
});

describe('a mount dragged past open', () => {
  const members = { barrel: 6, rod: 9 };
  const { extended } = cylinderSpanRange(members, R);

  it('grows both by the same amount when neither is fixed', () => {
    const fit = cylinderSpanLayout(extended + 4, members, R);
    expect(fit.span).toBeCloseTo(extended + 4, 6);
    expect(fit.start).toBeCloseTo(1, 9);
    expect(fit.lengths.barrel - members.barrel).toBeCloseTo(fit.lengths.rod - members.rod, 6);
    expect(fit.atMinimum).toBe(false);
  });

  it('lets the rod take all of it when the barrel is fixed', () => {
    const fit = cylinderSpanLayout(extended + 4, members, R, { barrel: true });
    expect(fit.lengths.barrel).toBeCloseTo(members.barrel, 12);
    expect(fit.lengths.rod).toBeCloseTo(members.rod + 4, 9);
    expect(fit.span).toBeCloseTo(extended + 4, 9);
  });

  it('lets the barrel take all of it when the rod is fixed', () => {
    const fit = cylinderSpanLayout(extended + 1, members, R, { rod: true });
    expect(fit.lengths.rod).toBeCloseTo(members.rod, 12);
    expect(fit.lengths.barrel).toBeGreaterThan(members.barrel);
    expect(fit.span).toBeCloseTo(extended + 1, 6);
  });

  it('stops the barrel where its travel would outgrow the fixed rod', () => {
    // Past this the far joint would be pulled inside the mouth on the way
    // closed, which is a cylinder that cannot close rather than a longer one.
    const ceiling = members.rod + CLEARANCE;
    const reach = cylinderSpanRange({ barrel: ceiling, rod: members.rod }, R).extended;
    const fit = cylinderSpanLayout(reach + 5, members, R, { rod: true });
    expect(fit.lengths.barrel).toBeCloseTo(ceiling, 6);
    expect(cylinderStroke(fit.lengths.barrel, R)).toBeCloseTo(members.rod, 6);
    expect(fit.span).toBeCloseTo(reach, 6);
    expect(fit.atMinimum).toBe(true);
  });

  it('stops the mount at the stop when both are fixed', () => {
    const fit = cylinderSpanLayout(extended + 4, members, R, { barrel: true, rod: true });
    expect(fit.lengths).toEqual(members);
    expect(fit.span).toBeCloseTo(extended, 9);
    expect(fit.start).toBeCloseTo(1, 9);
    expect(fit.atMinimum).toBe(true);
  });
});

describe('a mount pushed past closed', () => {
  const members = { barrel: 6, rod: 9 };
  const { retracted } = cylinderSpanRange(members, R);

  it('shrinks both by the same amount when neither is fixed', () => {
    const fit = cylinderSpanLayout(retracted - 2, members, R);
    expect(fit.span).toBeCloseTo(retracted - 2, 6);
    expect(fit.start).toBeCloseTo(0, 9);
    expect(members.barrel - fit.lengths.barrel).toBeCloseTo(members.rod - fit.lengths.rod, 6);
    expect(fit.atMinimum).toBe(false);
  });

  it('lets the rod give when the barrel is fixed', () => {
    const fit = cylinderSpanLayout(retracted - 2, members, R, { barrel: true });
    expect(fit.lengths.barrel).toBeCloseTo(members.barrel, 12);
    expect(fit.lengths.rod).toBeCloseTo(members.rod - 2, 9);
    expect(fit.span).toBeCloseTo(retracted - 2, 9);
  });

  it('stops the rod at its own floor, which is the travel', () => {
    const floor = cylinderRodFloor(members.barrel, R);
    const shortest = cylinderStrokeAlong(members.barrel, R).min + floor;
    const fit = cylinderSpanLayout(shortest - 3, members, R, { barrel: true });
    expect(fit.lengths.rod).toBeCloseTo(floor, 9);
    expect(fit.span).toBeCloseTo(shortest, 9);
    expect(fit.atMinimum).toBe(true);
  });

  it('stops the mount at the stop when the rod is fixed, barrel fixed or not', () => {
    // Closing further asks the rod to be shorter, which is the one thing it is
    // refusing to be -- so a fixed rod alone is as final as both fixed.
    for (const holds of [{ rod: true }, { barrel: true, rod: true }]) {
      const fit = cylinderSpanLayout(retracted - 2, members, R, holds);
      expect(fit.lengths).toEqual(members);
      expect(fit.span).toBeCloseTo(retracted, 9);
      expect(fit.start).toBeCloseTo(0, 9);
      expect(fit.atMinimum).toBe(true);
    }
  });
});

describe('the one pose constructor', () => {
  it('puts N, S and B on the axis at the lengths it was given', () => {
    const axis = { x: Math.cos(0.7), y: Math.sin(0.7) };
    const pose = cylinderPoseAlong({ x: 2, y: -1 }, axis, { barrel: 6, rod: 9 }, 4);
    const from = (point: { x: number; y: number }) =>
      Math.hypot(point.x - pose.mountA.x, point.y - pose.mountA.y);

    expect(pose.mountA).toEqual({ x: 2, y: -1 });
    expect(from(pose.inner)).toBeCloseTo(6, 12);
    expect(from(pose.seal)).toBeCloseTo(4, 12);
    expect(from(pose.mountB)).toBeCloseTo(13, 12);
    for (const point of [pose.inner, pose.seal, pose.mountB]) {
      const across = (point.x - pose.mountA.x) * axis.y - (point.y - pose.mountA.y) * axis.x;
      expect(Math.abs(across)).toBeLessThan(1e-12);
    }
  });
});
