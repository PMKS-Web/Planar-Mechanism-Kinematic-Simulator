// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { craneWithTwoLoadsFixture } from '../../test-utils/verification/feature-fixtures';
import { RealLink } from '../../app/model/link';
import { RevJoint } from '../../app/model/joint';
import { uniformBodyOf } from '../../app/model/uniform-body';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

// A jib crane carrying two loads, one global and one local. What is asserted is
// the lesson: over a luffing cycle the hook load keeps pointing at the floor
// and the rope pull swings with the jib. If the two arrows behaved the same way
// there would be nothing here to open the template for.

/** Every reaction magnitude the static analysis reports, across the cycle. */
function reactionMagnitudes(fixture: MechanismFixture): number[] {
  const series = buildMechanism(fixture).mechanism.getForceAnalysis('static');
  const magnitudes: number[] = [];
  for (const frame of series.frames) {
    if (frame.status !== 'ok') continue;
    for (const reaction of frame.jointReactions.values()) {
      magnitudes.push(Math.hypot(reaction[0], reaction[1]));
    }
  }
  return magnitudes;
}

describe('the jib crane carrying two loads', () => {
  const built = buildMechanism(craneWithTwoLoadsFixture());
  const jib = built.links.find((link) => link.id === 'OCT') as RealLink;

  it('is one degree of freedom and solves', () => {
    expect((built.mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    expect(built.mechanism.joints.length).toBeGreaterThan(300);
  });

  it('luffs the jib between two limits, finitely', () => {
    const tip = built.mechanism.joints.map((frame) => frame.find((joint) => joint.id === 'T')!);
    expect(tip.every((joint) => Number.isFinite(joint.x) && Number.isFinite(joint.y))).toBe(true);

    const heights = tip.map((joint) => joint.y);
    // A crane, not a windmill: the tip rises and falls through a real sweep and
    // never goes below the mast foot.
    expect(Math.min(...heights)).toBeGreaterThan(0);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(3);
    // And the jib stays a rigid bar the whole way.
    tip.forEach((joint) => expect(Math.hypot(joint.x, joint.y)).toBeCloseTo(7, 3));
  });

  it('carries both loads, one of each kind', () => {
    expect(built.forces.map((force) => force.id)).toEqual(['F1', 'F2']);
    expect(built.forces.map((force) => force.local)).toEqual([false, true]);
    expect(built.forces.map((force) => force.link.id)).toEqual(['OCT', 'OCT']);
    expect(jib.forces).toHaveLength(2);
    built.forces.forEach((force) => expect(force.mag).toBeGreaterThan(0));
  });

  it('holds the hook load vertical and swings the rope pull with the jib', () => {
    // The whole reason there are two. Both application points ride the jib;
    // only the local one's *direction* does.
    const angles = (id: string) =>
      built.mechanism.forces.map((frame) => frame.find((force) => force.id === id)!.angleRad);
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

    const hook = angles('F1');
    const rope = angles('F2');
    // The hook hangs straight down on every frame.
    hook.forEach((angle) => expect(angle).toBeCloseTo(-Math.PI / 2, 6));
    expect(spread(hook)).toBeCloseTo(0, 6);
    // The rope pull turns by as much as the jib does — tens of degrees.
    expect(spread(rope)).toBeGreaterThan(0.6);
  });

  it('moves both application points with the jib', () => {
    // A load that stayed put while its link moved would be a mark on the page.
    const travel = (id: string) => {
      const points = built.mechanism.forces.map(
        (frame) => frame.find((force) => force.id === id)!.startCoord
      );
      const first = points[0];
      return Math.max(...points.map((p) => Math.hypot(p.x - first.x, p.y - first.y)));
    };
    expect(travel('F1')).toBeGreaterThan(1);
    expect(travel('F2')).toBeGreaterThan(1);
  });

  it('balances the jib well inside its own centroid', () => {
    // A counterweighted jib. Nothing else in the library has a center of mass
    // away from the centroid, and the difference is the point.
    expect(jib.comIsCustom).toBe(true);
    const centroid = uniformBodyOf(jib.joints).centroid;
    const offset = Math.hypot(jib.CoM.x - centroid.x, jib.CoM.y - centroid.y);
    expect(offset).toBeGreaterThan(1.5);
    // Inside, towards the mast — a counterweight is behind the load, not ahead.
    expect(Math.hypot(jib.CoM.x, jib.CoM.y)).toBeLessThan(Math.hypot(centroid.x, centroid.y));
  });

  it('solves its forces on every frame, and the loads drive the numbers', () => {
    const series = built.mechanism.getForceAnalysis('static');
    expect(series.frames[0].status).toBe('ok');
    expect(series.successfulFrames).toBe(series.frames.length);

    // Same crane, same masses, no loads. If the reactions do not change, the
    // force panel is showing inertia and the two loads are decorative.
    const loaded = reactionMagnitudes(craneWithTwoLoadsFixture());
    const bare = reactionMagnitudes({ ...craneWithTwoLoadsFixture(), loads: undefined });
    expect(bare.length).toBe(loaded.length);
    expect(Math.max(...loaded)).toBeGreaterThan(Math.max(...bare) * 1.5);
  });

  it('runs a cycle in under eight seconds', () => {
    const winch = built.joints.find((joint) => joint.id === 'G') as RevJoint;
    expect(winch.driveSpeed).toBe(9);
    expect(60 / winch.driveSpeed).toBeLessThan(8);
  });

  it('carries both loads, the local flag and the balance point in the URL', () => {
    // A template is a link, so everything this mechanism is for has to survive
    // the codec — otherwise it opens as an ordinary crane with one load.
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(craneWithTwoLoadsFixture()));

    const forces = decoder.getForces();
    expect(forces.map((force) => force.id)).toEqual(['F1', 'F2']);
    expect(forces.map((force) => force.isLocal)).toEqual([false, true]);

    const encoded = decoder.getLinks().find((link) => link.id === 'OCT')!;
    expect(encoded.comIsCustom).toBe(true);
    expect(encoded.xCoM).toBeCloseTo(jib.CoM.x, 2);
    expect(encoded.yCoM).toBeCloseTo(jib.CoM.y, 2);
  });
});
