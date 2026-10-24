// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, PrisJoint } from '../../app/model/joint';
import { readFileSync } from 'node:fs';
import { buildMechanism, buildMechanismAtScale } from '../../test-utils/verification/fixture';
import { motionGenGripperFixture } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { SettingsService } from '../../app/services/settings.service';
import { RealJoint } from '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

// MotionGen's library gripper is geometrically redundant: two parallel
// guides fix each jaw's heading, and the four plate-to-jaw rods repeat a
// constraint. The mobility test recognizes its one continuous freedom. The
// position solve must also write the heading implied by each guide pair,
// rather than relying on URL rounding to perturb the permanent tangency.
// The captured paths independently verify the resulting motion.
// Capture provenance: PMKS_Verification/reference-data/motiongen-library/README.md.

interface Pose {
  [joint: string]: { x: number; y: number };
}

/** MotionGen's solved paths: one row per sampled frame of the stroke. */
function motionGenPoses(): Pose[] {
  const lines = readFileSync('src/test-data/motiongen/gripper-curves.csv', 'utf8')
    .trim()
    .split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map(Number);
    const pose: Pose = {};
    header.forEach((name, i) => {
      const [joint, axis] = name.split('_');
      if (!axis) return;
      pose[joint] ??= { x: 0, y: 0 };
      (pose[joint] as never as Record<string, number>)[axis] = cells[i];
    });
    return pose;
  });
}

// MotionGen's ids are J1.. in capture order; PMKS+ assigns letters. Same joints.
const AS_PMKS: Record<string, string> = {
  J1: 'A',
  J2: 'B',
  J3: 'C',
  J4: 'D',
  J5: 'E',
  J6: 'F',
  J7: 'G',
  J8: 'H',
  J9: 'I',
  J10: 'J',
  J11: 'K',
};

describe('the MotionGen gripper, rebuilt in PMKS+', () => {
  // objectScale is a process-wide static and a driven slider's step is measured
  // against it, so pin it: otherwise the travel depends on spec file order.
  const { mechanism, joints: built } = buildMechanismAtScale(
    motionGenGripperFixture(MODEL_SCALE),
    1 * MODEL_SCALE
  );
  const frames = mechanism.joints.length;

  const reference = motionGenPoses();

  it('counts one freedom and runs from its verbatim coordinates', () => {
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames).toBeGreaterThan(3);
    // Every jaw remains rigid, including the direction that a first-order
    // distance row cannot constrain at the permanent tangency.
    for (const pair of [
      ['F', 'G'],
      ['H', 'I'],
    ]) {
      const offset = (frame: Joint[]) => {
        const a = frame.find((joint) => joint.id === pair[0])!;
        const b = frame.find((joint) => joint.id === pair[1])!;
        return [b.x - a.x, b.y - a.y];
      };
      const authored = offset(mechanism.joints[0]);
      for (const frame of mechanism.joints) {
        const current = offset(frame);
        expect(Math.hypot(current[0] - authored[0], current[1] - authored[1])).toBeLessThan(1e-5);
      }
    }
  });

  it('has a reference that shows the refusal costs something real', () => {
    // If MotionGen's own solution were static, the refusal would be correct and
    // there would be nothing to fix. It is not: the jaws close through the
    // stroke, monotonically, by more than two units.
    const gap = (pose: Pose) =>
      Math.hypot(pose['J10'].x - pose['J11'].x, pose['J10'].y - pose['J11'].y);
    const gaps = reference.map(gap);
    expect(gaps[0]).toBeGreaterThan(2.3);
    expect(gaps[gaps.length - 1]).toBeLessThan(0.05);
    // Not monotonic, and worth not asserting that it is: the jaws ease open by
    // fifteen thousandths over the first few frames before closing. That is
    // the toggle geometry of the linkage, not noise in the capture.
    expect(Math.max(...gaps)).toBeLessThan(gaps[0] + 0.02);
  });

  it('keeps the reference honest about what it is', () => {
    // The rails really are rails -- each pair of riders holds one x between
    // them across every pose -- and the plate really does only translate. Both
    // are the premises the hand count above rests on, so neither should be
    // taken on trust from a capture.
    for (const [top, bottom] of [
      ['J6', 'J8'],
      ['J7', 'J9'],
    ] as const) {
      for (const pose of reference) {
        expect(Math.abs(pose[top].x - pose[bottom].x)).toBeLessThan(2e-4);
      }
    }
    const angle = (pose: Pose) =>
      Math.atan2(pose['J2'].y - pose['J1'].y, pose['J2'].x - pose['J1'].x);
    const turned = reference.map(angle);
    expect(Math.max(...turned) - Math.min(...turned)).toBeLessThan(1e-3);
  });

  it('places every joint where MotionGen does at the pose it was captured in', () => {
    // The rebuild is checked against the source:
    // a fixture that does not match the model it claims to be would make the
    // comparison above about the wrong mechanism. Frame 60 of the
    // reference is the pose the model is stored in.
    // The editable joints retain the authored pose while the mechanism holds its cycle.
    const drawn = reference.find((pose) => Math.abs(pose['J1'].x - -1.924786) < 1e-6)!;
    expect(drawn).toBeDefined();
    for (const [theirs, mine] of Object.entries(AS_PMKS)) {
      const joint = built.find((j: Joint) => j.id === mine)!;
      expect(
        Math.hypot(joint.x / MODEL_SCALE - drawn[theirs].x, joint.y / MODEL_SCALE - drawn[theirs].y)
      ).toBeLessThan(1e-4);
    }
    expect(built.length).toBeGreaterThan(10);
  });
});

