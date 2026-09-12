import { buildMechanism, buildMechanismAtScale } from '../../../test-utils/verification/fixture';
import { RealJoint } from '../joint';
import { RealLink, SliderBlock } from '../link';
import { MODEL_SCALE } from '../render-scale';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  stephensonIiiEx2Fixture,
  sliderCrankTracerFixture,
  equalSidedFourBarFixture,
} from '../../../test-utils/verification/fixtures';
import {
  scotchYokeFixture,
  invertedSliderCrankFixture,
  ellipticalTrammelFixture,
  cylinderBoomFixture,
} from '../../../test-utils/verification/slot-fixtures';
import { solveKinematics } from '../../../test-utils/verification/solve';
import { centerId, determineInstantCenters, finiteCenter } from './instant-center-solver';
import { instantCenterRatesAt, solveInstantCenterVelocities } from './instant-center-kinematics';

describe('Instant center analysis', () => {
  for (const [name, fixture] of [
    ['four-bar with tracers', teachingLabFourBarFixture],
    ['slider-crank', teachingLabSliderCrankFixture],
    ['slider-crank with tracer', sliderCrankTracerFixture],
    ['six-bar', stephensonIiiEx2Fixture],
    ['welded slider', scotchYokeFixture],
    ['floating slot', invertedSliderCrankFixture],
    ['driven ground slider', () => ellipticalTrammelFixture(true, MODEL_SCALE)],
    ['driven cylinder', () => cylinderBoomFixture(MODEL_SCALE)],
  ] as const) {
    it(`independently agrees with closed-loop velocities: ${name}`, () => {
      const built = buildMechanismAtScale(fixture(), MODEL_SCALE);
      const current = solveKinematics(built);
      const mechanism = built.mechanism;
      expect(mechanism.joints.length).toBeGreaterThan(5);
      let solved = 0;
      const stride = Math.max(1, Math.floor(mechanism.joints.length / 12));
      for (let step = 0; step < mechanism.joints.length; step += stride) {
        const result = solveInstantCenterVelocities(
          mechanism.joints[step],
          mechanism.links[step],
          mechanism.inputAngularVelocities[step]
        );
        if (result.status !== 'ok') continue;
        solved++;
        for (const [id, rate] of result.linkAngVel) {
          // The current solver uses a block's angular slot as a zero placeholder.
          // A floating block actually turns with its carrier; check that below.
          if (!(mechanism.links[step].find((link) => link.id === id) instanceof RealLink)) continue;
          const expected = current.linkAngVel[step][id];
          if (expected !== undefined && Number.isFinite(expected))
            expect(rate).toBeCloseTo(expected, 5);
        }
        for (const [id, v] of result.jointVel) {
          const expected = current.jointVel[step][id];
          if (!expected || !expected.every(Number.isFinite)) continue;
          expect(v[0]).toBeCloseTo(expected[0], 5);
          expect(v[1]).toBeCloseTo(expected[1], 5);
        }
      }
      expect(solved).toBeGreaterThan(3);
    });
  }

  it('constructs all six four-bar centers, including primary centers at exact pins', () => {
    const { joints, links } = buildMechanism(teachingLabFourBarFixture());
    const geometry = determineInstantCenters(joints, links);
    expect(geometry.centers.length).toBe(6);
    expect(geometry.centers.filter((c) => c.location === 'unresolved')).toEqual([]);
    const input = geometry.centers.find((c) => c.id === centerId('ground', 'ABH'))!;
    expect(input.kind).toBe('fixed');
    expect(finiteCenter(geometry, input)).toEqual({ x: 0, y: 0 });
    expect(geometry.centers.filter((c) => c.construction).length).toBe(2);
  });

  it('keeps a translating coupler center at infinity and still solves its velocity', () => {
    const built = buildMechanism(equalSidedFourBarFixture());
    const geometry = determineInstantCenters(built.joints, built.links);
    expect(geometry.centers.some((c) => c.kind === 'secondary' && c.location === 'infinite')).toBe(
      true
    );
    const rates = solveInstantCenterVelocities(built.joints, built.links, 1);
    expect(rates.status).toBe('ok');
    expect([...rates.linkAngVel.values()].some((v) => Math.abs(v) < 1e-9)).toBe(true);
  });

  it('preserves signed input rate, zero speed, and scale/translation invariance', () => {
    const { joints, links } = buildMechanism(teachingLabFourBarFixture());
    const forward = solveInstantCenterVelocities(joints, links, 2);
    const reverse = solveInstantCenterVelocities(joints, links, -2);
    const stopped = solveInstantCenterVelocities(joints, links, 0);
    expect(forward.status).toBe('ok');
    expect(stopped.status).toBe('ok');
    for (const [id, omega] of forward.linkAngVel) {
      expect(reverse.linkAngVel.get(id)).toBeCloseTo(-omega, 9);
      expect(stopped.linkAngVel.get(id)).toBe(0);
    }
    joints.forEach((j) => {
      j.x = j.x * 100 + 10000;
      j.y = j.y * 100 - 9000;
    });
    const scaled = solveInstantCenterVelocities(joints, links, 2);
    expect(scaled.status).toBe('ok');
    for (const [id, omega] of forward.linkAngVel)
      expect(scaled.linkAngVel.get(id)).toBeCloseTo(omega, 8);
    for (const [id, v] of forward.jointVel) {
      expect(scaled.jointVel.get(id)![0]).toBeCloseTo(100 * v[0], 6);
      expect(scaled.jointVel.get(id)![1]).toBeCloseTo(100 * v[1], 6);
    }
  });

  it('refuses undefined inputs without returning old results', () => {
    const built = buildMechanism(teachingLabFourBarFixture());
    expect(solveInstantCenterVelocities(built.joints, built.links, 1).status).toBe('ok');
    built.joints.forEach((j) => {
      if (j instanceof RealJoint) j.input = false;
    });
    const result = solveInstantCenterVelocities(built.joints, built.links, 1);
    expect(result.status).toBe('unavailable');
    expect(result.jointVel.size).toBe(0);
    expect(result.reason).toContain('input');
  });

  it('leaves coincident Kennedy lines unresolved at a collinear toggle', () => {
    const { joints, links } = buildMechanism(equalSidedFourBarFixture());
    joints.forEach((joint, index) => {
      joint.x = index;
      joint.y = 0;
    });
    const result = solveInstantCenterVelocities(joints, links, 1);
    expect(result.status).toBe('unavailable');
    expect(result.geometry.centers.some((c) => c.location === 'unresolved')).toBe(true);
    expect(result.jointVel.size).toBe(0);
  });

  it('uses unambiguous pair ids beyond single digits or overlapping link names', () => {
    expect(centerId('1', '23')).not.toBe(centerId('12', '3'));
    expect(centerId('AB', 'ABC')).toBe(centerId('ABC', 'AB'));
  });

  it('keeps samples separate across machines and refreshes them when the input changes', () => {
    const first = buildMechanism(teachingLabFourBarFixture()).mechanism;
    const second = buildMechanism(teachingLabSliderCrankFixture()).mechanism;
    const initial = instantCenterRatesAt(first, 0)!;
    expect(instantCenterRatesAt(first, 0)).toBe(initial);
    expect(instantCenterRatesAt(second, 0)).not.toBe(initial);
    first.inputAngularVelocities[0] *= -2;
    const reversed = instantCenterRatesAt(first, 0)!;
    expect(reversed).not.toBe(initial);
    for (const [id, rate] of initial.linkAngVel)
      expect(reversed.linkAngVel.get(id)).toBeCloseTo(-2 * rate, 8);
    expect(instantCenterRatesAt(first, -1)).toBeUndefined();
  });

  it('turns a floating cylinder block with its carrier, and agrees with the boom triangle', () => {
    const { joints, links } = buildMechanismAtScale(cylinderBoomFixture(MODEL_SCALE), MODEL_SCALE);
    const result = solveInstantCenterVelocities(joints, links, MODEL_SCALE);
    expect(result.status).toBe('ok');
    expect(result.linkAngVel.get('OC')).toBeCloseTo(5 / 12, 8);
    const block = links.find((link) => link instanceof SliderBlock)!;
    expect(result.linkAngVel.get(block.id)).toBeCloseTo(result.linkAngVel.get('GN')!, 8);
    expect(result.linkAngVel.get('GN')).toBeCloseTo(4 / 15, 8);
  });
});
