// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { FlagPacker } from '../../app/services/transcoding/flag-packer';
import { BoolSetting } from '../../app/services/transcoding/stored-settings';
import { createMechanismHarness, MechanismHarness } from '../../test-utils/mechanism-harness';
import { read } from '../../test-utils/verification/issue-text';

// What the Force tab asks for before it will call itself ready, now that
// gravity is a load and a massless link is an idealization rather than a sin.
//
// The situations here are the ones a fresh drawing actually walks through:
// every link starts massless, gravity starts on, and no force is drawn. Each
// step of giving the drawing weight should move exactly one row, and the tab
// should come ready the moment there is genuinely something to solve.

/** A crank-rocker with every link at the default mass of zero. */
function fourBar(harness: MechanismHarness): RealLink[] {
  const at: [number, number][] = [
    [0, 0],
    [0, 1],
    [3, 2],
    [4, 0],
  ];
  const joints = at.map(([x, y], i) => new RevJoint('ABCD'[i], x, y));
  joints[0].ground = true;
  joints[3].ground = true;
  joints[0].input = true;
  const links = [0, 1, 2].map((i) => {
    const link = new RealLink(joints[i].id + joints[i + 1].id, [joints[i], joints[i + 1]]);
    joints[i].links.push(link);
    joints[i + 1].links.push(link);
    joints[i].connectedJoints.push(joints[i + 1]);
    joints[i + 1].connectedJoints.push(joints[i]);
    return link;
  });
  harness.service.joints.push(...joints);
  harness.service.links.push(...links);
  harness.service.updateMechanism();
  return links;
}

/** The issue with this title, as read, or nothing when it is not outstanding. */
const issue = (harness: MechanismHarness, title: string) =>
  harness.service
    .forceSetupIssues()
    .map(read)
    .find((one) => one.title === title);

describe('force analysis setup, as a fresh drawing meets it', () => {
  it('starts unloaded: massless everywhere, gravity with nothing to pull on', () => {
    const harness = createMechanismHarness();
    fourBar(harness);

    const load = issue(harness, 'Nothing loads the mechanism')!;
    expect(load.summary).toBe('No force is applied and every link is massless.');
    // Both ways out, kept short: attach a force, or give a link mass.
    expect(load.fixes).toEqual(['Attach Force to any link', 'Type a mass in the Masses table']);
    expect(harness.service.forceAnalysisReady()).toBe(false);
  });

  it('comes ready the moment one link has mass, because gravity is a load', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.service.updateMechanism();

    expect(issue(harness, 'Nothing loads the mechanism')).toBeUndefined();
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('warns about the links still massless, without standing in the way', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.service.updateMechanism();

    const massless = issue(harness, '2 links are massless')!;
    expect(massless.severity).toBe('warning');
    // Names the links, and says the idealization is allowed.
    expect(massless.summary).toBe(
      'link AB and link CD weigh nothing, so gravity and inertia skip them.'
    );
    expect(massless.explain).toContain('fine idealization');
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('with gravity off, mass alone is no longer a load, and the message says so', () => {
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    const load = issue(harness, 'Nothing loads the mechanism')!;
    expect(load.summary).toBe('Gravity is off, so link mass weighs nothing.');
    expect(harness.service.forceAnalysisReady()).toBe(false);
  });

  it('says to turn gravity on first where doing so is the whole fix', () => {
    // Everything the analysis needs is drawn; the only thing in the way is a
    // switch in another panel, and the fix names the panel it lives in.
    const harness = createMechanismHarness();
    const links = fourBar(harness);
    links[1].mass = 5;
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    expect(issue(harness, 'Nothing loads the mechanism')!.fixes[0]).toBe(
      'Turn on Gravity in the Settings panel'
    );

    harness.settings.isGravity.next(true);
    harness.service.updateMechanism();
    expect(harness.service.forceAnalysisReady()).toBe(true);
  });

  it('does not offer it alone where it would leave the reader still blocked', () => {
    // Gravity off over a drawing with no mass anywhere: turning it on pulls on
    // nothing, so it is not a fix on its own. The fixes name both halves.
    const harness = createMechanismHarness();
    fourBar(harness);
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    expect(issue(harness, 'Nothing loads the mechanism')!.fixes).toEqual([
      'Attach Force to any link',
      'Turn on Gravity and give a link a mass',
    ]);
  });

  it('feeds the gravity setting into the solved mechanism itself', () => {
    const on = createMechanismHarness();
    const linksOn = fourBar(on);
    linksOn.forEach((link) => (link.mass = 2));
    on.service.updateMechanism();
    const withGravity = on.service.mechanisms[0].getForceAnalysis('static');

    const off = createMechanismHarness();
    const linksOff = fourBar(off);
    linksOff.forEach((link) => (link.mass = 2));
    off.settings.isGravity.next(false);
    off.service.updateMechanism();
    const withoutGravity = off.service.mechanisms[0].getForceAnalysis('static');

    expect(withGravity.successfulFrames).toBeGreaterThan(0);
    const weightOn = [...withGravity.frames[0].jointReactions.values()].some(
      ([x, y]) => Math.hypot(x, y) > 1e-6
    );
    const weightOff = [...withoutGravity.frames[0].jointReactions.values()].every(
      ([x, y]) => Math.hypot(x, y) < 1e-9
    );
    expect(weightOn).toBe(true);
    expect(weightOff).toBe(true);
  });
});

describe('what a fresh link weighs', () => {
  it('starts with no mass and no moment of inertia', () => {
    // MoI used to default to 1 while mass defaulted to 0, so a "massless" link
    // still resisted angular acceleration — every dynamic analysis of a fresh
    // drawing quietly carried unit inertia on every link.
    const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 1, 0)]);
    expect(link.mass).toBe(0);
    expect(link.massMoI).toBe(0);
  });

  it('so a fully massless mechanism takes no torque to drive', () => {
    // No mass, no inertia, no gravity, no load: the drive has nothing to work
    // against, and the dynamic input effort has to come out zero everywhere.
    const harness = createMechanismHarness();
    fourBar(harness);
    harness.settings.isGravity.next(false);
    harness.service.updateMechanism();

    const series = harness.service.mechanisms[0].getForceAnalysis('dynamic');
    expect(series.successfulFrames).toBeGreaterThan(0);
    series.frames
      .filter((frame) => frame.status === 'ok')
      .forEach((frame) => {
        expect(Math.abs(frame.inputEffort!.valueSI)).toBeLessThan(1e-9);
      });
  });
});

