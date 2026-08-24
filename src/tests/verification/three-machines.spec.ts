// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { threeMachinesFixture } from '../../test-utils/verification/feature-fixtures';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

// Three machines in one drawing. A fixture builds one Mechanism, and one
// Mechanism cannot hold three -- the drawing is 3 degrees of freedom taken
// whole -- so this goes through the service, which is what partitions a drawing
// into machines and is the only thing that can answer whether there are three.

/** The drawing, loaded into a real MechanismService and partitioned. */
function threeMachines() {
  const built = buildMechanism(threeMachinesFixture());
  const harness = createMechanismHarness();
  harness.service.joints.push(...built.joints);
  harness.service.links.push(...built.links);
  harness.service.updateMechanism();
  return { ...harness, built };
}

/** The machine whose own parts include `id`, and the mechanism solved for it. */
function machineOwning(service: ReturnType<typeof threeMachines>['service'], id: string) {
  const index = service.partitions.findIndex((partition) =>
    partition.ownJoints.some((joint) => joint.id === id)
  );
  expect(index, `no machine owns ${id}`).toBeGreaterThanOrEqual(0);
  return { index, partition: service.partitions[index], mechanism: service.mechanisms[index] };
}

/** Every solved position of joint `id` in `mechanism`. */
function path(mechanism: Mechanism, id: string) {
  return mechanism.joints.map((frame) => frame.find((joint) => joint.id === id)!);
}

