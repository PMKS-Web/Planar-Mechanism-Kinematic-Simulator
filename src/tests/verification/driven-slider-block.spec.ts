// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SettingsService } from '../../app/services/settings.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { canDrive, describeActuator, incidentBodies } from '../../app/model/actuator';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';

/**
 * Driving the joint where a slider-crank's connecting rod meets its block.
 *
 * There used to be two joints at that point — a pin the rod hung on, and the
 * prismatic joint it rode — with a zero-length block joining them. The pin
 * looked like every other floating pin, so it was offered as a driven joint,
 * accepted, and then ignored: the body on its other side was a single point, so
 * the direction its angle was measured along had zero length, the commanded
 * angle was the angle of nothing, and the solve produced a full 360 samples of
 * a mechanism standing perfectly still. The app learned to refuse it.
 *
 * Stage 1 of `docs/joint-type-and-cylinder-plan.md` took away the shape that
 * bug lived in. One joint slides, the rod is pinned straight to it, and what a
 * drive there prescribes is the travel along the slot — a freedom the joint
 * really has. So what this file pins is the arrangement that replaced the bug:
 * one joint rather than two coincident ones, a drive that is accepted because
 * it means something, and a linkage that actually moves when it is driven.
 */
describe('driving the block of a slider-crank', () => {
  function sliderCrank() {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES['Slider_Crank']);
    new MechanismBuilder(
      harness.service,
      decoder,
      new SettingsService(),
      new ActiveObjService()
    ).build(false);
    return harness.service;
  }

  /** The joint that slides, which is also the joint the rod hangs on. */
  function blockJoint(joints: RealJoint[]): PrisJoint {
    const sliders = joints.filter((joint): joint is PrisJoint => joint instanceof PrisJoint);
    if (sliders.length !== 1) {
      throw new Error(`the slider-crank template has ${sliders.length} sliding joints`);
    }
    return sliders[0];
  }

  it('is one joint, with no coincident pin beside it to drive by mistake', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const block = blockJoint(joints);

    const alsoHere = joints.filter(
      (joint) => joint.id !== block.id && Math.hypot(joint.x - block.x, joint.y - block.y) < 1e-6
    );
    expect(alsoHere.map((joint) => joint.id)).toEqual([]);
    // And the rod hangs on the sliding joint itself rather than on that pin.
    expect(block.links.map((link) => link.joints.length)).toEqual([2]);
  });

  it('is the guide itself, where a floating pin used to sit on top of it', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const block = blockJoint(joints);

    // The joint that made this a bug was *floating*: it was the pin the rod
    // hung on, and it read as an ordinary two-body pin with no ground under it.
    // The joint left at that point is the guide, which a slider-crank cuts into
    // the world -- so the shape that invited an angle drive is not there to be
    // offered.
    expect(block.ground).toBe(true);
    // The rod on one side, the world the guide is cut into on the other.
    expect(incidentBodies(block)).toHaveLength(2);
  });

  it('is driven as a length along its slot, not as the angle of a point', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const block = blockJoint(joints);

    expect(canDrive(block)).toBe(true);
    const actuator = describeActuator(block);
    if (typeof actuator === 'string') throw new Error(actuator);
    expect(actuator.kind).toBe('length');
  });

  it('solves a mechanism that moves, rather than one that only claims to', () => {
    // The old failure was silent -- 361 samples of a linkage standing still --
    // so what has to be asserted is motion, not a status. The way into this
    // state is the same as it ever was: a URL that names the joint as the input.
    const service = sliderCrank();
    const joints = service.joints as RealJoint[];
    for (const joint of joints) joint.input = false;
    const block = blockJoint(joints);
    block.input = true;
    service.updateMechanism();

    expect(service.oneValidMechanismExists()).toBe(true);
    const frames = service.mechanisms[0].joints;
    expect(frames.length).toBeGreaterThan(20);
    const along = frames.map((frame) => {
      const at = frame.find((joint) => joint.id === block.id)!;
      return Math.hypot(at.x - frames[0][0].x, at.y - frames[0][0].y);
    });
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0);
  });

  it('leaves the pin at the other end of the same rod drivable', () => {
    const joints = sliderCrank().joints as RealJoint[];
    const block = blockJoint(joints);
    const rod = block.links.find((link) => link.joints.length > 1)!;
    const farEnd = rod.joints.find((joint) => joint.id !== block.id) as RealJoint;

    // An angle drive at one end of the rod and a length drive at the other:
    // both are real freedoms, and neither is the one that had to be refused.
    expect(farEnd.id).not.toBe(block.id);
    expect(canDrive(farEnd)).toBe(true);
  });
});
