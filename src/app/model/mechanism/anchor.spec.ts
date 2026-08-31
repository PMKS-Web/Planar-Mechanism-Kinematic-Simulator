import { buildMechanism } from '../../../test-utils/verification/fixture';
import { teachingLabFourBarFixture } from '../../../test-utils/verification/fixtures';
import { RealJoint } from '../joint';
import {
  coordinateIn,
  coordinateRuleFor,
  coordinatesAcross,
  reachAnchor,
  topologyOf,
} from './anchor';

/** The four-bar's own solved cycle, with its driven joint's rule beside it. */
function crank() {
  const built = buildMechanism(teachingLabFourBarFixture());
  const driven = built.joints.find((joint) => (joint as RealJoint).input) as RealJoint;
  const rule = coordinateRuleFor(driven)!;
  const frames = built.mechanism.joints;
  return { built, driven, rule, frames, coordinates: coordinatesAcross(rule, frames) };
}

/** A seed taken from one sample, which is what an anchor stores. */
function seedAt(frames: ReturnType<typeof crank>['frames'], index: number) {
  return new Map(frames[index].map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
}

describe('the start-pose anchor', () => {
  it('measures a crank absolutely, so an edit elsewhere cannot move it', () => {
    const { rule, frames, coordinates } = crank();
    expect(rule.kind).toBe('angle');
    expect(rule.referenceId).toBeDefined();

    // The coordinate is a world bearing, not a distance along this cycle's
    // track: the same crank angle reads the same whatever else was edited.
    const first = new Map(frames[0].map((joint) => [joint.id, joint]));
    const straight = coordinateIn(rule, (id) => first.get(id));
    expect(straight).toBeCloseTo(coordinates[0]!, 9);

    // And a full turn is a full turn: unwrapped, so going round reads as
    // going round rather than as arriving back where it started.
    const total = coordinates[coordinates.length - 1]! - coordinates[0]!;
    expect(Math.abs(total)).toBeGreaterThan(Math.PI * 1.9);
  });

  it('finds a stored coordinate back in its own cycle, to the sample', () => {
    const { frames, coordinates } = crank();
    const target = 90;
    const anchor = {
      coordinate: coordinates[target]!,
      heading: (coordinates[target]! > coordinates[target - 1]! ? 1 : -1) as 1 | -1,
      kind: 'angle' as const,
      seed: seedAt(frames, target),
    };
    const reach = reachAnchor(coordinates, anchor, frames);
    expect(reach).not.toBeNull();
    // Landing on the sample itself, or a hair before it with the blend making
    // up the difference -- which is the whole reason the reach carries one.
    expect(reach!.index + reach!.blend).toBeCloseTo(target, 3);
  });

  it('reads the same crank position a whole turn away', () => {
    // A crank angle repeats every revolution. An anchor stored as 4.9 radians
    // against a cycle running -1.4 to -7.7 is the same position, and refusing
    // it would move the start of every machine whose cycle happens to be
    // written on the other side of a seam.
    const { frames, coordinates } = crank();
    const anchor = {
      coordinate: coordinates[40]! + Math.PI * 2,
      heading: 1 as const,
      kind: 'angle' as const,
      seed: seedAt(frames, 40),
    };
    expect(reachAnchor(coordinates, anchor, frames)).not.toBeNull();
  });

  it('says no when the coordinate is nowhere in the cycle', () => {
    // A length has no turns to try, so a value outside the travel is simply
    // out of reach -- the crank-becomes-a-rocker case, in its simplest form.
    const { frames } = crank();
    const outside = {
      coordinate: 10_000,
      heading: 1 as const,
      kind: 'length' as const,
      seed: seedAt(frames, 0),
    };
    expect(reachAnchor([0, 1, 2, 1, 0], outside, frames)).toBeNull();
  });

  it('uses the seed to tell two legs of a cycle apart', () => {
    // A coordinate a reversing input passes twice: the same value going out and
    // coming back. Heading separates them here; where it cannot, the seed does.
    const there = [0, 1, 2, 1, 0];
    const frames = crank().frames.slice(0, 5);
    const outward = reachAnchor(
      there,
      { coordinate: 1, heading: 1, kind: 'length', seed: seedAt(frames, 0) },
      frames
    );
    const back = reachAnchor(
      there,
      { coordinate: 1, heading: -1, kind: 'length', seed: seedAt(frames, 0) },
      frames
    );
    expect(outward!.index).toBe(0);
    expect(back!.index).toBe(2);
  });

  it('gives up rather than looping when no whole turn brings it into range', () => {
    // The retry that reads a crank angle a revolution away has to be spent
    // once. A drag that broke the linkage outright produced a cycle this could
    // not place the anchor in, `wrapNear` handed back the same number it was
    // given, and the recursion ran until the stack did -- which surfaced as a
    // solver crash rather than as "the start is out of reach".
    const { frames } = crank();
    const nowhere = {
      coordinate: 5,
      heading: 1 as const,
      kind: 'angle' as const,
      seed: seedAt(frames, 0),
    };
    expect(reachAnchor([undefined, undefined], nowhere, frames)).toBeNull();
    expect(reachAnchor([], nowhere, frames)).toBeNull();
  });

  it('names a machine by everything it owns, not by one joint', () => {
    // `partitionKey` is the lowest owned joint id, which survives a rename or a
    // deletion and says nothing about lineage: fuse two machines and the union
    // usually inherits one parent's key. An anchor carried across a fusion is a
    // corrupted design, so it is keyed on the whole set.
    const { built } = crank();
    const all = topologyOf(built.joints);
    const fewer = topologyOf(built.joints.slice(0, -1));
    expect(all).not.toBe(fewer);
    expect(all.split(',')).toEqual([...all.split(',')].sort());
  });
});
