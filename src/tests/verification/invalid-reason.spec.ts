// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { createMechanismHarness, MechanismHarness } from '../../test-utils/mechanism-harness';

// §6: "this linkage is not valid" is true of every failure and useful for none
// of them. The one-line reason names the number, or the joint, or whatever it
// actually is -- and it is the setup drawer's own first blocker, title and
// summary, rather than a second set of sentences free to drift from the first.

const S = MODEL_SCALE;

/** A pin, grounded or driven by name rather than by argument position. */
function pin(id: string, x: number, y: number, flags: { ground?: boolean; input?: boolean } = {}) {
  const joint = new RevJoint(id, x * S, y * S);
  joint.ground = flags.ground ?? false;
  joint.input = flags.input ?? false;
  return joint;
}

/** Joints and bars into a real service, then the drawing rebuilt. */
function drawing(harness: MechanismHarness, joints: RealJoint[], bars: [number, number][]) {
  bars.forEach(([i, j]) => {
    const link = new RealLink(joints[i].id + joints[j].id, [joints[i], joints[j]]);
    joints[i].links.push(link);
    joints[j].links.push(link);
    joints[i].connectedJoints.push(joints[j]);
    joints[j].connectedJoints.push(joints[i]);
    harness.service.links.push(link);
  });
  harness.service.joints.push(...joints);
  harness.service.updateMechanism();
  return harness.service;
}

describe('why a mechanism will not run', () => {
  it('names the degrees of freedom when there are too many', () => {
    const service = drawing(
      createMechanismHarness(),
      [pin('A', 0, 0, { ground: true, input: true }), pin('B', 1, 0), pin('C', 2, 0)],
      [
        [0, 1],
        [1, 2],
      ]
    );
    expect(service.invalidReason()).toBe(
      '2 degrees of freedom, needs 1. With the input held still, link BC can still move.'
    );
  });

  it('says the input is missing', () => {
    const service = drawing(
      createMechanismHarness(),
      [
        pin('A', 0, 0, { ground: true }),
        pin('B', 0, 1),
        pin('C', 3, 2),
        pin('D', 4, 0, { ground: true }),
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ]
    );
    expect(service.invalidReason()).toBe('No input is set. Nothing drives the motion yet.');
  });

  it('names the slider that has nowhere to slide', () => {
    const slider = new PrisJoint('C', 3 * S, 0);
    slider.detach();
    const service = drawing(
      createMechanismHarness(),
      [pin('A', 0, 0, { ground: true, input: true }), pin('B', 0, 1), slider],
      [
        [0, 1],
        [1, 2],
      ]
    );
    expect(service.invalidReason()).toContain('Slider C has no slot.');
  });

  it('says nothing at all when the mechanism is fine', () => {
    const service = drawing(
      createMechanismHarness(),
      [
        pin('A', 0, 0, { ground: true, input: true }),
        pin('B', 0, 1),
        pin('C', 3, 2),
        pin('D', 4, 0, { ground: true }),
      ],
      [
        [0, 1],
        [1, 2],
        [2, 3],
      ]
    );
    expect(service.invalidReason()).toBeUndefined();
  });
});