describe('the MotionGen gripper as the gallery publishes it', () => {
  // The gallery saves the same exact geometry, including guide angles. The
  // simultaneous route must run it and agree with the independent capture.
  function fromTheGallery(): Mechanism {
    const row = readFileSync('docs/fixture-urls.md', 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| [MotionGen gripper]('))!;
    const query = row.match(/\]\(https:\/\/[^)?]+\?([^)]*)\)/)![1];
    const decoder = new StringTranscoder();
    decoder.decodeURL(query);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      true,
      false
    );
    const partition = partitionMechanisms(target.joints, target.links).mechanisms[0];
    const driven = partition.ownJoints.find((joint) => joint instanceof RealJoint && joint.input);
    return new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      false,
      'cm',
      (driven as RealJoint).driveSpeed || MODEL_SCALE,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
  }

  it("runs, and passes through MotionGen's own poses", () => {
    const mechanism = fromTheGallery();
    expect(mechanism.isMechanismValid()).toBe(true);
    const inputAt = mechanism.joints.map(
      (frame) => frame.find((joint) => joint.id === 'A')!.x / MODEL_SCALE
    );
    const reference = motionGenPoses();
    const ends = [Math.min(...inputAt), Math.max(...inputAt)];
    let worst = 0;
    let worstInside = 0;
    let compared = 0;
    for (const pose of reference) {
      // The two samples either side of MotionGen's input, and a straight line
      // between them: the solved samples are a tenth of a unit of stroke apart.
      const target = pose['J1'].x;
      const after = inputAt.findIndex(
        (x, i) => i > 0 && (x - target) * (inputAt[i - 1] - target) <= 0
      );
      if (after < 1) continue;
      const t = (target - inputAt[after - 1]) / (inputAt[after] - inputAt[after - 1] || 1);
      for (const [theirs, mine] of Object.entries(AS_PMKS)) {
        const a = mechanism.joints[after - 1].find((joint) => joint.id === mine)!;
        const b = mechanism.joints[after].find((joint) => joint.id === mine)!;
        const x = (a.x + (b.x - a.x) * t) / MODEL_SCALE;
        const y = (a.y + (b.y - a.y) * t) / MODEL_SCALE;
        const gap = Math.hypot(x - pose[theirs].x, y - pose[theirs].y);
        worst = Math.max(worst, gap);
        if (ends.every((end) => Math.abs(target - end) > 0.2))
          worstInside = Math.max(worstInside, gap);
      }
      compared++;
    }
    // All but the ends of MotionGen's stroke lie inside the one solved here.
    expect(compared).toBeGreaterThan(40);
    // The independently captured geometry is hand-placed and not perfectly
    // symmetric; compare within a hundredth against a 2.37-unit jaw stroke.
    expect(worstInside).toBeLessThan(0.01);
    // Except where the jaws close, at the end of the stroke: the linkage folds
    // there, the jaws move fast for the input, and the straight line between
    // two samples a tenth of a unit apart cuts the corner. Measured at 0.023.
    expect(worst).toBeLessThan(0.03);
  });
});
