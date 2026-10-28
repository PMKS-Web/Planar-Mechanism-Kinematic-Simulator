import './mechanism-audit-support';
import { PrisJoint } from '../../app/model/joint';
import { bodiesUnder } from '../../app/model/link';
import { LengthUnit } from '../../app/model/unit-enums';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { changeAuditUnit, openAuditFinding } from './mechanism-audit-support';

/** Validate the physical drawing throughout the accepted trajectory. */
function expectRigidTrajectory(mechanism: Mechanism) {
  expect(mechanism.isMechanismValid()).toBe(true);
  const start = mechanism.joints[0];
  for (const body of bodiesUnder(mechanism.links[0])) {
    for (let a = 0; a < body.joints.length; a++) {
      for (const b of body.joints.slice(a + 1)) {
        const first = body.joints[a];
        const length = Math.hypot(first.x - b.x, first.y - b.y);
        for (const frame of mechanism.joints) {
          const p = frame.find((joint) => joint.id === first.id)!;
          const q = frame.find((joint) => joint.id === b.id)!;
          expect(Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - length)).toBeLessThan(
            Math.max(1e-5, length * 1e-7)
          );
        }
      }
    }
  }
  for (const guide of start.filter(
    (joint): joint is PrisJoint => joint instanceof PrisJoint && joint.ground && !joint.isFloating
  )) {
    for (const frame of mechanism.joints) {
      const point = frame.find((joint) => joint.id === guide.id)!;
      const normal =
        -(point.x - guide.x) * Math.sin(guide.angle_rad) +
        (point.y - guide.y) * Math.cos(guide.angle_rad);
      expect(Math.abs(normal)).toBeLessThan(1e-5);
    }
  }
}

const largestInterval = (mechanism: Mechanism) =>
  Math.max(...mechanism.timeNum.slice(1).map((time, i) => time - mechanism.timeNum[i]));

describe('scale-invariant startup and rigid accepted poses', () => {
  for (const id of [32, 33, 34, 35, 36]) {
    it(`finding #${id}: unit conversion preserves physical travel and period within sampling resolution`, () => {
      const opened = openAuditFinding(id, true);
      const native = opened.mechanism;
      expectRigidTrajectory(native);
      changeAuditUnit(opened, LengthUnit.METER);
      const converted = opened.service.mechanisms[0];
      expectRigidTrajectory(converted);
      // Both travel stops are approached and retraced: each uncertain end
      // costs at most two intervals in the out-and-back period.
      expect(Math.abs(converted.cyclePeriod - native.cyclePeriod)).toBeLessThan(
        4 * (largestInterval(native) + largestInterval(converted))
      );
    });
  }
  for (const [id, period] of [
    [55, undefined],
    [56, 4.42582],
    [57, 8],
    [62, 15.5939],
  ] as const) {
    it(`finding #${id}: narrow motion preserves every rigid member and completes its physical stroke`, () => {
      const { mechanism } = openAuditFinding(id);
      expectRigidTrajectory(mechanism);
      if (period !== undefined)
        expect(Math.abs(mechanism.cyclePeriod - period)).toBeLessThan(
          2 * largestInterval(mechanism)
        );
    });
  }
  for (const scale of [0.01, 100]) {
    it(`finding #1: rejects the immobile tangency at drawing scale ${scale}`, () => {
      const opened = openAuditFinding(1);
      opened.service.joints.forEach((joint) => {
        joint.x *= scale;
        joint.y *= scale;
      });
      bodiesUnder(opened.service.links).forEach((body) => {
        body.CoM.x *= scale;
        body.CoM.y *= scale;
      });
      opened.service.updateMechanism(false);
      expect(opened.service.mechanisms[0].dof).toBe(0);
      expect(opened.service.mechanisms[0].isMechanismValid()).toBe(false);
    });
  }
});
