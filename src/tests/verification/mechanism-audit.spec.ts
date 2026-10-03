// Enter the model import cycle through joint.ts.
import '../../app/model/joint';
import { bodiesUnder } from '../../app/model/link';
import { LengthUnit } from '../../app/model/unit-enums';
import { siUnitFactorsForLength } from '../../app/model/unit-conversions';
import { SettingsService } from '../../app/services/settings.service';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { machineFacts } from '../../app/model/machine-facts/machine-facts';
import { TestBed } from '@angular/core/testing';
import { openAuditFinding } from './mechanism-audit-support';
import { AUDIT_FIXTURES } from '../../test-utils/verification/audit-fixtures';

// Numerical checks do not need the comparison drawer's live graph subscriptions.
const openFinding = openAuditFinding;

function expectVector(actual: number[], expected: number[], tolerance = 0.0001) {
  expected.forEach((value, axis) => expect(Math.abs(actual[axis] - value)).toBeLessThan(tolerance));
}

/** Independent polynomial derivative on the actual nonuniform sampling clock. */
function difference(times: number[], values: number[], index: number, radius: number): number {
  const picks = Array.from({ length: radius * 2 + 1 }, (_, k) => index - radius + k);
  const xs = picks.map((i) => times[i] - times[index]);
  return picks.reduce((sum, i, j) => {
    const denominator = xs.reduce(
      (product, x, k) => (k === j ? product : product * (xs[j] - x)),
      1
    );
    const numerator = xs.reduce(
      (total, _, m) =>
        m === j
          ? total
          : total + xs.reduce((product, x, k) => (k === j || k === m ? product : product * -x), 1),
      0
    );
    return sum + ((values[i] - values[index]) * numerator) / denominator;
  }, 0);
}

