// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { coordinateRuleFor, coordinatesAcross } from '../../app/model/mechanism/anchor';

/**
 * Editing at a pose other than the one the drawing starts in.
 *
 * The failure this guards against has a name in the plan: the **ratchet**. The
 * editable joints are simultaneously the design, the drawn pose, and what a
 * rebuild deep-copies as t = 0 -- so a rebuild that runs while playback has
 * moved them silently redefines "start" as wherever playback happened to be.
 * Every mid-cycle tweak nudges it, no single one looks wrong, and a URL shared
 * as homework opens somewhere the author never drew.
 *
 * Everything below is a way of asking: did the start move when nobody asked it
 * to, and did it stay put when somebody did.
 */
describe('editing at a displaced pose', () => {
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

  function oneBar() {
    const harness = createMechanismHarness();
    const parts = fourBar(harness.service, 'A', 0);
    harness.service.updateMechanism();
    return { ...harness, ...parts };
  }

  /** Every machine's t = 0, to the digit, which is what a ratchet moves. */
  function startPoses(service: MechanismService): string {
    return JSON.stringify(
      service.mechanisms.map((frames) =>
        frames.joints[0].map((joint) => [joint.id, joint.x, joint.y])
      )
    );
  }

  /** Park the whole drawing a third of the way through its cycle. */
  function displace(service: MechanismService, index = 0): void {
    service.seekMechanism(index, service.mechanisms[index].cyclePeriod / 3);
    expect(service.isAtStartPose()).toBe(false);
  }

  /** The driven coordinate at t = 0, which is what the anchor stores. */
  function startCoordinate(service: MechanismService, index: number): number {
    const driven = service.partitions[index].ownJoints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    const rule = coordinateRuleFor(driven)!;
    return coordinatesAcross(rule, service.mechanisms[index].joints)[0]!;
  }

  // ---- the ratchet ---------------------------------------------------------

  it('leaves the start pose alone when an ambient rebuild runs mid-cycle', () => {
    // Not "opening Settings", which has been a no-op since the panel learned to
    // skip its first emission -- these are the triggers that genuinely rebuild.
    const { service, settings } = oneBar();
    displace(service);
    const before = startPoses(service);

    settings.isGravity.next(!settings.isGravity.value);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    SettingsService._objectScale.next(SettingsService.objectScale * 1.5);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    service.updateMechanism();
    expect(startPoses(service)).toBe(before);
  });

  // ---- the edit survives, and so does the anchor ---------------------------

  it('keeps a lengthened link and the input value the cycle started at', () => {
    // The test the plan's first draft would have failed. That draft stored the
    // whole start pose and re-applied it, which after a geometry edit either
    // erases the edit or bends the links -- because the correct pose at the
    // same input value has different coordinates by construction.
    const { service, joints } = oneBar();
    const anchoredBefore = startCoordinate(service, 0);
    displace(service);

    expect(service.beginPosedEdit(joints[1])).toBe(true);
    // Lengthen the crank by moving its far pin, at the displaced pose.
    joints[1].x += 0.4;
    joints[1].y += 0.25;
    service.updateMechanism();
    const outcome = service.finishPosedEdit();

    expect(outcome.reanchored).toBe(true);
    // The edit landed: the crank is longer than it was.
    const crank = service.mechanisms[0].joints[0];
    const a = crank.find((joint) => joint.id === 'A')!;
    const b = crank.find((joint) => joint.id === 'B')!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1.05);
    // And the cycle still starts at the input value it started at. Within half
    // a sample, which is what a stored coordinate read back off a sampled cycle
    // can promise -- and, because it is *stored*, the error does not accumulate
    // over repeated edits the way a re-derived one would.
    expect(startCoordinate(service, 0)).toBeCloseTo(anchoredBefore, 1);
  });

  it('does not drift the start over repeated posed edits', () => {
    // The reason the coordinate is stored rather than re-read from the samples
    // each time. Re-derived, each edit would round to the nearest sample and
    // the next would round from there; stored, every edit is measured against
    // the same number and the error stays bounded.
    const { service, joints } = oneBar();
    const anchored = startCoordinate(service, 0);
    for (let i = 0; i < 6; i++) {
      displace(service);
      expect(service.beginPosedEdit(joints[2])).toBe(true);
      joints[2].x += 0.05;
      service.updateMechanism();
      service.finishPosedEdit();
    }
    expect(startCoordinate(service, 0)).toBeCloseTo(anchored, 1);
  });

  // ---- the neighbors -------------------------------------------------------

  it('leaves an untouched machine where it started, and where it was', () => {
    // A rebuild is global, so a naive "skip the restore" would turn *every*
    // displaced machine's shown pose into its provisional t = 0 -- corrupting
    // machines the edit never went near. The restore is skipped for exactly
    // one machine, and only for the length of a gesture.
    const harness = createMechanismHarness();
    const first = fourBar(harness.service, 'A', 0);
    fourBar(harness.service, 'E', 10);
    const service = harness.service;
    service.updateMechanism();
    expect(service.mechanisms).toHaveLength(2);

    service.setSyncMechanisms(false);
    service.seekMechanism(0, service.mechanisms[0].cyclePeriod / 3);
    service.seekMechanism(1, service.mechanisms[1].cyclePeriod / 4);
    const neighborStart = JSON.stringify(
      service.mechanisms[1].joints[0].map((joint) => [joint.id, joint.x, joint.y])
    );
    const neighborClock = service.secondsOf(1);

    expect(service.beginPosedEdit(first.joints[1])).toBe(true);
    first.joints[1].x += 0.3;
    service.updateMechanism();
    service.finishPosedEdit();

    expect(
      JSON.stringify(service.mechanisms[1].joints[0].map((joint) => [joint.id, joint.x, joint.y]))
    ).toBe(neighborStart);
    expect(service.secondsOf(1)).toBeCloseTo(neighborClock, 6);
  });

  // ---- what the model refuses to stage -------------------------------------

  it('stages nothing at the start pose, where the drawing already is its design', () => {
    const { service, joints } = oneBar();
    expect(service.isAtStartPose()).toBe(true);
    expect(service.beginPosedEdit(joints[1])).toBe(false);
    expect(service.posedEditKey).toBeNull();
  });

  it('promotes the pose on screen when the reader asks for it outright', () => {
    // The honest counterpart of the automatic re-anchoring: the same machinery,
    // asked for on purpose. Afterwards the drawing *is* at its start, because
    // the pose it was showing is now what that means.
    const { service, joints } = oneBar();
    displace(service);
    const was = startPoses(service);

    expect(service.setCurrentPoseAsStart(joints[1])).toBe(true);
    expect(startPoses(service)).not.toBe(was);
    expect(service.isAtStartPose()).toBe(true);
  });

  // ---- what an operation *means*, by category (plan §6.2) ------------------

  it('applies an identity-addressed edit to the design, not to the pose', () => {
    // Deleting a link at frame 40 must not freeze frame 40 into the drawing as
    // a side effect. Nothing about the displaced pose is part of what "delete
    // that link" says, so the restore runs as it always did and t = 0 is
    // whatever it was.
    const { service, joints, links } = oneBar();
    const before = startPoses(service);
    displace(service);

    // Ungrounding the input's pivot is the plainest identity-addressed edit
    // there is, and it also stops the machine running -- the §6.2 case where
    // the pose was never part of the edit.
    joints[3].ground = false;
    service.updateMechanism(true);

    expect(service.mechanisms.some((frames) => frames.isMechanismValid())).toBe(false);
    // With no cycle left there is no displaced pose to be at, and the clock
    // says so rather than pointing into a cycle that no longer exists.
    expect(service.mechanismTimeStep).toBe(0);
    expect(service.isAtStartPose()).toBe(true);

    // Put it back, and the drawing is the one it started as -- not a snapshot
    // of wherever playback happened to be when the ground came off.
    joints[3].ground = true;
    service.updateMechanism(true);
    expect(startPoses(service)).toBe(before);
    expect(links.length).toBe(3);
  });

  it('keeps the commit pose when a pose-relative edit is what broke it', () => {
    // The other half of §6.2. A drag *is* about the pose it was made at, so
    // when it leaves nothing that can run, the pose it was committed at is the
    // only consistent geometry there is and it becomes the drawing.
    const { service, joints } = oneBar();
    displace(service);
    expect(service.beginPosedEdit(joints[1])).toBe(true);
    // Far enough that the loop cannot close at all.
    joints[1].x += 40;
    service.updateMechanism();
    const outcome = service.finishPosedEdit();

    expect(outcome.reanchored).toBe(false);
    // The edit landed rather than being reverted for anchor reasons, which is
    // the rule: the way back is Undo, and the entry beside it holds both the
    // old geometry and the old start.
    expect(joints[1].x).toBeGreaterThan(30);
  });

  it('drops an anchor when the machine it named stops existing', () => {
    // `partitionKey` is the lowest owned joint id, which a fusion usually lets
    // one parent keep -- so an anchor keyed on it could be inherited by a
    // machine it was never taken from. Keyed on the whole owned set, a fusion
    // simply has no anchor and takes a fresh one from where it now starts.
    const harness = createMechanismHarness();
    const first = fourBar(harness.service, 'A', 0);
    const service = harness.service;
    service.updateMechanism();
    expect(service.anchorOf(0)).toBeDefined();

    // Delete a joint, and with it the machine that owned it.
    service.joints = service.joints.filter((joint) => joint.id !== first.joints[2].id);
    service.links = service.links.filter((link) => !link.id.includes(first.joints[2].id));
    service.updateMechanism();
    expect(service.anchorOf(0)?.topology).not.toBe('A,B,C,D');
  });
});
