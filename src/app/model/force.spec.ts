import './joint';
import { Coord } from './coord';
import { Force } from './force';
import { RevJoint } from './joint';
import { RealLink } from './link';

describe('Force', () => {
  function makeForce(
    start = new Coord(0, 0),
    end = new Coord(2, 0),
    local = false,
    outward = true,
    magnitude = 10
  ): Force {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2, 0);
    return new Force('F1', new RealLink('AB', [a, b]), start, end, local, outward, magnitude);
  }

  it('keeps magnitude and direction as the canonical physical vector', () => {
    const force = makeForce();
    expect(force.xComp).toBeCloseTo(10, 12);
    expect(force.yComp).toBeCloseTo(0, 12);

    force.setDirectionRadians(Math.PI / 2);
    expect(force.mag).toBe(10);
    expect(force.xComp).toBeCloseTo(0, 12);
    expect(force.yComp).toBeCloseTo(10, 12);

    force.setComponents(3, 4);
    expect(force.mag).toBe(5);
    expect(force.angleRad).toBeCloseTo(Math.atan2(4, 3), 12);
    expect(force.xComp).toBeCloseTo(3, 12);
    expect(force.yComp).toBeCloseTo(4, 12);
  });

  it('preserves direction for zero magnitude and rejects invalid magnitude values', () => {
    const force = makeForce();
    force.setDirectionRadians(Math.PI / 3);
    force.setComponents(0, 0);
    expect(force.mag).toBe(0);
    expect(force.angleRad).toBeCloseTo(Math.PI / 3, 12);
    expect(force.xComp).toBeCloseTo(0, 12);
    expect(force.yComp).toBeCloseTo(0, 12);

    force.setMagnitude(-5);
    expect(force.mag).toBe(0);
    force.setMagnitude(Number.NaN);
    expect(force.mag).toBe(0);
  });

  it('moves the application point without changing the physical vector', () => {
    const force = makeForce();
    const originalHandle = force.endCoord.clone().subtract(force.startCoord);
    force.moveAnchor(new Coord(5, 6));
    expect(force.startCoord).toEqual(new Coord(5, 6));
    expect(force.endCoord.clone().subtract(force.startCoord)).toEqual(originalHandle);
    expect(force.mag).toBe(10);
    expect(force.angleRad).toBeCloseTo(0, 12);
  });

  it('uses the direction handle only for angle and reverses atomically', () => {
    const force = makeForce();
    force.moveDirectionHandle(new Coord(0, 5));
    expect(force.mag).toBe(10);
    expect(force.angleRad).toBeCloseTo(Math.PI / 2, 12);

    force.reverseDirection();
    expect(force.mag).toBe(10);
    expect(force.angleRad).toBeCloseTo(-Math.PI / 2, 12);
    expect(force.xComp).toBeCloseTo(0, 12);
    expect(force.yComp).toBeCloseTo(-10, 12);
  });

  it('normalizes legacy inward arrows and initializes local styling', () => {
    const force = makeForce(new Coord(0, 0), new Coord(1, 0), true, false, 2);
    expect(force.arrowOutward).toBe(true);
    expect(Math.abs(force.angleRad)).toBeCloseTo(Math.PI, 12);
    expect(force.xComp).toBeCloseTo(-2, 12);
    expect(force.stroke).toBe('blue');
    expect(force.fill).toBe('blue');
    expect(force.forceLine).not.toBe('');
    expect(force.forceArrow).not.toBe('');
  });

  it('uses a stable default width for one force and bounded relative widths for several', () => {
    const loneForce = makeForce(undefined, undefined, false, true, 1000);
    Force.normalizeVisualWidths([loneForce]);
    expect(loneForce.visualWidth).toBe(Force.DEFAULT_VISUAL_WIDTH);

    const small = makeForce(undefined, undefined, false, true, 1);
    const medium = makeForce(undefined, undefined, false, true, 10);
    const large = makeForce(undefined, undefined, false, true, 100);
    Force.normalizeVisualWidths([small, medium, large]);

    expect(small.visualWidth).toBe(Force.MIN_VISUAL_WIDTH);
    expect(medium.visualWidth).toBeCloseTo(Force.DEFAULT_VISUAL_WIDTH, 12);
    expect(large.visualWidth).toBe(Force.MAX_VISUAL_WIDTH);
    expect(large.visualWidth / small.visualWidth).toBeLessThanOrEqual(2);
    expect(small.forceArrow).not.toBe('');
    expect(large.forceArrow).not.toBe('');
  });

  it('does not exaggerate small magnitude differences between multiple forces', () => {
    const first = makeForce(undefined, undefined, false, true, 1);
    const second = makeForce(undefined, undefined, false, true, 1.1);
    Force.normalizeVisualWidths([first, second]);

    expect(second.visualWidth).toBeGreaterThan(first.visualWidth);
    expect(second.visualWidth / first.visualWidth).toBeLessThan(1.05);
  });
});
