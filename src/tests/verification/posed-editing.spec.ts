// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { LengthUnit } from '../../app/model/utils';
import { coordinateRuleFor, coordinatesAcross } from '../../app/model/mechanism/anchor';
import { nearlyNonGrashofFixture } from '../../test-utils/verification/fixtures';
import { MechanismFixture, buildMechanism } from '../../test-utils/verification/fixture';

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

  /**
   * Put a published fixture into a real service, so a spec can name the same
   * mechanism a reader can open from `docs/fixture-urls.md`.
   */
  function buildFixtureInto(service: MechanismService, fixture: MechanismFixture): RealJoint[] {
    const built = buildMechanism(fixture);
    service.joints = built.joints;
    service.links = built.links;
    service.forces = built.forces;
    return built.joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);
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

    // Every trigger that genuinely rebuilds, one at a time, so a failure names
    // the one that broke it.
    settings.isGravity.next(!settings.isGravity.value);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    SettingsService._objectScale.next(SettingsService.objectScale * 1.5);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    // A unit change re-expresses every length in the drawing and re-solves it.
    settings.lengthUnit.next(LengthUnit.INCH);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);
    settings.lengthUnit.next(LengthUnit.CM);
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    // Force normalization and the sealed-cylinder pass both run inside every
    // rebuild; a bare one exercises them.
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);

    // And a save, which parks the drawing at t = 0 to encode and puts it back.
    service.updateMechanism(true);
    expect(startPoses(service)).toBe(before);
    expect(service.isAtStartPose()).toBe(false);
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

  it('cannot be left staged, whatever abandons the gesture', () => {
    // Every leak found so far has been the same shape: a path that let go of a
    // gesture without letting go of its staging, after which the next ambient
    // rebuild read "seed this machine from what is drawn" and the displaced
    // pose became the design. Two of those leaks were found by review, and one
    // of them broke four Playwright suites that have nothing to do with this
    // feature. So the property is asserted directly: staged, then abandoned,
    // then rebuilt, and t = 0 has not moved.
    const { service, joints } = oneBar();
    displace(service);
    const before = startPoses(service);

    expect(service.beginPosedEdit(joints[1])).toBe(true);
    joints[1].x += 0.3;
    service.cancelPosedEdit();
    service.updateMechanism();
    expect(service.posedEditKey).toBeNull();
    expect(startPoses(service)).toBe(before);

    // And several rebuilds later, because a leak that survives one rebuild
    // survives all of them.
    service.updateMechanism();
    service.updateMechanism(true);
    expect(startPoses(service)).toBe(before);
  });

  it('puts the machine back on its anchor when a gesture is abandoned', () => {
    // Forgetting the staging key is not enough, which is the whole subtlety.
    // Every pointer move has already solved a provisional cycle whose sample 0
    // is the pose under the reader's hand, so a machine merely unstaged has the
    // displaced pose as its canonical t = 0 and the next rebuild writes it
    // down. Escape mid-drag reached exactly that.
    const { service, joints } = oneBar();
    displace(service);
    const before = startPoses(service);

    const anchored = startCoordinate(service, 0);
    expect(service.beginPosedEdit(joints[1])).toBe(true);
    joints[1].x += 0.4;
    // A pointer move, which is what makes the provisional cycle real.
    service.updateMechanism();
    service.cancelPosedEdit();
    service.updateMechanism();

    // A cancel abandons the *staging*, not the geometry the pointer already
    // wrote -- so the drawing is not what it was, and asserting that it is
    // would be asserting an undo nobody performed. What must hold is that the
    // cycle still starts where it started: the machine is on its anchor, not
    // on the pose the reader's hand was over.
    expect(startPoses(service)).not.toBe(before);
    expect(startCoordinate(service, 0)).toBeCloseTo(anchored, 1);
  });

  it('scales the design, not the pose on screen, when the units change', () => {
    // `updateLinkageUnits` multiplies the live joints -- which mid-cycle are a
    // solved sample rather than t = 0 -- and the rebuild then restored them
    // from frames the scaling never touched. The scale was applied and undone
    // in the same call: the unit changed and the geometry did not.
    const { service, joints } = oneBar();
    const spanAtStart = () => {
      const frame = service.mechanisms[0].joints[0];
      const a = frame.find((joint) => joint.id === 'A')!;
      const d = frame.find((joint) => joint.id === 'D')!;
      return Math.hypot(d.x - a.x, d.y - a.y);
    };
    const before = spanAtStart();
    displace(service);

    service.updateLinkageUnits(LengthUnit.CM, LengthUnit.INCH);
    expect(spanAtStart() / before).toBeCloseTo(1 / 2.54, 4);
    expect(joints.length).toBe(4);

    service.updateLinkageUnits(LengthUnit.INCH, LengthUnit.CM);
    expect(spanAtStart() / before).toBeCloseTo(1, 4);
  });

  it('stages one machine at a time and no more', () => {
    // A second `beginPosedEdit` while one is open must not take the staging
    // from the first: whichever machine is put back on its anchor at the
    // commit, the other would have been left seeded from what is drawn.
    const harness = createMechanismHarness();
    const first = fourBar(harness.service, 'A', 0);
    const second = fourBar(harness.service, 'E', 10);
    const service = harness.service;
    service.updateMechanism();
    service.setSyncMechanisms(false);
    service.seekMechanism(0, service.mechanisms[0].cyclePeriod / 3);
    service.seekMechanism(1, service.mechanisms[1].cyclePeriod / 4);

    expect(service.beginPosedEdit(first.joints[1])).toBe(true);
    const staged = service.posedEditKey;
    expect(service.beginPosedEdit(second.joints[1])).toBe(false);
    expect(service.posedEditKey).toBe(staged);
    service.cancelPosedEdit();
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

  // ---- the published mechanism this is all about ---------------------------

  it('re-anchors a crank sitting on the edge of Grashof', () => {
    // The published mechanism, edited at a pose. Its links are 1.85, 2.75, 3.45
    // and 4.20: shortest plus longest is 6.05 against 6.20 for the other two,
    // so the crank turns all the way round by a margin of 0.15 and a reader can
    // open the URL and push it off that edge by hand.
    //
    // What it does *not* prove is the anchor going out of reach, and it is
    // worth saying why rather than leaving a reader to assume it does. Losing
    // Grashof is not that event: the anchor is a crank angle, a rotating crank
    // passes every angle, and a rocker's range still contains the pose the
    // mechanism was drawn in. The start goes out of reach when the new limits
    // exclude it, which is covered where it actually reproduces -- by the
    // commit-pose test above, and on screen by `e2e/posed-editing.mjs`, which
    // drags until the ghost warns rather than by a figure worked out in advance.
    const harness = createMechanismHarness();
    const built = buildFixtureInto(harness.service, nearlyNonGrashofFixture());
    harness.service.updateMechanism();
    expect(harness.service.mechanisms[0].isMechanismValid()).toBe(true);
    const anchoredBefore = startCoordinate(harness.service, 0);

    const pivot = built.find((joint) => joint.id === 'A')!;
    const crankEnd = built.find((joint) => joint.id === 'B')!;
    const crankLength = () => Math.hypot(crankEnd.x - pivot.x, crankEnd.y - pivot.y);
    const was = crankLength();

    displace(harness.service);
    expect(harness.service.beginPosedEdit(crankEnd)).toBe(true);
    crankEnd.y += was * 0.2;
    harness.service.updateMechanism();
    expect(harness.service.finishPosedEdit().reanchored).toBe(true);

    // Changed, not grown: at a displaced pose the crank's far pin is somewhere
    // on its circle, so pulling it in +y is as likely to shorten the bar as to
    // lengthen it. What matters is that the edit landed.
    expect(Math.abs(crankLength() - was)).toBeGreaterThan(was * 0.05);
    expect(startCoordinate(harness.service, 0)).toBeCloseTo(anchoredBefore, 1);
  });

  // ---- the indicator and the commit tell the same story --------------------

  it('warns before it commits, and only when the commit will move the start', () => {
    // The honesty check the plan's Gate 2 asks for. The ghost's warning and the
    // commit's outcome are the same lookup by construction now -- this is what
    // holds them to it, because "by construction" is a claim about code that
    // can stop being true.
    const { service, joints } = oneBar();
    displace(service);
    expect(service.beginPosedEdit(joints[1])).toBe(true);

    // Somewhere the linkage still assembles: no warning, and the commit
    // re-anchors.
    joints[1].x += 0.2;
    service.updateMechanism();
    expect(service.anchorIsReachable(0)).toBe(true);
    expect(service.finishPosedEdit().reanchored).toBe(true);

    // And somewhere it does not.
    displace(service);
    expect(service.beginPosedEdit(joints[1])).toBe(true);
    joints[1].x += 40;
    service.updateMechanism();
    const warned = !service.anchorIsReachable(0);
    const outcome = service.finishPosedEdit();
    expect(warned).toBe(true);
    expect(outcome.reanchored).toBe(false);
    // Named, so the message the reader gets says which machine moved.
    expect(outcome.lost).toBeDefined();
  });

  it('draws the ghost at the anchored pose, not at the pose being dragged', () => {
    // While a posed edit is staged, sample 0 of the provisional cycle is the
    // pose under the reader's hand. A ghost drawn from it draws the mechanism
    // on top of itself and calls that the start -- which is exactly the picture
    // that would have made the reader believe nothing had moved.
    const { service, joints } = oneBar();
    displace(service);
    const shown = joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));
    expect(service.beginPosedEdit(joints[1])).toBe(true);
    joints[1].x += 0.2;
    service.updateMechanism();

    const ghost = service.startPoseGhosts()[0];
    expect(ghost).toBeDefined();
    // The ghost is somewhere else entirely from the drawn pose.
    const apart = ghost.pins.map((pin, index) =>
      Math.hypot(pin.x - shown[index].x, pin.y - shown[index].y)
    );
    expect(Math.max(...apart)).toBeGreaterThan(0.2);
    service.finishPosedEdit();
  });

  it('gives up an anchor whose joint stopped being the driven one', () => {
    // The owned-joint set is unchanged when the drive moves from one joint to
    // another, so a key built from it alone kept an anchor naming a joint that
    // is no longer driven -- read against the wrong quantity, and the start
    // would land anywhere.
    const { service, joints } = oneBar();
    const first = service.anchorOf(0);
    expect(first?.jointId).toBe(joints[0].id);

    joints[0].input = false;
    joints[3].input = true;
    service.updateMechanism();
    expect(service.anchorOf(0)?.jointId).toBe(joints[3].id);
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
