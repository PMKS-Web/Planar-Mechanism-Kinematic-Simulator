import './mechanism-audit-support';
import { bodiesUnder, RealLink } from '../../app/model/link';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { LengthUnit } from '../../app/model/unit-enums';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { redundantParallelCrankFixture } from '../../test-utils/verification/fixtures';
import { coupledDriveWheelsFixture } from '../../test-utils/verification/feature-fixtures';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { TestBed } from '@angular/core/testing';
import { changeAuditUnit, openAuditFinding, openAuditPayload } from './mechanism-audit-support';

function saveAndReopen(opened: ReturnType<typeof openAuditPayload>) {
  const before = opened.service.mechanisms[0];
  expect(before.isMechanismValid()).toBe(true);
  const period = before.cyclePeriod;
  const points = opened.service.joints.map((joint) => ({
    id: joint.id,
    x: joint.x,
    y: joint.y,
    guide: joint instanceof PrisJoint ? joint.angle_rad : undefined,
    speed: joint instanceof RealJoint ? joint.driveSpeed : undefined,
  }));
  const properties = bodiesUnder(opened.service.links).map((body) => ({
    id: body.id,
    mass: body.mass,
    inertia: body.massMoI,
    com: [body.CoM.x, body.CoM.y],
  }));
  const payload = TestBed.inject(UrlGenerationService).generateUrlQuery();
  const reopened = openAuditPayload(payload);
  const after = reopened.mechanism;
  expect(after.dof).toBe(before.dof);
  expect(after.isMechanismValid()).toBe(true);
  expect(Math.abs(after.cyclePeriod - period)).toBeLessThan(Math.max(1e-8, period * 1e-8));
  for (const point of points) {
    const actual = reopened.service.joints.find((joint) => joint.id === point.id)!;
    expect(actual.x).toBeCloseTo(point.x, 9);
    expect(actual.y).toBeCloseTo(point.y, 9);
    if (actual instanceof RealJoint) expect(actual.driveSpeed).toBe(point.speed);
    if (actual instanceof PrisJoint) expect(actual.angle_rad).toBe(point.guide);
  }
  for (const prop of properties) {
    const body = bodiesUnder(reopened.service.links).find((one) => one.id === prop.id)!;
    expect(body.mass).toBe(prop.mass);
    expect(body.massMoI).toBe(prop.inertia);
    expect(body.CoM.x).toBeCloseTo(prop.com[0], 9);
    expect(body.CoM.y).toBeCloseTo(prop.com[1], 9);
  }
  return reopened;
}

function rotateDrawing(opened: ReturnType<typeof openAuditPayload>, angle: number) {
  const rotate = (point: { x: number; y: number }) => {
    const x = point.x,
      y = point.y;
    point.x = x * Math.cos(angle) - y * Math.sin(angle);
    point.y = x * Math.sin(angle) + y * Math.cos(angle);
  };
  opened.service.joints.forEach((joint) => {
    rotate(joint);
    if (joint instanceof PrisJoint && !joint.isFloating) joint.angle_rad += angle;
  });
  bodiesUnder(opened.service.links).forEach((body) => rotate(body.CoM));
  opened.service.updateMechanism(false);
}

describe('fresh production saves from the mechanism audit', () => {
  for (const [id, make] of [
    [6, redundantParallelCrankFixture],
    [7, coupledDriveWheelsFixture],
  ] as const) {
    it(`finding #${id}: exact rotated redundancy survives a fresh save`, () => {
      const opened = openAuditPayload(fixturePayload(make()));
      rotateDrawing(opened, (25.714 * Math.PI) / 180);
      expect(opened.service.mechanisms[0].dof).toBe(1);
      saveAndReopen(opened);
    });
  }

  it('finding #28: cardinal guide angle and mobility survive a fresh save', () => {
    const opened = openAuditFinding(28, true);
    rotateDrawing(opened, Math.PI / 2);
    const reopened = saveAndReopen(opened);
    expect((reopened.service.joints.find((joint) => joint.id === 'W') as PrisJoint).angle_rad).toBe(
      Math.PI / 2
    );
  });

  for (const id of [31, 37]) {
    it(`finding #${id}: converted working geometry remains runnable after saving`, () => {
      const opened = openAuditFinding(id, true);
      changeAuditUnit(opened, id === 37 ? LengthUnit.INCH : LengthUnit.METER);
      saveAndReopen(opened);
    });
  }

  it('finding #38: 1.5 grams remains 0.0015 kg after a meter save', () => {
    const opened = openAuditFinding(38, true);
    opened.service.links[0].mass = 1.5;
    changeAuditUnit(opened, LengthUnit.METER);
    const reopened = saveAndReopen(opened);
    expect(reopened.service.links[0].mass).toBe(0.0015);
    const reaction = reopened.mechanism
      .getForceAnalysis('static')
      .frames[0].jointReactions.get('A')!;
    expect(Math.abs(reaction[1])).toBeCloseTo(0.014709975, 10);
  });

  it('finding #39: custom inertia survives the physical unit conversion and save', () => {
    const opened = openAuditFinding(39, true);
    const rocker = opened.service.links.find((link) => link.id === 'CD') as RealLink;
    rocker.massMoI = 1; // kg cm², the codec's metric storage unit.
    rocker.moiIsCustom = true;
    changeAuditUnit(opened, LengthUnit.METER);
    const before =
      opened.service.mechanisms[0].getForceAnalysis('dynamic').frames[0].inputEffort!.valueSI;
    const reopened = saveAndReopen(opened);
    expect((reopened.service.links.find((link) => link.id === 'CD') as RealLink).massMoI).toBe(
      0.0001
    );
    expect(
      reopened.mechanism.getForceAnalysis('dynamic').frames[0].inputEffort!.valueSI
    ).toBeCloseTo(before, 12);
    expect(Math.abs(before)).toBeGreaterThan(1e-7);
  });

  for (const id of [40, 41, 42, 43]) {
    for (const sign of [-1, 1]) {
      it(`finding #${id}: tiny speed (${sign}) and its elapsed period survive a fresh reload`, () => {
        const opened = openAuditFinding(id, true);
        const input = opened.service.joints.find(
          (joint) => joint instanceof RealJoint && joint.input
        ) as RealJoint;
        opened.service.setDriveSpeed(input, sign * (id === 43 ? 0.0001 : 0.01));
        opened.service.updateMechanism(false);
        if (id !== 43) changeAuditUnit(opened, LengthUnit.METER);
        const reopened = saveAndReopen(opened);
        const actual = reopened.service.joints.find((joint) => joint.id === input.id) as RealJoint;
        expect(reopened.service.driveSpeedOf(actual)).toBe(sign * 0.0001);
        expect(reopened.settings[id === 43 ? 'inputSpeed' : 'linearInputSpeed'].value).toBe(0.0001);
        expect(Math.abs(reopened.mechanism.inputAngularVelocities[0])).toBeGreaterThan(0);
        if (id === 43) expect(reopened.mechanism.cyclePeriod).toBeCloseTo(600000, 6);
      });
    }
  }
});
