// Enter the model import cycle through joint.ts.
import '../../app/model/joint';
import { LengthUnit } from '../../app/model/unit-enums';
import { siUnitFactorsForLength } from '../../app/model/unit-conversions';
import { SettingsService } from '../../app/services/settings.service';
import { TestBed } from '@angular/core/testing';
import { openAuditFinding } from './mechanism-audit-support';
import { AUDIT_FIXTURES } from '../../test-utils/verification/audit-fixtures';

// Numerical checks do not need the comparison drawer's live graph subscriptions.
const openFinding = openAuditFinding;

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
