import {
  stressRectangle as rectangle,
  stressCircle as circle,
  stressDiagram,
  stressSuccess,
  integrateSection,
} from '../../../test-utils/verification/stress-verification';
import { evaluateMemberStress, evaluateStressProfileAtStation } from './member-stress';
import {
  memberConfiguration,
  memberAB,
  uniformAB,
  noMemberLoad,
  memberSuccess,
} from '../../../test-utils/verification/member-verification';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzeStatic } from './static-force-solver';
import { recoverDynamicMemberLoads, recoverStaticMemberLoads } from './member-load-recovery';
import type { CrossSection } from './cross-section';
import type { StressLocation } from './stress-results';
import type { MemberLoadsSuccess } from './member-results';
import { snapshotPmksMemberMotion } from './pmks-dynamic-state';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  structuralCrankFixture,
  structuralUniformMemberFixture,
} from '../../../test-utils/verification/structural-fixtures';
import { LengthUnit } from '../unit-enums';

const station = { xM: 1, side: 'right' as const };
function point(N: number, V: number, M: number, yM: number, section = rectangle) {
  return stressSuccess(evaluateMemberStress(stressDiagram(N, V, M), section, { ...station, yM }));
}
describe('nominal elementary-beam stress', () => {
  it('matches nonzero static/dynamic gravity stresses while retaining lumped versus distributed assumptions', () => {
    const c = memberConfiguration(structuralUniformMemberFixture());
    const load = { name: 'Self-weight', loads: [], gravityMPerS2: { x: 0, y: -10 } };
    const motion = c.bodies.map((body) => ({
      linkId: body.id,
      centerOfMassAccelerationMPerS2: { x: 0, y: 0 },
      angularAccelerationRadPerS2: 0,
      angularVelocityRadPerS: 0,
    }));
    const staticEq = analyzeStatic(c, load),
      dynamicEq = analyzeDynamic(c, motion, load);
    const options = { gravityModel: 'uniform-line' as const, massDistribution: uniformAB };
    const staticLoads = memberSuccess(
      recoverStaticMemberLoads(c, memberAB, load, staticEq, options)
    );
    const dynamicLoads = memberSuccess(
      recoverDynamicMemberLoads(c, memberAB, load, dynamicEq, motion[0], options)
    );
    const lumpedLoads = memberSuccess(
      recoverStaticMemberLoads(c, memberAB, load, staticEq, { gravityModel: 'lumped-at-com' })
    );
    const query = { xM: 0.5, side: 'right' as const, yM: -0.01 };
    const a = stressSuccess(evaluateMemberStress(staticLoads, rectangle, query));
    const b = stressSuccess(evaluateMemberStress(dynamicLoads, rectangle, query));
    const lumped = stressSuccess(evaluateMemberStress(lumpedLoads, rectangle, query));
    expect(a.normalStressPa).toBeCloseTo(13.125e6, 5);
    expect(b.normalStressPa).toBeCloseTo(a.normalStressPa, 5);
    expect(b.vonMisesStressPa).toBeCloseTo(a.vonMisesStressPa, 5);
    expect(lumped.normalStressPa).toBeCloseTo(15e6, 5);
    expect(lumped.provenance.gravityModel).toBe('lumped-at-com');
    expect(a.provenance.gravityModel).toBe('uniform-line');
  });
  it('refuses numerical stress overflow without returning partial stresses', () => {
    const result = evaluateMemberStress(
      stressDiagram(0, 0, 1e100),
      { kind: 'circle', diameterM: 1e-70 },
      { ...station, yM: 0.5e-70 }
    );
    expect(result.status).toBe('numerical-failure');
    expect('normalStressPa' in result).toBe(false);
  });
  for (const N of [2400, -2400])
    it('A/B: retains the axial tension/compression sign for N=' + N, () => {
      for (const yM of [-0.01, 0, 0.01]) {
        const p = point(N, 0, 0, yM);
        expect(p.normalStressPa).toBeCloseTo(N / 0.0002, 6);
        expect(p.bendingNormalStressPa).toBeCloseTo(0, 8);
        expect(p.vonMisesStressPa).toBeCloseTo(Math.abs(N) / 0.0002, 6);
      }
    });
  it('C: positive sagging bends the top into compression and bottom into tension', () => {
    expect(point(0, 0, 10, 0.01).normalStressPa).toBeCloseTo(-15e6, 6);
    expect(point(0, 0, 10, 0).normalStressPa).toBeCloseTo(0, 8);
    expect(point(0, 0, 10, -0.01).normalStressPa).toBeCloseTo(15e6, 6);
  });
  for (const section of [rectangle, circle])
    for (const V of [-800, 800]) {
      it(
        'D/E: signed shear profile and independent N/V/M integration for ' +
          section.kind +
          ', V=' +
          V,
        () => {
          const diagram = stressDiagram(2400, V, 10);
          const sample = (yM: number) =>
            stressSuccess(evaluateMemberStress(diagram, section, { ...station, yM }));
          const area = section.kind === 'rectangle' ? 0.0002 : Math.PI * 0.01 ** 2;
          const factor = section.kind === 'rectangle' ? 1.5 : 4 / 3;
          expect(sample(-0.01).transverseShearStressPa).toBeCloseTo(0, 8);
          expect(sample(0.01).transverseShearStressPa).toBeCloseTo(0, 8);
          expect(sample(0).transverseShearStressPa).toBeCloseTo((-factor * V) / area, 6);
          expect(sample(0.005).transverseShearStressPa).toBeCloseTo((-0.75 * factor * V) / area, 6);
          expect(integrateSection(section, (y) => sample(y).normalStressPa)).toBeCloseTo(2400, 7);
          expect(
            integrateSection(section, (y) => -y * sample(y).bendingNormalStressPa)
          ).toBeCloseTo(10, 7);
          expect(integrateSection(section, (y) => sample(y).transverseShearStressPa)).toBeCloseTo(
            -V,
            7
          );
        }
      );
    }
  it('F: retains separate axial and bending contributions', () => {
    const top = point(2400, 0, 10, 0.01),
      bottom = point(2400, 0, 10, -0.01);
    expect(top.axialNormalStressPa).toBeCloseTo(12e6, 6);
    expect(top.bendingNormalStressPa).toBeCloseTo(-15e6, 6);
    expect(top.normalStressPa).toBeCloseTo(-3e6, 6);
    expect(bottom.normalStressPa).toBeCloseTo(27e6, 6);
  });
  it('G/H: worked 4.5 MPa normal, -4.5 MPa shear gives 9 MPa von Mises and FoS 20', () => {
    const p = stressSuccess(
      evaluateMemberStress(
        stressDiagram(2400, 800, 10),
        rectangle,
        { ...station, yM: 0.005 },
        { name: 'Example', yieldStrengthPa: 180e6 }
      )
    );
    expect(p.normalStressPa).toBeCloseTo(4.5e6, 6);
    expect(p.transverseShearStressPa).toBeCloseTo(-4.5e6, 6);
    expect(p.vonMisesStressPa).toBeCloseTo(9e6, 6);
    expect(p.principalStress1Pa).toBeCloseTo(2.25e6 + Math.sqrt(2.25e6 ** 2 + 4.5e6 ** 2), 6);
    expect(p.principalStress1Pa + p.principalStress2Pa).toBeCloseTo(p.normalStressPa, 6);
    expect(p.materialCriterion).toMatchObject({
      status: 'available',
      utilization: 0.05,
      factorOfSafety: 20,
    });
  });
  it('I: zero stress has a serializable unbounded FoS state', () => {
    const p = stressSuccess(
      evaluateMemberStress(
        stressDiagram(),
        rectangle,
        { ...station, yM: 0 },
        { name: 'Steel', yieldStrengthPa: 250e6 }
      )
    );
    expect(p.vonMisesStressPa).toBe(0);
    expect(p.materialCriterion).toMatchObject({
      utilization: 0,
      factorOfSafety: null,
      factorOfSafetyState: 'unbounded-zero-demand',
    });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
  });
  it('leaves stress valid when yield strength is missing or material data is invalid', () => {
    for (const material of [
      undefined,
      { name: 'Ultimate only', ultimateStrengthPa: 500e6 },
      { name: 'Invalid', yieldStrengthPa: -1 },
      { name: 'Invalid', yieldStrengthPa: NaN },
    ]) {
      const p = stressSuccess(
        evaluateMemberStress(stressDiagram(2400), rectangle, { ...station, yM: 0 }, material)
      );
      expect(p.normalStressPa).toBeCloseTo(12e6, 6);
      expect(p.materialCriterion.status).toBe('unavailable');
    }
  });
  it('preserves axial, shear, and couple jumps with event sides', () => {
    const diagram = stressDiagram(2400, 800, 10);
    const left = stressSuccess(
      evaluateMemberStress(diagram, rectangle, { xM: 2, side: 'left', yM: 0.005 })
    );
    const right = stressSuccess(
      evaluateMemberStress(diagram, rectangle, { xM: 2, side: 'right', yM: 0.005 })
    );
    expect(left.axialNormalStressPa).toBeCloseTo(12e6, 6);
    expect(left.transverseShearStressPa).toBeCloseTo(-4.5e6, 6);
    expect(left.bendingNormalStressPa).toBeCloseTo((-810 * 0.005) / ((0.01 * 0.02 ** 3) / 12), 5);
    expect(right.normalStressPa).toBeCloseTo(0, 6);
    expect(right.transverseShearStressPa).toBeCloseTo(0, 6);
    expect(right.location.side).toBe('right');
  });
  it('returns requested section profiles and defaults to bottom, centroid, and top', () => {
    const diagram = stressDiagram(2400, 800, 10);
    const profile = evaluateStressProfileAtStation(diagram, rectangle, station);
    if (profile.status !== 'ok') throw new Error(profile.message);
    expect(profile.points.map((p) => p.location.yM)).toEqual([-0.01, 0, 0.01]);
    expect(evaluateStressProfileAtStation(diagram, rectangle, station, [0.02]).status).toBe(
      'invalid-section-coordinate'
    );
    expect(evaluateStressProfileAtStation(diagram, rectangle, station, []).status).toBe(
      'invalid-section-coordinate'
    );
  });
  it('retains local stress under global rotation and translation', () => {
    const c = memberConfiguration(),
      transform = (p: { x: number; y: number }) => ({ x: 9 - p.y, y: -4 + p.x });
    const moved = {
      ...c,
      joints: c.joints.map((j) => ({ ...j, positionM: transform(j.positionM) })),
      bodies: c.bodies.map((b) => ({
        ...b,
        massProperties: {
          ...b.massProperties!,
          centerOfMassM: transform(b.massProperties!.centerOfMassM),
        },
      })),
    };
    const a = stressSuccess(
      evaluateMemberStress(stressDiagram(2400, 800, 10), rectangle, { ...station, yM: 0.005 })
    );
    const b = stressSuccess(
      evaluateMemberStress(stressDiagram(2400, 800, 10, moved), rectangle, {
        ...station,
        yM: 0.005,
      })
    );
    expect(b.normalStressPa).toBeCloseTo(a.normalStressPa, 5);
    expect(b.transverseShearStressPa).toBeCloseTo(a.transverseShearStressPa, 5);
  });
  it('uses the same formulas for static and zero-motion dynamic recovery, preserving different provenance', () => {
    const c = memberConfiguration(),
      motion = {
        linkId: 'AB',
        centerOfMassAccelerationMPerS2: { x: 0, y: 0 },
        angularAccelerationRadPerS2: 0,
        angularVelocityRadPerS: 0,
        source: 'prescribed' as const,
      };
    const eq = analyzeDynamic(c, [motion], noMemberLoad);
    const dynamic = memberSuccess(
      recoverDynamicMemberLoads(c, memberAB, noMemberLoad, eq, motion, {
        massDistribution: uniformAB,
      })
    );
    const a = stressSuccess(
      evaluateMemberStress(stressDiagram(), rectangle, { ...station, yM: 0.005 })
    );
    const b = stressSuccess(evaluateMemberStress(dynamic, rectangle, { ...station, yM: 0.005 }));
    expect(b.normalStressPa).toBe(a.normalStressPa);
    expect(b.vonMisesStressPa).toBe(a.vonMisesStressPa);
    expect(b.provenance).toMatchObject({
      mode: 'dynamic',
      massModel: 'uniform-line',
      inertiaModel: 'distributed-uniform-line',
      motionSource: 'prescribed',
    });
  });
  it('retains analytical motion provenance from PMKS and propagates rounded-sample refusal', () => {
    const mechanism = buildMechanism(structuralCrankFixture()).mechanism;
    for (const sampleIndex of [0, 30]) {
      const snapshot = snapshotPmksMemberMotion({
        mechanism,
        sampleIndex,
        lengthUnit: LengthUnit.METER,
        coordinateSpace: 'project',
      });
      if (snapshot.status !== 'ok') throw new Error(snapshot.message);
      const eq = analyzeDynamic(snapshot.configuration, snapshot.states, noMemberLoad);
      const member = recoverDynamicMemberLoads(
        snapshot.configuration,
        memberAB,
        noMemberLoad,
        eq,
        snapshot.states[0],
        { massDistribution: uniformAB }
      );
      const stress = evaluateMemberStress(member, circle, { ...station, yM: 0 });
      if (sampleIndex === 0)
        expect(stressSuccess(stress).provenance.motionSource).toBe('pmks-analytical');
      else expect(stress.status).toBe('upstream-analysis-failed');
    }
  });
  it('refuses invalid sections, coordinates, stations, and malformed upstream data', () => {
    const diagram = stressDiagram();
    for (const [section, status] of [
      [undefined, 'missing-cross-section'],
      [{ kind: 'tube' }, 'unsupported-cross-section'],
      [{ kind: 'circle', diameterM: 0 }, 'invalid-section-properties'],
    ] as const)
      expect(
        evaluateMemberStress(diagram, section as CrossSection, { ...station, yM: 0 }).status
      ).toBe(status);
    for (const yM of [0.010000001, -0.02, NaN, Infinity])
      expect(evaluateMemberStress(diagram, rectangle, { ...station, yM }).status).toBe(
        'invalid-section-coordinate'
      );
    expect(
      evaluateMemberStress(diagram, rectangle, { xM: 1, yM: 0 } as StressLocation).status
    ).toBe('invalid-station');
    expect(evaluateMemberStress(diagram, rectangle, { xM: -1, yM: 0, side: 'left' }).status).toBe(
      'invalid-station'
    );
    for (const bad of [
      { ...diagram, segments: [] },
      { ...diagram, mode: 'invented' },
      { ...diagram, segments: [{ ...diagram.segments[0], axialN: [NaN] }] },
    ])
      expect(
        evaluateMemberStress(bad as MemberLoadsSuccess, rectangle, { ...station, yM: 0 }).status
      ).toBe('invalid-member-load-result');
  });
  it('does not mutate or alias frozen input section, loads, material, or query', () => {
    const loads = stressDiagram(2400),
      section = Object.freeze({ ...rectangle });
    const material = Object.freeze({ name: 'Steel', yieldStrengthPa: 250e6 });
    const location = Object.freeze({ ...station, yM: 0 });
    const before = JSON.stringify(loads);
    const a = stressSuccess(evaluateMemberStress(loads, section, location, material));
    expect(evaluateMemberStress(loads, section, location, material)).toEqual(a);
    expect(a.location).not.toBe(location);
    expect(a.provenance.crossSection).not.toBe(section);
    expect(JSON.stringify(loads)).toBe(before);
  });
});
