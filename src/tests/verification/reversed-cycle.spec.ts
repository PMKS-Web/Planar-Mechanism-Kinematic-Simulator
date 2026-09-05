import { createMechanismHarness, withTestInjector } from '../../test-utils/mechanism-harness';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import {
  BUILT_IN_TEMPLATE_IDS,
  TEMPLATE_LINKAGES,
} from '../../app/component/MODALS/templates/template-linkages';
import { MechanismService } from '../../app/services/mechanism.service';
import { RealJoint } from '../../app/model/joint';

/**
 * Reversing a drive keeps the cycle exactly where it is and turns the machine
 * round on it, so a reader keeps their place on the chart.
 *
 * That is only allowed to be cheaper and steadier -- never a different answer.
 * The oracle here is a full re-solve with the drive negated, which walks the
 * same loop the other way: its sample k is the same pose as our sample N-1-k,
 * and everything physical has to agree there.
 */
function load(payload: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  return harness;
}

/** Turn the drive round the expensive way: solve the whole thing again. */
function reverseBySolving(service: MechanismService, index: number): void {
  const driven = service.partitions[index]?.joints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  )!;
  service.setDriveSpeed(driven, -service.driveSpeedOf(driven));
  service.updateMechanism(false);
}

function samplesOf(settings: SettingsService) {
  return withTestInjector(
    [{ provide: SettingsService, useValue: settings }],
    () => new AnalysisSampleService()
  );
}