describe('mass on a slider', () => {
  it('counts as weight, the same as the solver counts it', () => {
    // A slider-crank whose only mass is the block itself: the solver hangs
    // that mass from gravity, so setup has to call the mechanism loaded.
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 1);
    // C rides a horizontal slot fixed to the world, and carries the mass. The
    // mass was a *link's* while a slider was three objects -- this joint, a
    // prismatic twin, and a zero-length block joining them -- because only a
    // link could hold one; a slider is one joint now, and holds its own
    // (Stage 1 of `docs/joint-type-and-cylinder-plan.md`).
    const c = new PrisJoint('C', 3, 0, false, true);
    c.angle_rad = 0;
    c.mass = 3;
    const pairs: [RealJoint, RealJoint][] = [
      [a, b],
      [b, c],
    ];
    const links = pairs.map(([left, right]) => {
      const link = new RealLink(left.id + right.id, [left, right]);
      left.links.push(link);
      right.links.push(link);
      left.connectedJoints.push(right);
      right.connectedJoints.push(left);
      return link;
    });
    harness.service.joints.push(a, b, c);
    harness.service.links.push(...links);
    harness.service.updateMechanism();

    expect(issue(harness, 'Nothing loads the mechanism')).toBeUndefined();
  });
});

describe('the GRAVITY_OFF flag against every URL already in circulation', () => {
  it('unpacks as false — gravity on — from a token written before it existed', () => {
    // Eight flags was the whole enum when today's URLs were written. Packing
    // eight and unpacking nine is exactly what decoding an old URL does, and
    // the ninth has to come back false, because false means what those URLs
    // have always meant.
    const oldEra = FlagPacker.pack([true, false, true, true, false, true, false, true]);
    const decoded = FlagPacker.unpack(oldEra, 9);
    expect(decoded[BoolSetting.GRAVITY_OFF]).toBe(false);
    expect(decoded.slice(0, 8)).toEqual([true, false, true, true, false, true, false, true]);
  });

  it('keeps the token the same length, so no URL field shifts', () => {
    const eight = FlagPacker.pack([true, false, true, true, false, true, false, true]);
    const nine = FlagPacker.pack([true, false, true, true, false, true, false, true, false]);
    expect(nine).toBe(eight);
  });
});
