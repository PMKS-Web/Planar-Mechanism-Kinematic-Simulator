import { buildMechanism } from '../../../test-utils/verification/fixture';
import { structuralCrankFixture } from '../../../test-utils/verification/structural-fixtures';
import { bellCrankFixture } from '../../../test-utils/verification/workshop-fixtures';
import {
  memberAB,
  uniformAB,
  memberSuccess,
  atMember,
  verifyMemberCuts,
} from '../../../test-utils/verification/member-verification';
import { LengthUnit } from '../unit-enums';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactorsForLength } from '../unit-conversions';
import { PositionSolver } from '../mechanism/position-solver';
import { KinematicsSolver } from '../mechanism/kinematic-solver';
import { snapshotPmksMemberMotion, snapshotPmksDynamicState } from './pmks-dynamic-state';
import { snapshotPmksConfiguration } from './pmks-configuration';
import { analyzeDynamic } from './dynamic-force-solver';
import { analyzeStatic } from './static-force-solver';
import { recoverDynamicMemberLoads, recoverStaticMemberLoads } from './member-load-recovery';
import {
  decodeStructuralDocument,
  encodeStructuralDocument,
} from '../../services/transcoding/structural-codec';
import type { LoadCase } from './loads';
import { RealLink } from '../link';
import { RevJoint } from '../joint';

