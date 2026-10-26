import { Injector, runInInjectionContext } from '@angular/core';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { RealJoint } from '../model/joint';
import { AngularVelocityUnit } from '../model/unit-enums';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { DriveControlService } from './drive-control.service';
import { NotificationService } from './notification.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';

/** A four-bar with its driven joint, and the service both panels edit it through. */
function fourBar() {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES['4-Bar']);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  const injector = Injector.create({
    providers: [{ provide: DriveControlService, deps: [] }],
    parent: harness.injector,
  });
  const drive = runInInjectionContext(injector, () => injector.get(DriveControlService));
  const driven = harness.service.joints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
  )!;
  return { ...harness, drive, driven, notify: harness.injector.get(NotificationService) };
}

describe('DriveControlService', () => {
  it('takes a typed speed in the picker unit and keeps the direction', () => {
    const { drive, driven, service, settings, saveCount } = fourBar();
    const clockwise = drive.clockwise(driven);
    settings.inputSpeedUnit.next(AngularVelocityUnit.RPM);
    const before = saveCount();
    expect(drive.setSpeed(driven, 30)).toBe(true);
    expect(Math.abs(service.driveSpeedOf(driven))).toBeCloseTo(30);
    expect(drive.clockwise(driven)).toBe(clockwise);
    expect(drive.speedText(driven)).toBe('30');
    expect(saveCount()).toBe(before + 1);
  });

  it('reads a minus sign as the other way, not a negative magnitude', () => {
    const { drive, driven } = fourBar();
    const clockwise = drive.clockwise(driven);
    drive.setSpeed(driven, -12);
    expect(drive.clockwise(driven)).toBe(!clockwise);
    expect(drive.speedText(driven)).toBe('12');
  });

  it('refuses zero and text, and changes nothing or the history', () => {
    const { drive, driven, service, saveCount } = fourBar();
    const speed = service.driveSpeedOf(driven);
    const before = saveCount();
    expect(drive.setSpeed(driven, 0)).toBe(false);
    expect(drive.setSpeed(driven, Number.NaN)).toBe(false);
    expect(service.driveSpeedOf(driven)).toBe(speed);
    expect(saveCount()).toBe(before);
  });

  it('flips the direction as one undo entry and says so in its label', () => {
    const { drive, driven, saveCount } = fourBar();
    const label = drive.directionLabel(driven);
    const before = saveCount();
    drive.flip(driven);
    expect(drive.directionLabel(driven)).not.toBe(label);
    expect(saveCount()).toBe(before + 1);
  });
});