describe('the mechanism audit regressions', () => {
  it('retains all 68 user-facing reproduction groups exactly once', () => {
    expect(AUDIT_FIXTURES.map((entry) => entry.id)).toEqual(
      Array.from({ length: 69 }, (_, index) => index + 1).filter((id) => id !== 50)
    );
  });

  it('finding #1: rejects the welded guided rod tangency instead of deforming it', () => {
    const { mechanism } = openFinding(1);
    expect(mechanism.dof).toBe(0);
    expect(mechanism.isMechanismValid()).toBe(false);
    expect(mechanism.joints.length).toBe(1);
  });

  for (const id of [32, 33, 34, 35, 36, 55, 56, 57, 62]) {
    it(`finding #${id}: starts valid motion with a smaller prescribed step`, () => {
      const opened = openFinding(id, id >= 32 && id <= 36);
      if (id >= 32 && id <= 36) {
        const settings = TestBed.inject(SettingsService);
        const from = settings.lengthUnit.value;
        settings.lengthUnit.next(LengthUnit.METER);
        const scale = siUnitFactorsForLength(from).distanceToM;
        SettingsService.preservedCylinderScale *= scale;
        SettingsService._objectScale.next(SettingsService.objectScale * scale);
        opened.service.updateLinkageUnits(from, LengthUnit.METER);
      }
      const mechanism = opened.service.mechanisms[0];
      expect(mechanism.isMechanismValid()).toBe(true);
      expect(mechanism.joints.length).toBeGreaterThan(20);
      expect(mechanism.timeNum.at(-1)).toBeGreaterThan(0);
    });
  }

  for (const id of [...Array.from({ length: 14 }, (_, i) => i + 8), 27, 30]) {
    it(`finding #${id}: every welded member angle uses degrees`, () => {
      const { mechanism, samples } = openFinding(id);
      expect(mechanism.isMechanismValid()).toBe(true);
      for (const index of [0, Math.floor(mechanism.joints.length / 3)]) {
        for (const body of bodiesUnder(mechanism.links[index])) {
          if (body.joints.length < 2) continue;
          const [a, b] = body.joints;
          const expected = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          const actual = samples.sampleAt(
            mechanism,
            index,
            'kinematic',
            '',
            'Angular Link Pos',
            body.id
          )[0];
          const gap = Math.atan2(
            Math.sin(((actual - expected) * Math.PI) / 180),
            Math.cos(((actual - expected) * Math.PI) / 180)
          );
          expect(Math.abs(gap), body.id).toBeLessThan(1e-7);
        }
      }
    });
  }

  for (const id of [3, 4, 22, 29]) {
    it(
      `finding #${id}: every fixed ground pin keeps exactly zero rates`,
      () => {
        const { mechanism, samples } = openFinding(id);
        for (let index = 0; index < mechanism.joints.length; index++) {
          for (const joint of mechanism.joints[index]) {
            if (!(joint instanceof RealJoint) || joint instanceof PrisJoint || !joint.ground)
              continue;
            for (const property of ['Linear Joint Vel', 'Linear Joint Acc']) {
              expect(
                samples.sampleAt(mechanism, index, 'kinematic', '', property, joint.id).slice(0, 2),
                `${joint.id} at ${index}`
              ).toEqual([0, 0]);
            }
          }
        }
        // All frames of eleven parallel cranks are deliberately retained; allow
        // the shared CI runner time for those large differentiated systems.
      },
      id === 29 ? 120_000 : 60_000
    );
  }

  for (const test of [
    { id: 2, target: 'G', time: 9 },
    { id: 3, target: 'E', time: 3 },
    { id: 29, target: 'V', time: 4.5 },
  ]) {
    it(`finding #${test.id}: follows the finite branch derivative through a parallelogram change point`, () => {
      const { mechanism, samples } = openFinding(test.id);
      const index = mechanism.timeNum.reduce(
        (best, t, i) =>
          Math.abs(t - test.time) < Math.abs(mechanism.timeNum[best] - test.time) ? i : best,
        0
      );
      const frame = mechanism.joints[index];
      const a = frame.find((joint) => joint.id === 'A')!,
        b = frame.find((joint) => joint.id === 'B')!;
      const w = mechanism.inputAngularVelocities[index];
      const velocity = [(-w * (b.y - a.y)) / 200, (w * (b.x - a.x)) / 200];
      const acceleration = [(-w * w * (b.x - a.x)) / 200, (-w * w * (b.y - a.y)) / 200];
      expectVector(
        samples.sampleAt(mechanism, index, 'kinematic', '', 'Linear Joint Vel', test.target),
        velocity,
        0.0005
      );
      expectVector(
        samples.sampleAt(mechanism, index, 'kinematic', '', 'Linear Joint Acc', test.target),
        acceleration,
        0.0005
      );
    });
  }

  it('finding #25: cylinder rod endpoint velocities preserve its rigid length at the reversal', () => {
    const { mechanism, samples } = openFinding(25);
    const index = 289;
    const c = mechanism.joints[index].find((j) => j.id === 'C')!,
      d = mechanism.joints[index].find((j) => j.id === 'D')!;
    const vc = samples.sampleAt(mechanism, index, 'kinematic', '', 'Linear Joint Vel', 'C');
    const vd = samples.sampleAt(mechanism, index, 'kinematic', '', 'Linear Joint Vel', 'D');
    const length = Math.hypot(d.x - c.x, d.y - c.y);
    expect(
      Math.abs(((vd[0] - vc[0]) * (d.x - c.x) + (vd[1] - vc[1]) * (d.y - c.y)) / length)
    ).toBeLessThan(1e-6);
    expect(Math.hypot(...vc.slice(0, 2))).toBeGreaterThan(0.1);
  });

  it('finding #24: another machine cannot change a fresh dynamic force answer', () => {
    const first = openFinding(24);
    const expected =
      first.service.mechanisms[0].getForceAnalysis('dynamic').frames[0].inputEffort!.valueSI;
    const reopened = openFinding(24);
    const other = reopened.service.mechanisms[1];
    reopened.samples.sampleAt(other, 0, 'kinematic', '', 'Linear Joint Acc', other.joints[0][0].id);
    const actual =
      reopened.service.mechanisms[0].getForceAnalysis('dynamic').frames[0].inputEffort!.valueSI;
    expect(actual).toBeCloseTo(expected, 8);
    expect(actual).toBeCloseTo(0, 8);
  });

  it('finding #49: reversing welded members reverses velocity and keeps acceleration', () => {
    const { mechanism, samples } = openFinding(49);
    const index = 133;
    const before = ['Angular Link Vel', "Linear Link's CoM Vel", "Linear Link's CoM Acc"].map(
      (property) => samples.sampleAt(mechanism, index, 'kinematic', '', property, 'AN')
    );
    const reversed = mechanism.withReversedDrive()!;
    expect(reversed).toBeDefined();
    const after = ['Angular Link Vel', "Linear Link's CoM Vel", "Linear Link's CoM Acc"].map(
      (property) => samples.sampleAt(reversed, index, 'kinematic', '', property, 'AN')
    );
    for (let property = 0; property < before.length; property++) {
      expectVector(
        after[property],
        before[property].map((value, axis) => (property === 2 || axis === 2 ? value : -value)),
        1e-8
      );
    }
  });

  for (const id of [66, 68]) {
    it(`finding #${id}: refuses a family unsupported by the connected bodies and actual input`, () => {
      const { service, mechanism } = openFinding(id);
      const facts = machineFacts(service.partitions[0], mechanism)!;
      expect(
        facts.family.some((match) =>
          id === 66 ? match.family === 'cylinder-driven lever' : match.family.includes('Jansen')
        )
      ).toBe(false);
    });
  }

  it('finding #5: rotating bar reaction includes physical centripetal acceleration', () => {
    const { mechanism } = openFinding(5);
    const frame = mechanism.getForceAnalysis('dynamic').frames[0];
    expect(frame.status).toBe('ok');
    expect(frame.jointReactions.get('A')![1]).toBeCloseTo(9.795683772887678, 8);
  });

  it('finding #26: angular inertia supplies the full physical input torque', () => {
    const { mechanism } = openFinding(26);
    const frame = mechanism.getForceAnalysis('dynamic').frames[0];
    expect(frame.status).toBe('ok');
    expect(frame.inputEffort!.valueSI).toBeCloseTo(0.2319352987027167, 8);
  });

  for (const id of [23, 44, 45, 46, 52, 53, 54]) {
    it(`finding #${id}: floating motor torque balances work at the moving load point`, () => {
      const { mechanism } = openFinding(id);
      let checked = 0;
      for (let index = 2; index < mechanism.joints.length - 2; index += 17) {
        const frame = mechanism.getForceAnalysis('static').frames[index];
        if (frame.status !== 'ok') continue;
        const branch = mechanism.inputAngularVelocities.slice(index - 2, index + 3).map(Math.sign);
        if (branch.some((sign) => sign !== branch[0])) continue;
        let work = 0;
        let lowerOrderWork = 0;
        for (const force of mechanism.forces[index]) {
          const xs = mechanism.forces.map(
            (frame) => frame.find((one) => one.id === force.id)!.startCoord.x
          );
          const ys = mechanism.forces.map(
            (frame) => frame.find((one) => one.id === force.id)!.startCoord.y
          );
          const power = (radius: number) =>
            (force.mag *
              (Math.cos(force.angleRad) * difference(mechanism.timeNum, xs, index, radius) +
                Math.sin(force.angleRad) * difference(mechanism.timeNum, ys, index, radius)) *
              0.01) /
            200;
          work += power(2);
          lowerOrderWork += power(1);
        }
        // A stencil near a limit can cover sharply changing curvature. Require
        // convergence of independent derivative estimates before using it as
        // a power oracle, rather than granting a broad torque tolerance.
        if (Math.abs(work - lowerOrderWork) > 0.003 + 0.003 * Math.abs(work)) continue;
        const motor = frame.inputEffort!.valueSI * mechanism.inputAngularVelocities[index];
        // Independent centered differences have O(step²) error; near a toggle
        // use a meaningful absolute power bound as well as a relative one.
        expect(Math.abs(motor + work), `frame ${index}`).toBeLessThan(
          0.003 + 0.008 * Math.abs(work)
        );
        checked++;
      }
      expect(checked).toBeGreaterThan(3);
    });
  }

  for (const test of [
    { id: 51, index: 127, joint: 'CE', acceleration: [-0.94622, -7.016234] },
    { id: 47, index: 127, joint: 'D', acceleration: [0, 5.483099] },
    { id: 48, index: 217, joint: 'W', acceleration: [5.483099, -0.087134] },
    { id: 63, index: 101, joint: 'Q', acceleration: [0, -0.537242] },
    { id: 65, index: 203, joint: 'E', acceleration: [0.0373121, -0.0454806] },
  ]) {
    it(`finding #${test.id}: matches independent acceleration at the reported pose`, () => {
      const { mechanism, samples } = openFinding(test.id);
      expect(mechanism.isMechanismValid()).toBe(true);
      expectVector(
        samples.sampleAt(
          mechanism,
          test.index,
          'kinematic',
          '',
          test.id === 51 ? "Linear Link's CoM Acc" : 'Linear Joint Acc',
          test.joint
        ),
        test.acceleration
      );
    });
  }

  for (const test of [
    { id: 67, index: 164, link: 'CD', alphaDegrees: -0.434928 },
    { id: 69, index: 64, link: 'BIJ', alphaDegrees: 0 },
  ]) {
    it(`finding #${test.id}: matches independent angular acceleration`, () => {
      const { mechanism, samples } = openFinding(test.id);
      const alpha = samples.sampleAt(
        mechanism,
        test.index,
        'kinematic',
        '',
        'Angular Link Acc',
        test.link
      )[0];
      expect(Math.abs((alpha * 180) / Math.PI - test.alphaDegrees)).toBeLessThan(0.00002);
    });
  }

  it('finding #64: the clockwise stationary-slider assembly completes its six-second cycle', () => {
    const { mechanism } = openFinding(64);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.timeNum.at(-1)).toBeCloseTo(6, 6);
    const start = mechanism.joints[0].find((joint) => joint.id === 'C')!;
    for (const frame of mechanism.joints) {
      const slider = frame.find((joint) => joint.id === 'C')!;
      expect(Math.hypot(slider.x - start.x, slider.y - start.y)).toBeLessThan(0.000001);
    }
  });
});
