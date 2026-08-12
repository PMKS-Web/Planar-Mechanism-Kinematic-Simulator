// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MechanismService } from '../../app/services/mechanism.service';

/**
 * Two machines in one drawing, each solved on its own.
 *
 * The behaviour this protects is not that a second linkage can be drawn — it
 * always could — but that drawing it no longer breaks the first. Everything
 * used to go into one Mechanism, so a second four-bar took the document to
 * 2 degrees of freedom and *both* stopped simulating; the way to analyse one
 * was to delete the other.
 */
describe('two four-bars in one drawing', () => {
  /** A crank-rocker at `offset`, lettered from `from`, grounded at both ends. */
  function fourBar(service: MechanismService, from: string, offset: number) {
    const letter = (n: number) => String.fromCharCode(from.charCodeAt(0) + n);
    const at: [number, number][] = [
      [offset, 0],
      [offset, 1],
      [offset + 3, 2],
      [offset + 4, 0],
    ];
    const joints = at.map(([x, y], i) => new RevJoint(letter(i), x, y));
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

    service.joints.push(...joints);
    service.links.push(...links);
    return { joints, links };
  }

  function twoFourBars() {
    const harness = createMechanismHarness();
    const first = fourBar(harness.service, 'A', 0);
    const second = fourBar(harness.service, 'E', 10);
    harness.service.updateMechanism();
    return { ...harness, first, second };
  }

  it('solves each as its own 1-DoF machine, not one 2-DoF document', () => {
    const { service } = twoFourBars();

    expect(service.mechanisms).toHaveLength(2);
    expect(service.mechanisms.map((m) => m.dof)).toEqual([1, 1]);
    expect(service.mechanisms.every((m) => m.isMechanismValid())).toBe(true);
    expect(service.allMechanismsValid()).toBe(true);
  });

  it('gives each its own input, so both may be driven at once', () => {
    const { service } = twoFourBars();

    // Both cranks are driven. Before the split, the second input was either
    // cleared by the one-input rule or ignored by the solver.
    const driven = service.partitions.map(
      (partition) => partition.joints.filter((j) => j instanceof RealJoint && j.input).length
    );
    expect(driven).toEqual([1, 1]);
  });

  it('answers which machine a part belongs to', () => {
    const { service, first, second } = twoFourBars();

    expect(service.indexOfMechanismContaining(first.joints[1])).toBe(0);
    expect(service.indexOfMechanismContaining(second.joints[1])).toBe(1);
    expect(service.indexOfMechanismContaining(second.links[0])).toBe(1);
    expect(service.isPartSimulatable(second.joints[1])).toBe(true);
  });

  it('leaves one running when the other is broken', () => {
    const { service, second } = twoFourBars();

    // Unground the second linkage's frame: its chain no longer reaches ground,
    // so it stops being a machine at all — without touching the first.
    second.joints[0].ground = false;
    second.joints[3].ground = false;
    service.updateMechanism();

    expect(service.mechanisms).toHaveLength(1);
    expect(service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(service.oneValidMechanismExists()).toBe(true);
    expect(service.allMechanismsValid()).toBe(true);
    expect(service.unassigned.floatingChains).toHaveLength(1);
    expect(service.unassigned.floatingChains[0].joints.map((j) => j.id).sort()).toEqual([
      'E',
      'F',
      'G',
      'H',
    ]);
  });

  it('lets each run at its own speed, and spans the longer cycle', () => {
    const { service, first, second } = twoFourBars();
    // 30 rpm against the document default of 20: the same crank turning twice
    // as fast has to come round in half the time.
    (first.joints[0] as RealJoint).driveSpeed = 30;
    service.updateMechanism();

    const [fast, slow] = service.mechanisms;
    expect(fast.cyclePeriod).toBeLessThan(slow.cyclePeriod);
    expect(fast.cyclePeriod).toBeCloseTo(slow.cyclePeriod * (20 / 30), 2);

    // The shared scrubber has to be long enough to hold the slowest machine,
    // or playback would cut off partway through it.
    expect(service.cyclePeriod()).toBeCloseTo(slow.cyclePeriod, 6);
    expect(second.joints.length).toBeGreaterThan(0);
  });

  it('moves both when the shared clock advances, each on its own frames', () => {
    const { service, first, second } = twoFourBars();
    const restAt = (joint: RealJoint) => ({ x: joint.x, y: joint.y });
    const firstRest = restAt(first.joints[1]);
    const secondRest = restAt(second.joints[1]);

    // Half a turn in, both cranks have moved. The pose is written by id, so a
    // mechanism can only ever be placed on its own solved coordinates.
    service.animate(service.stepAtTime(service.cyclePeriod() / 2));

    const moved = (before: { x: number; y: number }, joint: RealJoint) =>
      Math.hypot(joint.x - before.x, joint.y - before.y);
    expect(moved(firstRest, first.joints[1])).toBeGreaterThan(0.1);
    expect(moved(secondRest, second.joints[1])).toBeGreaterThan(0.1);

    // And neither has been dragged onto the other's coordinates.
    expect(Math.abs(first.joints[1].x - second.joints[1].x)).toBeGreaterThan(5);
  });
});