const noLoad: LoadCase = { name: 'No load', loads: [] };
describe('PMKS member interpretation and section motion', () => {
  for (const unit of [LengthUnit.METER, LengthUnit.CM, LengthUnit.INCH]) {
    for (const space of ['model', 'project'] as const) {
      for (const speed of [-2, 2]) {
        it('uses signed analytical rad/s at selected samples in ' + [unit, space, speed], () => {
          const fixture = structuralCrankFixture();
          const factors = siUnitFactorsForLength(unit);
          const scale = (space === 'model' ? MODEL_SCALE : 1) / factors.distanceToM;
          fixture.load = undefined;
          fixture.inputAngVel = speed;
          fixture.joints.forEach((joint) => {
            joint.x *= scale;
            joint.y *= scale;
          });
          fixture.links[0] = {
            ...fixture.links[0],
            mass: 2 / factors.massToKg,
            moi: 2 / 3 / factors.inertiaToKgM2,
            com: [scale, 0],
          };
          const mechanism = buildMechanism(fixture).mechanism;
          const sample = { mechanism, sampleIndex: 0, coordinateSpace: space, lengthUnit: unit };
          const positions = mechanism.joints[30].map((j) => [j.id, j.x, j.y]);
          const drive = PositionSolver.captureDriveState(),
            rateMap = KinematicsSolver.linkAngVelMap;
          const state = snapshotPmksMemberMotion(sample);
          if (state.status !== 'ok') throw new Error(state.message);
          expect(state.states[0].angularVelocityRadPerS).toBeCloseTo(speed, 12);
          const later = snapshotPmksMemberMotion({ ...sample, sampleIndex: 30 });
          if (later.status !== 'ok') throw new Error(later.message);
          expect(later.states[0].angularVelocityRadPerS).toBeCloseTo(speed, 12);
          expect(later.states[0].centerOfMassAccelerationMPerS2).not.toEqual(
            state.states[0].centerOfMassAccelerationMPerS2
          );
          expect(snapshotPmksDynamicState(sample).status).toBe('ok');
          const eq = analyzeDynamic(state.configuration, state.states, noLoad);
          const result = memberSuccess(
            recoverDynamicMemberLoads(state.configuration, memberAB, noLoad, eq, state.states[0], {
              massDistribution: uniformAB,
            })
          );
          verifyMemberCuts(state.configuration, noLoad, eq, result, state.states[0]);
          expect(atMember(result, 1).axialN).toBeCloseTo(6, 8);
          expect(PositionSolver.captureDriveState()).toEqual(drive);
          expect(KinematicsSolver.linkAngVelMap).toBe(rateMap);
          expect(mechanism.joints[30].map((j) => [j.id, j.x, j.y])).toEqual(positions);
        });
      }
    }
  }
  it('recovers the formerly rounded project-space sample with unchanged mass validation', () => {
    const fixture = structuralCrankFixture();
    fixture.inputAngVel = 2;
    const mechanism = buildMechanism(fixture).mechanism;
    const snapshot = snapshotPmksMemberMotion({
      mechanism,
      sampleIndex: 30,
      lengthUnit: LengthUnit.METER,
      coordinateSpace: 'project',
    });
    if (snapshot.status !== 'ok') throw new Error(snapshot.message);
    const eq = analyzeDynamic(snapshot.configuration, snapshot.states, noLoad);
    expect(eq.status).toBe('ok');
    const result = recoverDynamicMemberLoads(
      snapshot.configuration,
      memberAB,
      noLoad,
      eq,
      snapshot.states[0],
      { massDistribution: uniformAB }
    );
    memberSuccess(result);
  });
  it('recovers a nonzero model-space sample when its actual geometry satisfies the same consistency tolerance', () => {
    const fixture = structuralCrankFixture();
    const scale = MODEL_SCALE / 0.01;
    fixture.joints.forEach((j) => {
      j.x *= scale;
      j.y *= scale;
    });
    fixture.links[0] = { joints: 'AB', mass: 2000, moi: 2 / 3 / 0.0001, com: [scale, 0] };
    fixture.inputAngVel = 2;
    fixture.load = undefined;
    const mechanism = buildMechanism(fixture).mechanism;
    const state = snapshotPmksMemberMotion({
      mechanism,
      sampleIndex: 30,
      coordinateSpace: 'model',
      lengthUnit: LengthUnit.CM,
    });
    if (state.status !== 'ok') throw new Error(state.message);
    const eq = analyzeDynamic(state.configuration, state.states, noLoad);
    const result = memberSuccess(
      recoverDynamicMemberLoads(state.configuration, memberAB, noLoad, eq, state.states[0], {
        massDistribution: uniformAB,
      })
    );
    verifyMemberCuts(state.configuration, noLoad, eq, result, state.states[0]);
    expect(atMember(result, 1).axialN).toBeCloseTo(6, 7);
  });
  it('refuses missing velocity in S3 while the same acceleration source remains sufficient for S2', () => {
    const mechanism = buildMechanism(structuralCrankFixture()).mechanism;
    const original = mechanism.snapshotAccelerations(0);
    vi.spyOn(mechanism, 'snapshotAccelerations').mockReturnValue({
      linkAccelerations: original.linkAccelerations,
      linkAngularAccelerations: original.linkAngularAccelerations,
    });
    const sample = {
      mechanism,
      sampleIndex: 0,
      coordinateSpace: 'project' as const,
      lengthUnit: LengthUnit.METER,
    };
    expect(snapshotPmksDynamicState(sample).status).toBe('ok');
    expect(snapshotPmksMemberMotion(sample).status).toBe('missing-angular-velocity');
  });
  it('rejects the real bell-crank compound rather than inventing an axis through its leaves', () => {
    const built = buildMechanism(bellCrankFixture());
    const snapshot = snapshotPmksConfiguration({
      joints: built.joints,
      links: built.links,
      coordinateSpace: 'project',
      lengthUnit: LengthUnit.METER,
    });
    if (snapshot.status !== 'ok') throw new Error(snapshot.message);
    const result = recoverStaticMemberLoads(
      snapshot.configuration,
      { ...memberAB, id: 'bell', bodyId: 'CDE', startJointId: 'C', endJointId: 'E' },
      noLoad,
      analyzeStatic(snapshot.configuration, noLoad)
    );
    expect(result.status).toBe('unsupported-compound');
  });
  it('retains provenance for a two-ended compound and for a circular two-pin body', () => {
    const built = buildMechanism(structuralCrankFixture());
    const link = built.links[0] as RealLink;
    for (const shape of ['compound', 'circle']) {
      link.subset = shape === 'compound' ? [new RealLink('AB', built.joints, 2, 2 / 3)] : [];
      link.isCircle = shape === 'circle';
      const snapshot = snapshotPmksConfiguration({
        joints: built.joints,
        links: built.links,
        coordinateSpace: 'project',
        lengthUnit: LengthUnit.METER,
      });
      if (snapshot.status !== 'ok') throw new Error(snapshot.message);
      const result = recoverStaticMemberLoads(
        snapshot.configuration,
        memberAB,
        noLoad,
        analyzeStatic(snapshot.configuration, noLoad)
      );
      expect(result.status).toBe(
        shape === 'compound' ? 'unsupported-compound' : 'unsupported-member-geometry'
      );
    }
  });
  it('refuses a tracer-bearing root even when all three pins are collinear', () => {
    const built = buildMechanism(structuralCrankFixture());
    const tracer = new RevJoint('C', 1, 0);
    const snapshot = snapshotPmksConfiguration({
      joints: [...built.joints, tracer],
      links: [new RealLink('ABC', [...built.joints, tracer], 2, 2 / 3)],
      coordinateSpace: 'project',
      lengthUnit: LengthUnit.METER,
    });
    if (snapshot.status !== 'ok') throw new Error(snapshot.message);
    expect(
      recoverStaticMemberLoads(
        snapshot.configuration,
        { ...memberAB, bodyId: 'ABC' },
        noLoad,
        analyzeStatic(snapshot.configuration, noLoad)
      ).status
    ).toBe('unsupported-member-geometry');
  });
  it('persists located couples without changing the existing T1 encoding or unlocated-couple compatibility', () => {
    const load: LoadCase = {
      name: 'Couples',
      loads: [
        {
          kind: 'moment',
          linkId: 'AB',
          momentNm: 5,
          at: { frame: 'link', positionM: { x: 0.4, y: 0 } },
        },
        { kind: 'moment', linkId: 'AB', momentNm: -2 },
      ],
    };
    const document = { links: [], loadCases: [load] };
    const encoded = encodeStructuralDocument(document);
    expect(encoded[0]).toMatch(/^T1/);
    expect(decodeStructuralDocument(encoded)).toEqual(document);
    expect(() =>
      encodeStructuralDocument({
        links: [],
        loadCases: [
          {
            ...load,
            loads: [
              {
                kind: 'moment',
                linkId: 'AB',
                momentNm: 1,
                at: { frame: 'global', positionM: { x: NaN, y: 0 } },
              },
            ],
          },
        ],
      })
    ).toThrow();
  });
});