describe('Reversing a drive', () => {
  for (const id of BUILT_IN_TEMPLATE_IDS) {
    it(`agrees with a full re-solve, pose for pose, on ${id}`, () => {
      const quick = load(TEMPLATE_LINKAGES[id]);
      const slow = load(TEMPLATE_LINKAGES[id]);
      expect(quick.service.mechanisms[0]?.isMechanismValid()).toBe(true);

      const before = quick.service.mechanisms[0];
      expect(quick.service.reverseDrive(0)).toBe(true);
      const ours = quick.service.mechanisms[0];
      reverseBySolving(slow.service, 0);
      const theirs = slow.service.mechanisms[0];

      const last = theirs.joints.length - 1;
      expect(ours.joints.length).toBe(theirs.joints.length);

      // The cycle did not move: our frames are the ones we already had.
      let worstHeld = 0;
      for (let frame = 0; frame <= last; frame++) {
        for (let joint = 0; joint < before.joints[frame].length; joint++) {
          const a = ours.joints[frame][joint];
          const b = before.joints[frame][joint];
          worstHeld = Math.max(worstHeld, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(worstHeld).toBe(0);

      // ...and it is the re-solve read from the other end, which is the same
      // loop walked the other way.
      let worstPose = 0;
      for (let frame = 0; frame <= last; frame++) {
        for (let joint = 0; joint < theirs.joints[frame].length; joint++) {
          const a = ours.joints[last - frame][joint];
          const b = theirs.joints[frame][joint];
          worstPose = Math.max(worstPose, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(worstPose).toBeLessThan(0.01);

      const jointId = theirs.joints[0].find(
        (joint): joint is RealJoint => joint instanceof RealJoint && !joint.ground
      )!.id;
      const at = (
        mechanism: typeof ours,
        index: number,
        property: string,
        settings: SettingsService
      ) => samplesOf(settings).sampleAt(mechanism, index, 'kinematic', 'loop', property, jointId);

      for (const property of ['Linear Joint Pos', 'Linear Joint Vel', 'Linear Joint Acc']) {
        for (const frame of [0, 37, 180]) {
          if (frame > last) continue;
          const mine = at(ours, last - frame, property, quick.settings);
          const other = at(theirs, frame, property, slow.settings);
          expect(mine.length).toBe(other.length);
          expect(mine.length).toBeGreaterThan(0);
          mine.forEach((value, index) => {
            expect(Math.abs(value - other[index])).toBeLessThan(0.02);
          });
        }
      }

      // The forces too, and dynamic as well as static -- the mode where the
      // input speed enters the answer at all, through the inertia of the
      // moving parts. Checked against the re-solve rather than against our own
      // claim that reversing cannot change them.
      for (const mode of ['static', 'dynamic'] as const) {
        const mine = ours.getForceAnalysis(mode);
        const other = theirs.getForceAnalysis(mode);
        expect(mine.frames.length).toBe(other.frames.length);
        expect(mine.successfulFrames).toBe(other.successfulFrames);
        let compared = 0;
        for (const frame of [0, 37, 180]) {
          if (frame > last) continue;
          const a = mine.frames[last - frame];
          const b = other.frames[frame];
          if (!a || !b || b.status !== 'ok') continue;
          expect(a.status).toBe(b.status);
          for (const [joint, force] of b.jointReactions) {
            const ourForce = mine.frames[last - frame].jointReactions.get(joint);
            expect(ourForce).toBeDefined();
            expect(Math.abs(ourForce![0] - force[0])).toBeLessThan(0.05);
            expect(Math.abs(ourForce![1] - force[1])).toBeLessThan(0.05);
            compared++;
          }
          // What the drive has to supply at that pose, which is the quantity a
          // reversal is most likely to get wrong: power is torque times speed,
          // and the speed has just changed sign.
          if (a.inputEffort && b.inputEffort) {
            expect(Math.abs(a.inputEffort.valueSI - b.inputEffort.valueSI)).toBeLessThan(0.05);
            compared++;
          }
        }
        expect(compared).toBeGreaterThan(0);
      }
    });
  }

  it('turns every velocity round and leaves the accelerations alone', () => {
    const { service, settings } = load(TEMPLATE_LINKAGES['4-Bar']);
    // A joint that actually moves: a grounded one reads zero at every sample,
    // and "zero turned round is zero" would prove nothing.
    const jointId = service.mechanisms[0].joints[0].find(
      (joint): joint is RealJoint => joint instanceof RealJoint && !joint.ground
    )!.id;
    const read = (property: string) =>
      samplesOf(settings).sampleAt(
        service.mechanisms[0],
        12,
        'kinematic',
        'loop',
        property,
        jointId
      );

    const positionWas = read('Linear Joint Pos');
    const velocityWas = read('Linear Joint Vel');
    const accelerationWas = read('Linear Joint Acc');
    expect(velocityWas.some((value) => Math.abs(value) > 1e-6)).toBe(true);

    service.reverseDrive(0);

    // Same sample, same pose: the reader has not been moved.
    read('Linear Joint Pos').forEach((value, index) => {
      expect(value).toBeCloseTo(positionWas[index], 9);
    });
    // The joint really is going the other way now. The third series is the
    // magnitude, which has no direction to turn round.
    const velocityNow = read('Linear Joint Vel');
    expect(velocityNow[0]).toBeCloseTo(-velocityWas[0], 9);
    expect(velocityNow[1]).toBeCloseTo(-velocityWas[1], 9);
    expect(velocityNow[2]).toBeCloseTo(velocityWas[2], 9);
    // Acceleration goes as the square of the speed, so it does not.
    read('Linear Joint Acc').forEach((value, index) => {
      expect(value).toBeCloseTo(accelerationWas[index], 9);
    });
  });

  it('leaves the force analysis alone, statically and dynamically', () => {
    // What a part has to carry at a pose does not depend on which way it
    // arrived there: at constant speed the inertial terms go as the square of
    // the input speed, so they are blind to its sign.
    const { service } = load(TEMPLATE_LINKAGES['4-Bar']);
    const before = (['static', 'dynamic'] as const).map((mode) =>
      service.mechanisms[0].getForceAnalysis(mode)
    );
    service.reverseDrive(0);
    const after = (['static', 'dynamic'] as const).map((mode) =>
      service.mechanisms[0].getForceAnalysis(mode)
    );

    before.forEach((was, mode) => {
      const now = after[mode];
      expect(now.frames.length).toBe(was.frames.length);
      expect(now.successfulFrames).toBe(was.successfulFrames);
      expect(was.successfulFrames).toBeGreaterThan(0);
      for (const frame of [0, 37, 180]) {
        const a = now.frames[frame];
        const b = was.frames[frame];
        if (!a || !b || b.status !== 'ok') continue;
        expect(a.status).toBe(b.status);
        for (const [joint, force] of b.jointReactions) {
          const mine = a.jointReactions.get(joint);
          expect(mine).toBeDefined();
          expect(mine![0]).toBeCloseTo(force[0], 6);
          expect(mine![1]).toBeCloseTo(force[1], 6);
        }
      }
    });
  });

  it('leaves the crank where it is, and says it is going the other way', () => {
    // Two readers used to double-count the reversal. The drive profile builds
    // the crank angle by walking the samples, so reading the drive's new sign
    // there mirrored the whole track and threw the transport handle to the far
    // end of a machine that had not moved; and the direction label XORs the
    // drive sign with the way playback runs, which canceled to "unchanged"
    // once reversing flipped both.
    const { service } = load(TEMPLATE_LINKAGES['4-Bar']);
    service.animate(40, false);
    const travelWas = service.travelOf(0);
    const forwardWas = service.travelingForward(0);
    expect(travelWas).toBeDefined();

    expect(service.reverseDrive(0)).toBe(true);

    // The crank is at the same angle: nothing has moved.
    expect(service.travelOf(0)!).toBeCloseTo(travelWas!, 6);
    // ...and it is now turning the other way.
    expect(service.travelingForward(0)).toBe(!forwardWas);

    // Twice round is where it started, in every respect.
    service.reverseDrive(0);
    expect(service.travelOf(0)!).toBeCloseTo(travelWas!, 6);
    expect(service.travelingForward(0)).toBe(forwardWas);
  });

  it('stays reversed through an ordinary edit, rather than turning back', () => {
    // The quick reversal keeps the solved frames and walks them backwards. An
    // ordinary edit solves fresh frames from the drive's new sign, so those
    // already run the new way -- and walking them backwards as well turned the
    // machine back to its original direction while the stored speed said the
    // opposite.
    const { service } = load(TEMPLATE_LINKAGES['4-Bar']);
    const drivenSpeed = () =>
      service.driveSpeedOf(
        service.joints.find(
          (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
        )!
      );
    const wasForward = service.travelingForward(0);
    const wasSpeed = drivenSpeed();

    service.reverseDrive(0);
    expect(service.travelingForward(0)).toBe(!wasForward);
    expect(Math.sign(drivenSpeed())).toBe(-Math.sign(wasSpeed));

    // Any edit at all: this is the funnel every one of them goes through.
    service.updateMechanism(false);

    // Still reversed, and the drive and the motion still agree with each other.
    expect(Math.sign(drivenSpeed())).toBe(-Math.sign(wasSpeed));
    expect(service.travelingForward(0)).toBe(!wasForward);
    expect(service.mechanisms[0].framesRunBackwards).toBe(false);
    expect(service.directionOf(0)).toBe(1);
  });

  it('preserves a paused frame through reversal, redraw, resume and a rebuild', () => {
    const { service } = load(TEMPLATE_LINKAGES['4-Bar']);
    const start = service.joints.map((joint) => ({ x: joint.x, y: joint.y }));
    service.seekMechanism(0, 1.5);
    const before = service.joints.map((joint) => ({ x: joint.x, y: joint.y }));
    const sample = service.currentSampleOf(0);
    const seconds = service.secondsOf(0);
    const period = service.mechanisms[0].cyclePeriod;
    service.reverseDrive(0);
    expect(service.secondsOf(0)).toBeCloseTo(period - seconds, 9);
    expect(service.currentSampleOf(0)).toBe(sample);
    service.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(before[index].x, 8);
      expect(joint.y).toBeCloseTo(before[index].y, 8);
    });
    // The first resumed frame must move a small distance in the opposite
    // direction, rather than teleport to the reflected physical pose.
    service.seekMechanism(0, service.secondsOf(0) + 0.01);
    expect(service.currentSampleOf(0)).toBeLessThan(sample);
    const b = service.joints.find((joint) => joint.id === 'B')!;
    const oldB = before[service.joints.indexOf(b)];
    expect(Math.hypot(b.x - oldB.x, b.y - oldB.y)).toBeLessThan(10);
    const moved = service.joints.map((joint) => ({ x: joint.x, y: joint.y }));
    service.updateMechanism(false);
    service.joints.forEach((joint, index) => {
      expect(Math.hypot(joint.x - moved[index].x, joint.y - moved[index].y)).toBeLessThan(0.02);
    });
    service.animate(0, false);
    service.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(start[index].x, 8);
      expect(joint.y).toBeCloseTo(start[index].y, 8);
    });
  });

  it('reflects only the reversed machine while playback is synced', () => {
    const { service } = load(TEMPLATE_LINKAGES['Three_Machines']);
    service.animate(60, false);
    const seconds = service.mechanisms.map((_, index) => service.secondsOf(index));
    const samples = service.mechanisms.map((_, index) => service.currentSampleOf(index));
    const before = service.joints.map((joint) => ({ x: joint.x, y: joint.y }));
    service.reverseDrive(0);
    for (let index = 1; index < service.mechanisms.length; index++) {
      expect(service.secondsOf(index)).toBe(seconds[index]);
      expect(service.currentSampleOf(index)).toBe(samples[index]);
    }
    service.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(before[index].x, 8);
      expect(joint.y).toBeCloseTo(before[index].y, 8);
    });
  });

  it('keeps reversal at the authored start at zero seconds', () => {
    const { service } = load(TEMPLATE_LINKAGES['4-Bar']);
    service.reverseDrive(0);
    expect(service.secondsOf(0)).toBe(0);
    expect(service.currentSampleOf(0)).toBe(0);
    expect(service.isAtStartPose()).toBe(true);
  });

  it('declines when there is no solved cycle to turn round', () => {
    const harness = createMechanismHarness();
    expect(harness.service.mechanisms[0]?.withReversedDrive()).toBeUndefined();
  });
});
