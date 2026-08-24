// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { flywheelSliderCrankFixture } from '../../test-utils/verification/feature-fixtures';
import { RealLink } from '../../app/model/link';
import { RevJoint } from '../../app/model/joint';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

// The library's one circular link. Two things have to hold for it to be worth
// shipping: the engine has to run, and the flywheel has to actually be a disc
// in the built model rather than a bar with an ambition.

describe('the flywheel slider-crank', () => {
  const built = buildMechanism(flywheelSliderCrankFixture());
  const flywheel = built.links.find((link) => link.id === 'ABR') as RealLink;

  it('is one degree of freedom and solves', () => {
    expect((built.mechanism as unknown as { dof: number }).dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
  });

  it('turns the flywheel through a full revolution, finitely', () => {
    const pin = built.mechanism.joints.map((frame) => frame.find((joint) => joint.id === 'B')!);
    expect(pin.length).toBeGreaterThan(300);
    expect(pin.every((joint) => Number.isFinite(joint.x) && Number.isFinite(joint.y))).toBe(true);

    // The crank pin sweeps the whole circle: every quadrant is visited, which
    // a rocking bar could not manage.
    const quadrants = new Set(pin.map((joint) => (joint.x >= 0 ? 0 : 2) + (joint.y >= 0 ? 0 : 1)));
    expect(quadrants.size).toBe(4);
    // And it stays on the throw circle the whole way round, to the tolerance
    // the iterative position solver works to.
    pin.forEach((joint) => expect(Math.hypot(joint.x, joint.y)).toBeCloseTo(1, 3));
  });

  it('reciprocates the piston over the stroke the throw gives it', () => {
    const wrist = built.mechanism.joints.map((frame) => frame.find((joint) => joint.id === 'C')!);
    const travel = wrist.map((joint) => joint.x);
    // Twice the throw, and never off the bore's own centreline.
    expect(Math.max(...travel) - Math.min(...travel)).toBeCloseTo(2, 3);
    wrist.forEach((joint) => expect(joint.y).toBeCloseTo(0, 6));
  });

  it('draws the flywheel as a disc, and the rod as a bar', () => {
    // The feature this mechanism exists for. `isCircle` is what was asked;
    // `drawnAsDisc` is what the outline in `d` actually is.
    expect(flywheel.isCircle).toBe(true);
    expect(flywheel.drawnAsDisc).toBe(true);
    expect(flywheel.canBeCircular()).toBe(true);
    expect((built.links.find((link) => link.id === 'BC') as RealLink).isCircle).toBe(false);
  });

  it('keeps the piston clear of the rim at inner dead centre', () => {
    // A flywheel wide enough to be a flywheel can swallow the piston. The disc
    // reaches its outermost joint; the piston's nearest approach must be past
    // it, or the drawing shows a rod vanishing into a plate.
    const rim = built.joints.find((joint) => joint.id === 'R') as RevJoint;
    const wrist = built.mechanism.joints.map((frame) => frame.find((joint) => joint.id === 'C')!);
    const nearest = Math.min(...wrist.map((joint) => Math.abs(joint.x)));
    expect(nearest).toBeGreaterThan(Math.abs(rim.x));
  });

  it('is a kinematics demonstration, so it carries no mass at all', () => {
    built.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .forEach((link) => {
        expect(link.mass, link.id).toBe(0);
        expect(link.massMoI, link.id).toBe(0);
      });
  });

  it('runs a cycle in six seconds, not twelve', () => {
    // The document default is 5 rpm. A template nobody watches to the end is
    // not a template, so the drive carries a speed of its own.
    const crank = built.joints.find((joint) => joint.id === 'A') as RevJoint;
    expect(crank.driveSpeed).toBe(10);
    expect(60 / crank.driveSpeed).toBeCloseTo(6, 6);
  });

  it('carries the disc and the speed in the URL it is published as', () => {
    // A template is a link. A flag that only exists in the fixture object never
    // reaches anybody who opens one.
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(flywheelSliderCrankFixture()));

    expect(decoder.getLinks().find((link) => link.id === 'ABR')!.isCircle).toBe(true);
    expect(decoder.getLinks().find((link) => link.id === 'BC')!.isCircle).toBe(false);
    expect(decoder.getJoints().find((joint) => joint.id === 'A')!.driveSpeed).toBeCloseTo(10, 3);
  });
});
