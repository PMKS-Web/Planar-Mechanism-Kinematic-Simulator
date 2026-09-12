import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  teachingLabFourBarFixture,
  equalSidedFourBarFixture,
} from '../../../test-utils/verification/fixtures';
import { solveKinematics } from '../../../test-utils/verification/solve';
import { RealLink } from '../link';
import { RealJoint } from '../joint';
import { MODEL_SCALE } from '../render-scale';
import { explainInstantCenter } from './instant-center-explanation';

describe('worked IC velocity substitutions', () => {
  it('reconstructs angular and CoM rates across a four-bar cycle independently of display scale', () => {
    const built = buildMechanism(teachingLabFourBarFixture());
    const current = solveKinematics(built);
    let checkedRatios = 0;
    for (const index of [0, 37, 90]) {
      for (const link of built.mechanism.links[index]) {
        if (!(link instanceof RealLink)) continue;
        const worked = explainInstantCenter(built.mechanism, index, link.id)!;
        expect(worked.result.status).toBe('ok');
        expect(worked.omega).toBeCloseTo(current.linkAngVel[index][link.id], 6);
        const r = worked.radius!;
        expect(-worked.omega! * r.y).toBeCloseTo(
          current.linkCoMVel[index][link.id][0] / MODEL_SCALE,
          6
        );
        expect(worked.omega! * r.x).toBeCloseTo(
          current.linkCoMVel[index][link.id][1] / MODEL_SCALE,
          6
        );
        if (worked.ratio) {
          checkedRatios++;
          expect(worked.ratio.omega).toBeCloseTo(worked.omega!, 6);
        }
      }
    }
    expect(checkedRatios).toBeGreaterThan(3);
  });
  it('describes translation without fabricating a finite radius', () => {
    const { mechanism } = buildMechanism(equalSidedFourBarFixture());
    const worked = mechanism.links[0]
      .map((link) => explainInstantCenter(mechanism, 0, link.id))
      .find((value) => value?.center?.location === 'infinite')!;
    expect(worked).toBeDefined();
    expect(worked.origin).toBeUndefined();
    expect(worked.radius).toBeUndefined();
    expect(worked.omega).toBeCloseTo(0, 12);
    expect(worked.velocity!.every(Number.isFinite)).toBe(true);
  });
  it('does not offer worked values for a missing input', () => {
    const { mechanism } = buildMechanism(teachingLabFourBarFixture());
    mechanism.joints[0].forEach((joint) => {
      if (joint instanceof RealJoint) joint.input = false;
    });
    const worked = explainInstantCenter(mechanism, 0, mechanism.links[0][0].id)!;
    expect(worked.result.status).toBe('unavailable');
    expect(worked.omega).toBeUndefined();
    expect(worked.velocity).toBeUndefined();
    expect(worked.ratio).toBeUndefined();
  });
});
