// joint.ts first: see the import-cycle regression in module-import-order.spec.ts.
import '../../app/model/joint';
import { ForceSolver } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  wattIFixture,
} from '../../test-utils/verification/fixtures';
import { solveDynamics, solveKinematics } from '../../test-utils/verification/solve';

const rounded = (value: number) => Number(value.toFixed(4));

describe('production analysis entry points', () => {
  it('runs Watt I dynamics with transported custom mass properties and load', () => {
    const fixture = wattIFixture(true);
    const outputLink = fixture.links.find((link) => link.joints === 'CFG')!;
    outputLink.mass = 7.25;
    outputLink.moi = 0.375;
    outputLink.com = [5.75, 1.25];

    const expected = solveDynamics(buildMechanism(fixture));
    const { mechanism } = buildMechanism(fixture);
    KinematicsSolver.desiredAngleMap.set('header-sentinel', 123);
    ForceSolver.unknownVariableForcesMap.set('header-sentinel', [1, 2]);
    const header = mechanism.forceTitleRow('dynamics')!;
    expect(KinematicsSolver.desiredAngleMap.get('header-sentinel')).toBe(123);
    expect(ForceSolver.unknownVariableForcesMap.get('header-sentinel')).toEqual([1, 2]);

    const rows = mechanism.forceAnalysis('dynamics');
    expect(rows.length).toBe(mechanism.timeNum.length);
    const torqueColumn = header.indexOf('Torque N*m');
    expect(torqueColumn).toBeGreaterThan(0);
    for (let t = 0; t < rows.length; t++) {
      expect(Number(rows[t][0])).toBe(mechanism.timeNum[t]);
      expect(Number(rows[t][torqueColumn])).toBe(rounded(expected.torque[t]));
      for (let jointIndex = 0; jointIndex < mechanism.joints[t].length; jointIndex++) {
        const jointId = mechanism.joints[t][jointIndex].id;
        expect(Number(rows[t][1 + 2 * jointIndex])).toBe(
          rounded(expected.jointForce[t][jointId][0])
        );
        expect(Number(rows[t][2 + 2 * jointIndex])).toBe(
          rounded(expected.jointForce[t][jointId][1])
        );
      }
    }
    const loadedLinks = mechanism.links.map((links) => links.find((link) => link.id === 'CFG')!);
    expect(loadedLinks.every((link) => link.mass === 7.25)).toBe(true);
    expect(loadedLinks.every((link) => 'massMoI' in link && link.massMoI === 0.375)).toBe(true);
    expect(
      mechanism.forces.some((forces, t) => t > 0 && forces[0].startCoord.x !== fixture.load!.at[0])
    ).toBe(true);
  });

  it('runs slider-crank kinematics with preserved prismatic state', () => {
    const fixture = teachingLabSliderCrankFixture();
    const expected = solveKinematics(buildMechanism(fixture));
    const { mechanism } = buildMechanism(fixture);
    const header = mechanism.kinematicLoopTitleRow();
    const rows = mechanism.kinematicLoopAnalysis();
    expect(rows.length).toBe(expected.steps);
    expect(header.length).toBe(rows[0].length);
    for (let t = 0; t < rows.length; t++) {
      expect(Number(rows[t][0])).toBe(mechanism.timeNum[t]);
      for (let jointIndex = 0; jointIndex < mechanism.joints[t].length; jointIndex++) {
        const jointId = mechanism.joints[t][jointIndex].id;
        const offset = 1 + 6 * jointIndex;
        expect(Number(rows[t][offset])).toBe(rounded(expected.jointPos[t][jointId][0]));
        expect(Number(rows[t][offset + 1])).toBe(rounded(expected.jointPos[t][jointId][1]));
        expect(Number(rows[t][offset + 2])).toBeCloseTo(
          rounded(expected.jointVel[t][jointId][0]),
          4
        );
        expect(Number(rows[t][offset + 3])).toBeCloseTo(
          rounded(expected.jointVel[t][jointId][1]),
          4
        );
      }
    }
  });

  it('does not leak static solver state between mechanisms', () => {
    const sliderBefore = buildMechanism(
      teachingLabSliderCrankFixture()
    ).mechanism.kinematicLoopAnalysis();
    const wattBefore = buildMechanism(wattIFixture(true)).mechanism.forceAnalysis('dynamics');
    buildMechanism(teachingLabSliderCrankFixture(true)).mechanism.forceAnalysis('dynamics');
    const wattAfter = buildMechanism(wattIFixture(true)).mechanism.forceAnalysis('dynamics');
    buildMechanism(wattIFixture()).mechanism.kinematicLoopAnalysis();
    const sliderAfter = buildMechanism(
      teachingLabSliderCrankFixture()
    ).mechanism.kinematicLoopAnalysis();
    expect(wattAfter).toEqual(wattBefore);
    expect(sliderAfter).toEqual(sliderBefore);
  });

  it('keeps force headers aligned when tracer joints are present', () => {
    const { mechanism } = buildMechanism(teachingLabFourBarFixture(true));
    const header = mechanism.forceTitleRow('dynamics')!;
    const rows = mechanism.forceAnalysis('dynamics');
    expect(rows.every((row) => row.length === header.length)).toBe(true);
    expect(header.filter((column) => column.startsWith('Joint E Force'))).toEqual([]);
    expect(Number.isFinite(Number(rows[0][header.indexOf('Torque N*m')]))).toBe(true);
  });
});