describe('three machines in one drawing', () => {
  it('partitions into three, each its own 1-DoF machine', () => {
    const { service } = threeMachines();

    expect(service.mechanisms).toHaveLength(3);
    expect(service.mechanisms.map((mechanism) => mechanism.dof)).toEqual([1, 1, 1]);
    expect(service.mechanisms.every((mechanism) => mechanism.isMechanismValid())).toBe(true);
    expect(service.allMechanismsValid()).toBe(true);
    expect(service.partitions.map((partition) => partition.id)).toEqual(['M1', 'M2', 'M3']);
  });

  it('shares nothing between them', () => {
    // Three machines rather than one drawing that merely looks like three: no
    // joint belongs to more than one of them, ground pins included.
    const { service } = threeMachines();
    const owned = service.partitions.map((partition) =>
      partition.ownJoints
        .map((joint) => joint.id)
        .sort()
        .join('')
    );
    expect(owned.sort()).toEqual(['ABCD', 'EFGP', 'HIJK']);
  });

  it('gives each its own drive, speed and direction', () => {
    const { service } = threeMachines();
    const drive = (id: string) =>
      service.driveSpeedOf(service.joints.find((joint) => joint.id === id) as RealJoint);

    expect(drive('A')).toBe(10);
    expect(drive('E')).toBe(-8);
    expect(drive('H')).toBe(12);

    // Sign is direction, and the solver has to see it: anticlockwise,
    // clockwise, anticlockwise.
    const signs = ['A', 'E', 'H'].map(
      (id) => Math.sign(machineOwning(service, id).mechanism.inputAngularVelocities[0]) || 0
    );
    expect(signs).toEqual([1, -1, 1]);
  });

  it('gives each a cycle of its own, all of them watchable', () => {
    const { service } = threeMachines();
    const period = (id: string) => machineOwning(service, id).mechanism.cyclePeriod;

    // 60/rpm seconds a revolution: six, seven and a half, five.
    expect(period('A')).toBeCloseTo(6, 3);
    expect(period('E')).toBeCloseTo(7.5, 3);
    expect(period('H')).toBeCloseTo(5, 3);
    // The owner's complaint about the library was that a template takes twelve
    // seconds to come round. None of these does.
    [period('A'), period('E'), period('H')].forEach((seconds) => {
      expect(seconds).toBeGreaterThanOrEqual(5);
      expect(seconds).toBeLessThanOrEqual(8);
    });

    // The shared scrubber has to hold the slowest, or playback cuts one off.
    expect(service.cyclePeriod()).toBeCloseTo(7.5, 3);
  });

  it('is three different characters, not three copies', () => {
    const { service } = threeMachines();

    // M1, the drag link: the *output* pin goes all the way round its own
    // ground, which is what makes it a double-crank rather than a four-bar.
    const drag = machineOwning(service, 'A');
    const anchor = drag.partition.joints.find((joint) => joint.id === 'D')!;
    const sweep = path(drag.mechanism, 'C').map((joint) =>
      Math.atan2(joint.y - anchor.y, joint.x - anchor.x)
    );
    const quadrants = new Set(sweep.map((angle) => Math.floor(((angle + Math.PI) / Math.PI) * 2)));
    expect(quadrants.size).toBe(4);

    // M2, the slider-crank: the piston reciprocates along one line.
    const slider = machineOwning(service, 'E');
    const piston = path(slider.mechanism, 'G');
    piston.forEach((joint) => expect(joint.y).toBeCloseTo(0, 6));
    const travel = piston.map((joint) => joint.x);
    expect(Math.max(...travel) - Math.min(...travel)).toBeCloseTo(2, 3);

    // M3, the crank-rocker: the output rocks between two limits and turns back.
    const rock = machineOwning(service, 'H');
    const pivot = rock.partition.joints.find((joint) => joint.id === 'K')!;
    const angles = path(rock.mechanism, 'J').map((joint) =>
      Math.atan2(joint.y - pivot.y, joint.x - pivot.x)
    );
    const rocked = Math.max(...angles) - Math.min(...angles);
    expect(rocked).toBeGreaterThan(0.5);
    expect(rocked).toBeLessThan(Math.PI);
  });

  it('lets the three run on one clock or on three', () => {
    // The sync toggle is one of the things this drawing exists to show, so the
    // machines have to still be at different places in their cycles when the
    // shared clock is taken away.
    const { service } = threeMachines();
    const restOf = (id: string) => {
      const joint = service.joints.find((j) => j.id === id)!;
      return { x: joint.x, y: joint.y };
    };
    const moved = (id: string, from: { x: number; y: number }) => {
      const joint = service.joints.find((j) => j.id === id)!;
      return Math.hypot(joint.x - from.x, joint.y - from.y);
    };

    const rests = ['B', 'F', 'I'].map(restOf);
    service.animate(service.stepAtTime(service.cyclePeriod() / 3));
    expect(moved('B', rests[0])).toBeGreaterThan(0.1);
    expect(moved('F', rests[1])).toBeGreaterThan(0.1);
    expect(moved('I', rests[2])).toBeGreaterThan(0.1);

    service.setSyncMechanisms(false);
    service.seekMechanism(0, service.mechanisms[0].cyclePeriod / 4);
    service.updateMechanism();
    // Unsyncing must not redefine anybody's start pose.
    const start = service.mechanisms[0].joints[0].find((joint) => joint.id === 'B')!;
    expect(start.x).toBeCloseTo(rests[0].x, 6);
    expect(start.y).toBeCloseTo(rests[0].y, 6);
  });

  it('is a kinematics demonstration, so it carries no mass at all', () => {
    const { built } = threeMachines();
    built.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .forEach((link) => {
        expect(link.mass, link.id).toBe(0);
        expect(link.massMoI, link.id).toBe(0);
      });
  });

  it('carries all three drive speeds in the URL it is published as', () => {
    // The three speeds are the drawing. A URL that dropped them would open as
    // three machines locked to one document default, which is the very thing
    // per-joint speeds exist to stop.
    const decoder = new StringTranscoder();
    decoder.decodeURL(fixturePayload(threeMachinesFixture()));

    const speed = (id: string) => decoder.getJoints().find((joint) => joint.id === id)!.driveSpeed;
    expect(speed('A')).toBeCloseTo(10, 3);
    expect(speed('E')).toBeCloseTo(-8, 3);
    expect(speed('H')).toBeCloseTo(12, 3);
  });
});
