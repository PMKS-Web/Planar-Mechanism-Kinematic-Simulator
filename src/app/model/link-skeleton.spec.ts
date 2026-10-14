// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import './joint';
import type { Link } from './link';
import { RealLink } from './link';
import { linkSkeletonPath } from './link-skeleton';
import { haloPath } from './selection-halo';
import { RealJoint } from './joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  coupledDriveWheelsFixture,
  flywheelSliderCrankFixture,
} from '../../test-utils/verification/feature-fixtures';

const bar = (...points: [number, number][]) =>
  ({ joints: points.map(([x, y]) => ({ x, y })) }) as unknown as Link;

/** The corners a path visits, in order. */
const corners = (path: string): string[] =>
  [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => `${x},${y}`);

/** A path's rim, as the center and radius its two half-circle arcs describe. */
const rimOf = (path: string) => {
  const number = String.raw`(-?[\d.e-]+)`;
  const rim = new RegExp(
    `^M ${number} ${number} A ${number} ${number} 0 0 1 ${number} ${number} ` +
      `A ${number} ${number} 0 0 1 ${number} ${number} Z`
  ).exec(path);
  if (!rim) return undefined;
  const [left, y, r, , right] = rim.slice(1).map(Number);
  return { x: (left + right) / 2, y, r };
};

/** The far end of every spoke, keyed by nothing but where it lands. */
const spokesOf = (path: string, from: { x: number; y: number }) =>
  [...path.matchAll(/M (-?[\d.e-]+) (-?[\d.e-]+) L (-?[\d.e-]+) (-?[\d.e-]+)/g)].map(
    ([, x0, y0, x, y]) => {
      expect(+x0).toBeCloseTo(from.x, 9);
      expect(+y0).toBeCloseTo(from.y, 9);
      return { x: +x, y: +y };
    }
  );

const linkIn = (links: Link[], id: string) => links.find((link) => link.id === id) as RealLink;

describe('linkSkeletonPath', () => {
  it('draws a two-joint bar as the line between its joints', () => {
    expect(linkSkeletonPath(bar([0, 0], [4, 1]))).toBe('M 0 0 L 4 1');
  });

  it('traces a plate round its outside rather than in the order its joints were made', () => {
    // Made corner, far corner, corner, corner: joined in order, a bow tie.
    const path = linkSkeletonPath(bar([0, 0], [2, 1], [2, 0], [0, 1]));
    const ring = corners(path);
    expect(ring.length).toBe(4);
    expect(path.endsWith('Z')).toBe(true);
    // Each step along the ring is a side of the rectangle, never a diagonal.
    const at = ring.map((c) => c.split(',').map(Number));
    for (let i = 0; i < 4; i++) {
      const [a, b] = [at[i], at[(i + 1) % 4]];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    }
  });

  it('leaves a joint inside the plate off its outline', () => {
    const ring = corners(linkSkeletonPath(bar([0, 0], [4, 0], [1, 1], [2, 4])));
    expect(ring).not.toContain('1,1');
    expect(ring.length).toBe(3);
  });
});

// A link drawn as a disc (`RealLink.isCircle`) is a disc in the Schematic too:
// its rim, about the pin it turns on, and a spoke to each of its other joints.
// It used to be traced as the outline of its joints, so a flywheel drew as a
// line through its axle and a locomotive's wheels as three short cranks.
describe('linkSkeletonPath of a link drawn as a disc', () => {
  const engine = buildMechanism(flywheelSliderCrankFixture());
  const flywheel = linkIn(engine.links, 'ABR');

  it('draws the rim about the ground pin, through its outermost joint', () => {
    const rim = rimOf(linkSkeletonPath(flywheel));
    expect(rim).toEqual({ x: 0, y: 0, r: 1.4 });
  });

  it('runs a spoke from the pivot to every other joint, crank pin and rim pin alike', () => {
    const spokes = spokesOf(linkSkeletonPath(flywheel), { x: 0, y: 0 });
    expect(spokes).toEqual([
      { x: 1, y: 0 },
      { x: -1.4, y: 0 },
    ]);
  });

  it('keeps the rim on the pin centers, inside the disc Standard fills', () => {
    // Standard reaches past the outermost pin by a bar's half-width; a line
    // through the pin is how every other schematic body meets its joints.
    const standard = /A (-?[\d.e-]+) /.exec(flywheel.d)!;
    expect(+standard[1]).toBeGreaterThan(rimOf(linkSkeletonPath(flywheel))!.r);
  });

  it('bands a picked disc along the same rim and spokes', () => {
    expect(haloPath(flywheel, [])).toBe(linkSkeletonPath(flywheel));
  });

  it('is traced as its joints again once it has no ground pin to turn about', () => {
    const unmounted = buildMechanism(flywheelSliderCrankFixture());
    const wheel = linkIn(unmounted.links, 'ABR');
    (wheel.joints.find((joint) => joint.id === 'A') as RealJoint).ground = false;
    const path = linkSkeletonPath(wheel);
    expect(path).not.toContain('A');
    expect(rimOf(path)).toBeUndefined();
  });

  it('draws nothing but its joints for a link that was never a disc', () => {
    const [b, c] = linkIn(engine.links, 'BC').joints;
    expect(linkSkeletonPath(linkIn(engine.links, 'BC'))).toBe(`M ${b.x} ${b.y} L ${c.x} ${c.y}`);
  });
});

describe('the coupled drive wheels, drawn in the Schematic as they turn', () => {
  const locomotive = buildMechanism(coupledDriveWheelsFixture());
  const wheels = [
    { id: 'ABC', axle: 'A', crank: 'B' },
    { id: 'DEF', axle: 'D', crank: 'E' },
    { id: 'GHI', axle: 'G', crank: 'H' },
  ];

  it('is one machine that turns, though Gruebler counts it as rigid', () => {
    expect(locomotive.mechanism.dof).toBe(1);
    expect(locomotive.mechanism.isMechanismValid()).toBe(true);
    expect(locomotive.mechanism.links.length).toBeGreaterThan(300);
  });

  it('keeps every wheel a rim of one size about its own axle, its spoke on the crank pin', () => {
    const frames = locomotive.mechanism.links;
    // A quarter turn apart, and the first and last frames.
    const sampled = [0, 90, 180, 270, frames.length - 1];
    for (const step of sampled) {
      for (const { id, axle, crank } of wheels) {
        const wheel = linkIn(frames[step], id);
        const at = (joint: string) => wheel.joints.find((j) => j.id === joint)!;
        const path = linkSkeletonPath(wheel);
        const rim = rimOf(path)!;
        expect(rim, `${id} at ${step}`).toBeDefined();
        expect(rim.x).toBeCloseTo(at(axle).x, 9);
        expect(rim.y).toBeCloseTo(at(axle).y, 9);
        expect(rim.r).toBeCloseTo(1.2, 3);
        const pin = at(crank);
        const onPin = spokesOf(path, at(axle)).some(
          (end) => Math.hypot(end.x - pin.x, end.y - pin.y) < 1e-9
        );
        expect(onPin, `${id} at ${step}`).toBe(true);
      }
    }
  });

  it('turns the crank pins, so the spokes are what shows the wheels going round', () => {
    const frames = locomotive.mechanism.links;
    const crankPin = (step: number) =>
      spokesOf(linkSkeletonPath(linkIn(frames[step], 'DEF')), { x: 3, y: 0 })[0];
    const start = crankPin(0);
    const later = crankPin(90);
    expect(Math.hypot(later.x - start.x, later.y - start.y)).toBeGreaterThan(0.5);
  });
});
