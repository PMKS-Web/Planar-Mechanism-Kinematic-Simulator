// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint, RevJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { PrisJoint } from '../../app/model/joint';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { DragStateService } from '../../app/services/drag-state.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { LengthUnit } from '../../app/model/utils';
import { coordinateRuleFor, coordinatesAcross } from '../../app/model/mechanism/anchor';
import { nearlyNonGrashofFixture } from '../../test-utils/verification/fixtures';
import { MechanismFixture, buildMechanism } from '../../test-utils/verification/fixture';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { SelectedTabService, TabID } from '../../app/selected-tab.service';

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

  it('mints exactly one entry for an edit that captures the pose', () => {
    // Adding a link, welding and dropping a cylinder are staged and then
    // settled onto the anchor, which is two rebuilds -- so the inner save is
    // held and the settle's own rebuild is the one that writes the entry.
    // Where the settle *cannot* re-anchor, though, it runs no rebuild at all,
    // and the edit was left out of the history entirely: it had happened, and
    // Undo would not take it back.
    const { service, joints, saveCount } = oneBar();
    displace(service);
    const before = saveCount();

    service.weldJoint(joints[1]);

    expect(joints[1].isWelded).toBe(true);
    expect(saveCount() - before).toBe(1);
    expect(service.posedEditKey).toBeNull();
  });

  it('still mints one entry when several staged edits run inside one batch', () => {
    // A group edit stages per part -- one `capturingPose` per joint inside one
    // `batched` -- and a staging that cleared the hold outright dropped the
    // batch's, so every part after the first wrote an entry of its own. Eight
    // joints, eight presses of Undo, for one press of the control.
    const { service, joints, saveCount } = oneBar();
    displace(service);
    const before = saveCount();

    service.batched(() => {
      service.capturingPose(joints[1], () => service.weldJoint(joints[1]));
      service.capturingPose(joints[2], () => service.weldJoint(joints[2]));
    });

    expect(joints[1].isWelded).toBe(true);
    expect(joints[2].isWelded).toBe(true);
    expect(saveCount() - before).toBe(1);
    expect(service.posedEditKey).toBeNull();
  });

  it('closes a staging nobody is holding, before the rebuild can use it', () => {
    // The guard that replaced three rounds of hunting for paths that forget to
    // close their staging. A gesture opened with a pointer down and then
    // abandoned -- escape, a right click, a mode key, tabbing away -- leaves
    // the machine marked "seed this one from what is drawn", and the next
    // ambient rebuild makes the displaced pose the design.
    const harness = createMechanismHarness();
    const parts = fourBar(harness.service, 'A', 0);
    const service = harness.service;
    const drag = harness.injector.get(DragStateService);
    service.updateMechanism();
    displace(service);
    const anchored = startCoordinate(service, 0);

    // A pointer goes down, the gesture stages and moves something...
    drag.press();
    expect(service.beginPosedEdit(parts.joints[1])).toBe(true);
    parts.joints[1].x += 0.3;
    service.updateMechanism();
    // ...and then the gesture dies without anyone closing it.
    drag.cancel();
    expect(service.posedEditKey).not.toBeNull();

    // The next rebuild is where that would have become the design.
    service.updateMechanism();
    expect(service.posedEditKey).toBeNull();
    expect(startCoordinate(service, 0)).toBeCloseTo(anchored, 1);
  });

  it('takes one entry for a delete held mid-drag, not two', () => {
    // A delete is identity-addressed, so it closes any staging first. And a
    // gesture abandoned by one must forfeit what it earned: the credits used to
    // survive `DragState.cancel`, so the later release spent them on a second
    // entry and the first Undo took back half of what the reader saw happen.
    const harness = createMechanismHarness();
    const parts = fourBar(harness.service, 'A', 0);
    const service = harness.service;
    const drag = harness.injector.get(DragStateService);
    service.updateMechanism();
    displace(service);

    drag.press();
    expect(service.beginPosedEdit(parts.joints[1])).toBe(true);
    parts.joints[1].x += 0.3;
    service.updateMechanism();

    const before = harness.saveCount();
    service.activeObjService.updateSelectedObj(parts.joints[2]);
    service.deleteJoint();
    expect(harness.saveCount() - before).toBe(1);
    expect(service.posedEditKey).toBeNull();

    // And the release that follows has nothing left to spend.
    const outcome = drag.release();
    expect(outcome.save).toBe(false);
  });

  it('is put down when the release never arrives', () => {
    // A pointer let go in another tab, or the window hidden under it, sends
    // nothing to the page -- so the canvas went on believing a finger was down,
    // and that flag is exactly what the stale-staging guard reads. It refused
    // to close, and the next ambient rebuild made the displaced pose the
    // design.
    const harness = createMechanismHarness();
    const parts = fourBar(harness.service, 'A', 0);
    const service = harness.service;
    const drag = harness.injector.get(DragStateService);
    service.updateMechanism();
    displace(service);
    const anchored = startCoordinate(service, 0);

    drag.press();
    expect(service.beginPosedEdit(parts.joints[1])).toBe(true);
    parts.joints[1].x += 0.3;
    service.updateMechanism();

    // What the window's blur handler ends up doing: put everything down, as a
    // cancel rather than a release -- nobody finished the gesture, and there is
    // no position to finish it at.
    drag.cancel();
    service.cancelPosedEdit();
    expect(drag.isPointerDown).toBe(false);
    expect(service.posedEditKey).toBeNull();

    service.updateMechanism();
    expect(startCoordinate(service, 0)).toBeCloseTo(anchored, 1);
  });

  it('holds the edited machine at its own pose in a synced drawing too', () => {
    // Its zero is a statement, not an absence: while the gesture is in flight
    // the displayed pose *is* its provisional t = 0. Synced, `restoreOwnTimes`
    // treats a zero as "leave it on the master's clock" -- which is right for
    // every machine except this one, and carried the edited machine away from
    // the pose under the reader's hand by a third of a cycle.
    const harness = createMechanismHarness();
    fourBar(harness.service, 'A', 0);
    const second = fourBar(harness.service, 'E', 10);
    const service = harness.service;
    service.updateMechanism();
    expect(service.mechanisms).toHaveLength(2);
    expect(service.syncMechanisms).toBe(true);

    // Both machines a third of the way round, on the one shared clock.
    service.animate(service.stepAtTime(service.cyclePeriod() / 3));
    expect(service.isAtStartPose()).toBe(false);

    // Edit the second machine, which is not the master.
    expect(service.beginPosedEdit(second.joints[1])).toBe(true);
    const under = { x: second.joints[1].x, y: second.joints[1].y };
    second.joints[1].x += 0.3;
    const asked = { x: second.joints[1].x, y: second.joints[1].y };
    service.updateMechanism();

    // The joint is where the gesture put it, not a third of a cycle beyond it.
    const drift = Math.hypot(second.joints[1].x - asked.x, second.joints[1].y - asked.y);
    expect(drift).toBeLessThan(Math.hypot(asked.x - under.x, asked.y - under.y) + 0.05);
    service.finishPosedEdit();
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

  it('moves the anchor with an edit made at the start pose', () => {
    // The other half of the ratchet, and the one nothing was watching. An edit
    // made *at* the start pose is the reader changing the start, so the design's
    // t = 0 is the drawing as edited -- but the anchor was held across every
    // rebuild whose topology and rule were unchanged, so it went on naming the
    // angle the crank used to stand at. Nothing looked wrong until playback
    // moved: the ghost then drew that old angle, most of a turn from where
    // stop-to-start lands, which is what the reader reported.
    const { service, joints } = oneBar();
    expect(service.isAtStartPose()).toBe(true);

    // The driven crank's far pin, which is the one that changes the value the
    // anchor stores. A coupler pin would leave it alone and prove nothing.
    joints[1].x += 0.3;
    joints[1].y -= 0.2;
    service.updateMechanism(true);

    expect(service.anchorOf(0)!.coordinate).toBeCloseTo(startCoordinate(service, 0), 9);
    // And the ghost is the drawing's own start, which is where stop-to-start
    // goes and what the URL saves.
    const ghost = service.startPoseGhosts()[0];
    expect(ghost.reachable).toBe(true);
    expect(ghost.at).toBe(0);
    const start = service.mechanisms[0].joints[0];
    ghost.pins.forEach((pin, index) => {
      expect(Math.hypot(pin.x - start[index].x, pin.y - start[index].y)).toBeLessThan(1e-6);
    });
  });

  it('keeps the stored coordinate when an edit did not move the start', () => {
    // The guard above must not turn into "re-read the anchor every rebuild",
    // which is the drift `MachineAnchor` stores a coordinate to avoid. An edit
    // that leaves t = 0 where it was leaves the stored number untouched, to
    // the bit.
    const { service, joints } = oneBar();
    const held = service.anchorOf(0)!;
    service.updateMechanism();
    expect(service.anchorOf(0)!.coordinate).toBe(held.coordinate);
    // Even one that re-solves the cycle, as long as it does not move t = 0:
    // the coupler pin is not on the driven body.
    joints[2].x += 0.2;
    service.updateMechanism();
    expect(service.anchorOf(0)!.coordinate).toBe(held.coordinate);
  });

  it('is not at the start while any machine is parked away from its own', () => {
    // `seekMechanism` writes the shared sample index only for the *master*
    // machine -- the one with the longest cycle -- so any other machine can be
    // parked mid-cycle with that index still reading zero. Synced, this used
    // to answer "at the start", which is the answer `restoreStartPose` asks
    // before a rebuild: the second machine's displayed pose was written down
    // as its t = 0 by whatever edit came next, and the canvas drew no ghost
    // over it, because at the start pose there is nothing to draw.
    const harness = createMechanismHarness();
    fourBar(harness.service, 'A', 0);
    const second = fourBar(harness.service, 'E', 10);
    const service = harness.service;
    // A second machine that turns faster, so the first one is the master.
    second.joints[0].driveSpeed = 20;
    service.updateMechanism();
    expect(service.mechanisms).toHaveLength(2);
    const master = service.masterMechanismIndex();
    const other = master === 0 ? 1 : 0;

    const before = startPoses(service);
    service.seekMechanism(other, service.mechanisms[other].cyclePeriod / 3);
    expect(service.mechanismTimeStep).toBe(0);
    expect(service.isAtStartPose()).toBe(false);

    // And so an ambient rebuild does not take that pose for the design.
    service.updateMechanism();
    expect(startPoses(service)).toBe(before);
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

  it('holds an anchor through a rebuild the edit itself made unsolvable', () => {
    // One edit is often several steps, and the drawing between two of them is
    // a drawing nobody asked for: `JointTypeService` un-grounds a pin, retypes
    // it and grounds it again, and in the middle the machine counts a freedom
    // it will not have a moment later. The anchor sweep judged "still here" by
    // the solve, so that one rebuild dropped the anchor -- and the next valid
    // one took a fresh one from sample 0, which while the edit is staged is
    // the pose under the reader's hand. A grounded pin retyped a third of the
    // way round the cycle quietly made that pose the start.
    const { service, joints } = oneBar();
    const anchored = startCoordinate(service, 0);
    displace(service);
    const before = service.mechanisms[0].joints[0].map((joint) => ({ x: joint.x, y: joint.y }));

    expect(service.beginPosedEdit(joints[3])).toBe(true);
    joints[3].ground = false;
    service.updateMechanism();
    expect(service.mechanisms[0].isMechanismValid()).toBe(false);
    joints[3].ground = true;
    service.updateMechanism();

    expect(service.finishPosedEdit().reanchored).toBe(true);
    expect(startCoordinate(service, 0)).toBeCloseTo(anchored, 6);
    // To within the sample the re-anchor interpolates between -- not to the
    // digit, which is what a commit has never promised. Held by the old code,
    // `B` was most of a turn away rather than 4e-8.
    service.mechanisms[0].joints[0].forEach((joint, index) => {
      expect(Math.hypot(joint.x - before[index].x, joint.y - before[index].y)).toBeLessThan(1e-3);
    });
  });

  it('says so when a capturing edit moves a start, not only when a drag does', () => {
    // `capturingPose` read `reanchored` off the settle and threw the other
    // half away, so a menu row or a panel field that really did move a start
    // said nothing at all -- while the identical outcome reached by dragging
    // raised a message and marked the transport row. The one edit that cannot
    // be undone by eye was the one nothing narrated.
    const { service, joints } = oneBar();
    displace(service);
    expect(service.startMovedOn).toBeNull();

    // Somewhere the old start cannot exist any more: the crank is now longer
    // than the frame it turns inside.
    service.capturingPose(joints[1], () => {
      joints[1].x += 40;
      service.updateMechanism();
    });
    expect(service.startMovedOn).toBe(service.partitions[0].id);
  });

  it('draws no ghost at all for a machine with nothing anchored', () => {
    // The amber ghost is the last pose the start *could* be reached at, held
    // so that a drag past the edge of Grashof still has something to warn
    // over. Held past the anchor itself, it went on standing there in amber
    // after the machine's drive was switched off -- pointing at a start
    // nothing was holding, over a machine that has no start to lose, and
    // disagreeing with `anchorIsReachable`, which has always answered that a
    // machine with nothing anchored is not a machine in trouble.
    const { service } = oneBar();
    displace(service);
    // Drawing one fills the held pose the amber ghost is made of.
    expect(service.startPoseGhosts()).toHaveLength(1);

    // A machine that keeps its cycle and loses its anchor: retype its driven
    // joint into something whose input has no coordinate rule, and the anchor
    // goes while the frames stay. Reached here by taking it away directly,
    // because every route through the service either takes a fresh anchor or
    // stops the machine solving; `e2e/ghost-is-the-start.mjs` gets there by
    // the gesture the fuzz found.
    const inside = service as unknown as { anchors: Map<string, unknown>; ghostCache?: unknown };
    inside.anchors.clear();
    inside.ghostCache = undefined;
    expect(service.anchorOf(0)).toBeUndefined();
    expect(service.startPoseGhosts()).toEqual([]);

    // And an anchor taken again puts the ghost back, on the machine's start.
    service.updateMechanism();
    expect(service.startPoseGhosts()[0]?.reachable).toBe(true);
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

  // ---- a rebuild that re-measures the input --------------------------------

  it('holds the pose on screen when the drive moves to another joint', () => {
    // A rebuild carries each machine's elapsed seconds across and lays them
    // back on, which holds the pose exactly as long as the machine is
    // parameterized the same way on both sides of it. Move the drive from A to
    // B and it is not: t = 0.7 s meant "0.7 s of A turning" and now means "0.7
    // s of B turning". Held anyway, the linkage teleported the moment its input
    // changed -- while the *start* pose, which the anchor looks after, stayed
    // correctly put. The design was never in danger; the thing the reader was
    // looking at was.
    const { service, joints } = oneBar();
    const started = startPoses(service);
    displace(service);
    const shown = service.joints.map((joint) => [joint.id, joint.x, joint.y]);

    joints[0].input = false;
    joints[1].input = true;
    service.updateMechanism(true);

    expect(service.joints.map((joint) => [joint.id, joint.x, joint.y])).toEqual(
      shown.map(([id, x, y]) => [
        id,
        expect.closeTo(x as number, 3),
        expect.closeTo(y as number, 3),
      ])
    );
    // The clock is what gives, which is the same trade `reverseDrive` makes:
    // this pose is somewhere else entirely in B's cycle.
    expect(service.secondsOf(0)).not.toBeCloseTo(service.mechanisms[0].cyclePeriod / 3, 3);
    // And none of it moved the start.
    expect(startPoses(service)).toEqual(started);
  });

  it('leaves a machine alone when the rebuild does not re-measure it', () => {
    // The pose-holding above is keyed on the rule actually changing, so an
    // ordinary rebuild still restores by the clock -- which is what keeps a
    // scrubbed machine reading the time it was scrubbed to.
    const { service } = oneBar();
    displace(service);
    const seconds = service.secondsOf(0);
    service.updateMechanism(true);
    expect(service.secondsOf(0)).toBeCloseTo(seconds, 6);
  });
  // ---- capturing edits are staged, whichever door they come through -------
  //
  // §6.2 of the plan: an operation that reads geometry off the pose it is made
  // at captures that pose, and has to be staged and settled like a drag. Three
  // of them rebuilt directly. The restore then put every existing joint back
  // on the start pose and left the new part where the hand had put it -- so a
  // tracer point on the coupler stood half a mechanism off it at t = 0, a
  // force stood off the body it was drawn on, and a slider's block stayed
  // where its pin had been drawn while the pin went home.

  /** How far `p` stands from the segment `a`-`b`. */
  function offSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
  ): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby))
    );
    return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
  }

  it('puts a tracer point placed at a displaced pose on its link at the start', () => {
    const { service, joints, links, injector } = oneBar();
    const anchoredBefore = startCoordinate(service, 0);
    displace(service);
    const [, b, c] = joints;
    injector.get(ActiveObjService).updateSelectedObj(links[1]);
    service.addJointAt(new Coord((b.x + c.x) / 2, (b.y + c.y) / 2));

    const frames = service.mechanisms[0];
    const tracer = service.joints.find((joint) => joint.id === 'E') as RealJoint;
    expect(frames.isMechanismValid()).toBe(true);
    expect(tracer.showCurve).toBe(true);
    expect(injector.get(SettingsService).isShowTraces.value).toBe(true);
    const at0 = (id: string) => frames.joints[0].find((joint) => joint.id === id)!;
    expect(at0('E')).toBeDefined();
    expect(offSegment(at0('E'), at0('B'), at0('C'))).toBeLessThan(1e-6);
    // And the cycle still starts where it started.
    expect(startCoordinate(service, 0)).toBeCloseTo(anchoredBefore, 1);
  });

  it('keeps a force drawn at a displaced pose on its link at the start', () => {
    const { service, joints, links } = oneBar();
    const anchoredBefore = startCoordinate(service, 0);
    displace(service);
    const [, b, c] = joints;
    const mid = new Coord((b.x + c.x) / 2, (b.y + c.y) / 2);
    service.createForce(mid, new Coord(mid.x, mid.y + 1), links[1] as RealLink);

    const frames = service.mechanisms[0];
    expect(frames.isMechanismValid()).toBe(true);
    const at0 = (id: string) => frames.joints[0].find((joint) => joint.id === id)!;
    const force = frames.forces[0][0];
    expect(force).toBeDefined();
    expect(offSegment(force.startCoord, at0('B'), at0('C'))).toBeLessThan(1e-6);
    expect(startCoordinate(service, 0)).toBeCloseTo(anchoredBefore, 1);
  });

  it('maps additive attachments exactly without moving either unsynced machine or its start', () => {
    const harness = createMechanismHarness();
    const { service, settings, active } = harness;
    fourBar(service, 'A', 0);
    const second = fourBar(service, 'E', 10);
    service.updateMechanism();
    service.setSyncMechanisms(false);
    displace(service, 0);
    service.seekMechanism(1, service.mechanisms[1].cyclePeriod / 4);
    service.reverseDrive(1);
    const start = service.mechanisms.flatMap((frames) =>
      frames.joints[0].map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }))
    );
    const shown = service.joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y }));
    const clocks = service.partitions.map((_, index) => service.secondsOf(index));
    const [, b, c] = second.joints;
    const wanted = new Coord((b.x + c.x) / 2 + (c.y - b.y) / 5, (b.y + c.y) / 2 - (c.x - b.x) / 5);
    active.updateSelectedObj(second.links[1]);
    expect(service.canAttachAtPose(second.links[1])).toBe(true);
    const beforeSaves = harness.saveCount();
    service.addJointAt(wanted);
    const tracer = service.joints.find((joint) => !shown.some((old) => old.id === joint.id))!;
    // PositionSolver publishes coordinates rounded to four decimal places.
    expect(tracer.x).toBeCloseTo(wanted.x, 3);
    expect(tracer.y).toBeCloseTo(wanted.y, 3);
    const tail = new Coord((b.x + c.x) / 2, (b.y + c.y) / 2);
    const force = service.createForce(
      tail,
      new Coord(tail.x + 0.2, tail.y + 0.8),
      second.links[1]
    )!;
    expect(force.startCoord.x).toBeCloseTo(tail.x, 3);
    expect(force.startCoord.y).toBeCloseTo(tail.y, 3);
    expect(force.angleRad).toBeCloseTo(Math.atan2(0.8, 0.2), 6);
    expect(harness.saveCount() - beforeSaves).toBe(2);
    for (const expected of start) {
      const actual = service.mechanisms
        .flatMap((frames) => frames.joints[0])
        .find((joint) => joint.id === expected.id)!;
      expect({ id: actual.id, x: actual.x, y: actual.y }).toEqual(expected);
    }
    for (const expected of shown) {
      const actual = service.joints.find((joint) => joint.id === expected.id)!;
      // Reversing replaces reflected cached samples with a fresh solve in
      // the opposite direction, which accumulates a little rounding error.
      expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(0.002);
    }
    expect(service.partitions.map((_, index) => service.secondsOf(index))).toEqual(clocks);
    expect(service.mechanisms.every((frames) => frames.isMechanismValid())).toBe(true);
    const decoder = new StringTranscoder();
    decoder.decodeURL(encodeUrlOf(service, settings));
    const reopened = createMechanismHarness();
    new MechanismBuilder(reopened.service, decoder, reopened.settings, reopened.active).build(true);
    for (const expected of start) {
      const actual = reopened.service.joints.find((joint) => joint.id === expected.id)!;
      expect(actual.x).toBeCloseTo(expected.x, 3);
      expect(actual.y).toBeCloseTo(expected.y, 3);
    }
    expect(reopened.service.forces).toHaveLength(1);
    expect(reopened.service.joints).toHaveLength(start.length + 1);
    active.updateSelectedObj(tracer);
    expect(service.canDeleteTracerAtPose(tracer as RealJoint)).toBe(true);
    service.deleteJoint();
    expect(service.joints).toHaveLength(start.length);
    for (const expected of start) {
      const actual = service.mechanisms
        .flatMap((frames) => frames.joints[0])
        .find((joint) => joint.id === expected.id)!;
      expect({ id: actual.id, x: actual.x, y: actual.y }).toEqual(expected);
    }
    expect(service.partitions.map((_, index) => service.secondsOf(index))).toEqual(clocks);
    expect(service.mechanisms.every((frames) => frames.isMechanismValid())).toBe(true);
  });

  it('retains force direction edits and frame switches at a paused pose', () => {
    const { service, active, joints, links } = oneBar();
    const force = service.createForce(new Coord(1.5, 1.5), new Coord(1.5, 2.5), links[1])!;
    const start = startPoses(service);
    displace(service);
    active.updateSelectedObj(force);
    const shown = joints.map((joint) => [joint.x, joint.y]);
    const tail = { x: force.startCoord.x, y: force.startCoord.y };
    const originalAngle = force.angleRad;
    const beforeTurn = Math.atan2(joints[2].y - joints[1].y, joints[2].x - joints[1].x);
    const at0 = service.mechanisms[0].joints[0];
    const startTurn = Math.atan2(at0[2].y - at0[1].y, at0[2].x - at0[1].x);

    service.changeForceLocal();
    expect(force.local).toBe(true);
    expect(force.angleRad).toBeCloseTo(originalAngle, 6);
    const initialForce = service.mechanisms[0].forces[0][0];
    expect(Math.cos(initialForce.angleRad)).toBeCloseTo(
      Math.cos(originalAngle + startTurn - beforeTurn),
      6
    );
    const tip = { x: force.endCoord.x, y: force.endCoord.y };
    service.changeForceDirection();
    expect(force.arrowOutward).toBe(false);
    expect(force.endCoord.x).toBeCloseTo(tip.x, 6);
    expect(force.endCoord.y).toBeCloseTo(tip.y, 6);
    expect(Math.cos(force.angleRad)).toBeCloseTo(-Math.cos(originalAngle), 6);
    expect(Math.sin(force.angleRad)).toBeCloseTo(-Math.sin(originalAngle), 6);
    service.changeForceLocal();
    expect(force.local).toBe(false);
    expect(Math.cos(service.mechanisms[0].forces[0][0].angleRad)).toBeCloseTo(
      -Math.cos(originalAngle),
      6
    );
    expect(force.startCoord.x).toBeCloseTo(tail.x, 6);
    expect(force.startCoord.y).toBeCloseTo(tail.y, 6);
    expect(joints.map((joint) => [joint.x, joint.y])).toEqual(shown);
    expect(startPoses(service)).toBe(start);
    service.deleteForce(force);
    expect(service.forces).toHaveLength(0);
    expect(startPoses(service)).toBe(start);
    expect(joints.map((joint) => [joint.x, joint.y])).toEqual(shown);
  });

  it('keeps paused locks, shape and hold changes independent of mode and geometry', () => {
    const { service, active, injector, joints, links } = oneBar();
    const start = startPoses(service);
    displace(service);
    const shown = joints.map((joint) => [joint.x, joint.y]);
    for (const tab of [TabID.EDIT, TabID.ANALYZE, TabID.FORCE]) {
      injector.get(SelectedTabService).setTab(tab);
      expect(service.lockVisualsOn()).toBe(true);
      service.toggleLock(joints[1]);
      service.setAllLocks(true);
      service.setAllLocks(false);
      service.setHold(links[1], 'length');
      service.setHold(links[1], 'angle');
      service.releaseHolds([links[1]]);
      active.updateSelectedObj(links[0]);
      service.toggleLinkCircular();
      expect(startPoses(service)).toBe(start);
      expect(joints.map((joint) => [joint.x, joint.y])).toEqual(shown);
    }
  });

  it('puts a slider added at a displaced pose on its pin', () => {
    const { service, joints, injector } = oneBar();
    displace(service);
    injector.get(ActiveObjService).updateSelectedObj(joints[2]);
    service.toggleSlider();

    // A fresh slider dangles until it is given a guide, at the start pose as
    // much as here; what matters is that its block is on the pin it was put on.
    const block = service.joints.find((joint) => joint instanceof PrisJoint)!;
    expect(block).toBeDefined();
    expect(Math.hypot(block.x - joints[2].x, block.y - joints[2].y)).toBeLessThan(1e-6);
  });

  it('parks a machine at its new start when a release cannot re-anchor', () => {
    // The commit pose becomes t = 0 (§6.1), so every clock has to say so:
    // the machine's own, and the shared step half the app reads. Neither was
    // written, and the ghost cache still held the amber ghost the drag raised,
    // because nothing rebuilt once the anchor was dropped.
    const { service, joints } = oneBar();
    displace(service);
    expect(service.beginPosedEdit(joints[1])).toBe(true);
    // The crank, lengthened past any hope of turning: the four-bar becomes a
    // rocker whose swing does not include the angle it started at.
    joints[1].x += 6;
    joints[1].y -= 0.5;
    service.updateMechanism();
    const outcome = service.finishPosedEdit();

    expect(outcome.reanchored).toBe(false);
    expect(service.mechanisms[0].isMechanismValid()).toBe(true);
    expect(service.isAtStartPose()).toBe(true);
    expect(service.secondsOf(0)).toBe(0);
    expect(service.mechanismTimeStep).toBe(0);
    expect(service.startPoseGhosts().every((ghost) => ghost.reachable)).toBe(true);
    expect(service.anchorOf(0)).toBeDefined();
  });
});
