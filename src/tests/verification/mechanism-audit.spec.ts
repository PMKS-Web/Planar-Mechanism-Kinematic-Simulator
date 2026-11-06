// Enter the model import cycle through joint.ts.
import '../../app/model/joint';
import { LengthUnit } from '../../app/model/unit-enums';
import { siUnitFactorsForLength } from '../../app/model/unit-conversions';
import { SettingsService } from '../../app/services/settings.service';
import { machineFacts } from '../../app/model/machine-facts/machine-facts';
import { TestBed } from '@angular/core/testing';
import { openAuditFinding } from './mechanism-audit-support';
import { AUDIT_FIXTURES } from '../../test-utils/verification/audit-fixtures';

// Numerical checks do not need the comparison drawer's live graph subscriptions.
const openFinding = openAuditFinding;

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
