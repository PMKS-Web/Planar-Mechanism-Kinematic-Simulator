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
 * Reversing a fully rotating drive reuses the cycle instead of solving it
 * again. That is only allowed to be faster — the answer has to be the answer.
 *
 * So every check here is against a real re-solve: the mechanism is turned
 * round the cheap way and the expensive way, and the two are compared.
 */
function load(payload: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  return harness;
}

/** Turn the drive round the way the app used to: solve the whole thing again. */
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

describe('A reversed cycle is the solved one', () => {
  // Every template with a rotating input, the slider-crank included: its
  // slider reciprocates but its crank goes all the way round, which is what
  // decides whether the cycle closes.
  for (const id of BUILT_IN_TEMPLATE_IDS) {
    it(`matches a full re-solve for ${id}`, () => {
      const cheap = load(TEMPLATE_LINKAGES[id]);
      const dear = load(TEMPLATE_LINKAGES[id]);
      // Asserted rather than skipped: a guard that returns quietly is a test
      // that passes without looking at anything.
      expect(cheap.service.mechanisms[0]?.isMechanismValid()).toBe(true);

      const mirrored = cheap.service.mechanisms[0].reversedCycle();
      expect(mirrored).toBeDefined();
      cheap.service.mechanisms[0] = mirrored!;
      reverseBySolving(dear.service, 0);

      const fromMirror = cheap.service.mechanisms[0];
      const fromSolver = dear.service.mechanisms[0];
      expect(fromMirror.joints.length).toBe(fromSolver.joints.length);

      // Poses, at every sample of the cycle.
      let worstPose = 0;
      for (let frame = 0; frame < fromSolver.joints.length; frame++) {
        for (let joint = 0; joint < fromSolver.joints[frame].length; joint++) {
          const a = fromMirror.joints[frame][joint];
          const b = fromSolver.joints[frame][joint];
          worstPose = Math.max(worstPose, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      // The solver rounds each sample to two decimals, so this is its own noise
      // rather than a difference of method.
      expect(worstPose).toBeLessThan(0.01);

      // And the quantities a graph would plot, which are derived from the pose
      // and the signed input speed rather than stored.
      const jointId = fromSolver.joints[0].find((joint) => joint instanceof RealJoint)!.id;
      for (const property of ['Linear Joint Pos', 'Linear Joint Vel', 'Linear Joint Acc']) {
        for (const at of [0, 37, 180, 300]) {
          if (at >= fromSolver.joints.length) continue;
          const mine = samplesOf(cheap.settings).sampleAt(
            fromMirror,
            at,
            'kinematic',
            'loop',
            property,
            jointId
          );
          const theirs = samplesOf(dear.settings).sampleAt(
            fromSolver,
            at,
            'kinematic',
            'loop',
            property,
            jointId
          );
          expect(mine.length).toBe(theirs.length);
          expect(mine.length).toBeGreaterThan(0);
          mine.forEach((value, index) => {
            expect(Math.abs(value - theirs[index])).toBeLessThan(0.02);
          });
        }
      }

      // Forces too, which is where a reversal would hide a sign error: they are
      // solved from the pose and the rates, so the cleared cache has to come
      // back with the same answers the re-solve gets.
      for (const mode of ['static', 'dynamic'] as const) {
        const mine = fromMirror.getForceAnalysis(mode);
        const theirs = fromSolver.getForceAnalysis(mode);
        expect(mine.frames.length).toBe(theirs.frames.length);
        expect(mine.successfulFrames).toBe(theirs.successfulFrames);
        for (const at of [0, 37, 180]) {
          const a = mine.frames[at];
          const b = theirs.frames[at];
          if (!a || !b || a.status !== 'ok' || b.status !== 'ok') continue;
          for (const [joint, force] of a.jointReactions) {
            const other = b.jointReactions.get(joint);
            expect(other).toBeDefined();
            expect(Math.abs(force[0] - other![0])).toBeLessThan(0.05);
            expect(Math.abs(force[1] - other![1])).toBeLessThan(0.05);
          }
        }
      }
    });
  }

  it('declines the shortcut when there is no solved cycle to turn round', () => {
    const harness = createMechanismHarness();
    expect(harness.service.mechanisms[0]?.reversedCycle()).toBeUndefined();
  });
});
