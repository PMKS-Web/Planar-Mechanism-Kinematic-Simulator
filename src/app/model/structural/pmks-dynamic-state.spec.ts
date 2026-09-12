import { buildMechanism, MechanismFixture } from '../../../test-utils/verification/fixture';
import {
  structuralCrankFixture,
  structuralDynamicCrankFixture,
} from '../../../test-utils/verification/structural-fixtures';
import {
  offsetLoadFourBarFixture,
  punchPressFixture,
} from '../../../test-utils/verification/force-fixtures';
import { bellCrankFixture } from '../../../test-utils/verification/workshop-fixtures';
import { RealLink } from '../link';
import { KinematicsSolver } from '../mechanism/kinematic-solver';
import { PositionSolver } from '../mechanism/position-solver';
import { ForceSolver } from '../mechanism/force-solver';
import { LengthUnit } from '../unit-enums';
import { siUnitFactorsForLength } from '../unit-conversions';
import { MODEL_SCALE } from '../render-scale';
import { analyzeDynamic } from './dynamic-force-solver';
import {
  analyzePmksDynamicFrame,
  PmksDynamicSample,
  snapshotPmksDynamicState,
} from './pmks-dynamic-state';
import { loadCaseFromPmksForces } from './pmks-configuration';
import { StructuralAnalysisService } from '../../services/structural-analysis.service';

const noLoad = { name: 'No load', loads: [] };
function sample(fixture = structuralDynamicCrankFixture(), sampleIndex = 0): PmksDynamicSample {
  return {
    mechanism: buildMechanism(fixture).mechanism,
    sampleIndex,
    lengthUnit: LengthUnit.METER,
    coordinateSpace: 'project',
  };
}
function snapshot(selected: PmksDynamicSample) {
  const result = snapshotPmksDynamicState(selected);
  if (result.status !== 'ok') throw new Error(result.status + ': ' + result.diagnostics.message);
  return result;
}
function scaledFixture(fixture: MechanismFixture, unit: LengthUnit, space: 'project' | 'model') {
  const factors = siUnitFactorsForLength(unit);
  const scale = (space === 'model' ? MODEL_SCALE : 1) / factors.distanceToM;
  return {
    ...fixture,
    load: undefined,
    loads: [],
    joints: fixture.joints.map((j) => ({ ...j, x: j.x * scale, y: j.y * scale })),
    links: fixture.links.map((link) => ({
      ...link,
      mass: link.mass! / factors.massToKg,
      moi: link.moi! / factors.inertiaToKgM2,
      com: link.com ? ([link.com[0] * scale, link.com[1] * scale] as [number, number]) : undefined,
    })),
  };
}
function close(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-8 * Math.max(1, Math.abs(expected)));
}

describe('PMKS dynamic sample adapter', () => {
  it('isolates the constraint-rate route as well as the loop route, with frozen source geometry', () => {
    const controls = PositionSolver as unknown as { forceCoupledRoute: boolean };
    controls.forceCoupledRoute = true;
    let coupled: PmksDynamicSample;
    try {
      coupled = sample(offsetLoadFourBarFixture(), 0);
    } finally {
      controls.forceCoupledRoute = false;
    }
    const seen = new WeakSet<object>();
    const freeze = (value: unknown): void => {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    };
    freeze(coupled.mechanism.joints[0]);
    freeze(coupled.mechanism.links[0]);
    freeze(PositionSolver.captureDriveState().simultaneousSystem);
    const neighbor = sample(structuralDynamicCrankFixture());
    expect(PositionSolver.coupledRoute).toBe(false);
    const before = PositionSolver.captureDriveState();
    const rateMap = KinematicsSolver.jointAccMap;
    const actual = snapshot(coupled);
    const expected = snapshot(sample(offsetLoadFourBarFixture()));
    // Account for the constraint route's numerical derivative tolerance.
    for (const state of actual.states) {
      const reference = expected.states.find((s) => s.linkId === state.linkId)!;
      close(state.angularAccelerationRadPerS2, reference.angularAccelerationRadPerS2);
      close(state.centerOfMassAccelerationMPerS2.x, reference.centerOfMassAccelerationMPerS2.x);
      close(state.centerOfMassAccelerationMPerS2.y, reference.centerOfMassAccelerationMPerS2.y);
    }
    // Re-select the neighbor only to establish the global state to protect.
    neighbor.mechanism.prepareSolvers();
    const current = PositionSolver.captureDriveState();
    const currentMap = KinematicsSolver.jointAccMap;
    expect(snapshot(coupled)).toEqual(actual);
    expect(PositionSolver.captureDriveState()).toEqual(current);
    expect(KinematicsSolver.jointAccMap).toBe(currentMap);
    expect(before.coupledRoute).toBe(false);
    expect(rateMap.size).toBe(0);
  });
  for (const unit of [LengthUnit.METER, LengthUnit.CM, LengthUnit.INCH]) {
    for (const space of ['project', 'model'] as const) {
      it('converts root CoM, acceleration, mass, and inertia in ' + unit + '/' + space, () => {
        const selected = {
          ...sample(scaledFixture(structuralDynamicCrankFixture(), unit, space)),
          lengthUnit: unit,
          coordinateSpace: space,
        };
        const actual = snapshot(selected);
        const mass = actual.configuration.bodies[0].massProperties!;
        close(mass.massKg, 2);
        close(mass.inertiaKgM2, 0.75);
        close(mass.centerOfMassM.x, 1);
        close(mass.centerOfMassM.y, 0.5);
        close(actual.states[0].centerOfMassAccelerationMPerS2.x, -4);
        close(actual.states[0].centerOfMassAccelerationMPerS2.y, -2);
        close(actual.states[0].angularAccelerationRadPerS2, 0);
        const dynamic = analyzePmksDynamicFrame(selected, {
          ...noLoad,
          gravityMPerS2: { x: 0, y: -9.80665 },
        });
        if (dynamic.status !== 'ok') throw new Error(dynamic.status);
        close(dynamic.jointReactions[0].forceN.x, -8);
        close(dynamic.jointReactions[0].forceN.y, 15.6133);
        close(dynamic.driverReactions[0].momentNm, 19.6133);
      });

      it('preserves nonzero angular acceleration in rad/s² in ' + unit + '/' + space, () => {
        const selected = {
          ...sample(scaledFixture(offsetLoadFourBarFixture(), unit, space)),
          lengthUnit: unit,
          coordinateSpace: space,
        };
        const actual = snapshot(selected);
        // Hand differentiation of the two scalar loop closure equations at sample zero.
        // rAB=(1.1,.5), rBC=(3,1.9), rDC=(-.9,2.4), omegaAB=1.
        close(
          actual.states.find((s) => s.linkId === 'BC')!.angularAccelerationRadPerS2,
          0.04544290973869205
        );
        close(
          actual.states.find((s) => s.linkId === 'CDL')!.angularAccelerationRadPerS2,
          0.6462922334444641
        );
        const reference = snapshot(sample(offsetLoadFourBarFixture()));
        for (const state of actual.states) {
          const expected = reference.states.find((s) => s.linkId === state.linkId)!;
          close(state.centerOfMassAccelerationMPerS2.x, expected.centerOfMassAccelerationMPerS2.x);
          close(state.centerOfMassAccelerationMPerS2.y, expected.centerOfMassAccelerationMPerS2.y);
        }
      });
    }
  }

  it('uses the selected sample and seconds, independent of call order, timestamps, and prior partition', () => {
    const first = sample(structuralDynamicCrankFixture(), 30);
    const second = sample(offsetLoadFourBarFixture(), 20);
    const before = first.mechanism.joints.map((js) => js.map((j) => [j.id, j.x, j.y]));
    const ratesBefore = KinematicsSolver.linkAccMap;
    const loopsBefore = KinematicsSolver.requiredLoops;
    const driveBefore = PositionSolver.captureDriveState();
    const positionMapBefore = PositionSolver.jointMapPositions;
    const a = snapshot(first);
    snapshot(second);
    snapshot({ ...first, sampleIndex: 90 });
    const repeated = snapshot(first);
    expect(repeated).toEqual(a);
    expect(snapshot({ ...first, sampleIndex: 0 }).states).not.toEqual(a.states);
    expect(a.timeSeconds).toBe(first.mechanism.timeNum[30]);
    expect(KinematicsSolver.linkAccMap).toBe(ratesBefore);
    expect(KinematicsSolver.requiredLoops).toBe(loopsBefore);
    expect(PositionSolver.captureDriveState()).toEqual(driveBefore);
    expect(PositionSolver.jointMapPositions).toBe(positionMapBefore);
    expect(first.mechanism.joints.map((js) => js.map((j) => [j.id, j.x, j.y]))).toEqual(before);
    // Analytical rates use the signed SI command, not differences of the sample clock.
    first.mechanism.timeNum[30] *= 1000;
    expect(snapshot(first).states).toEqual(a.states);
    const root = first.mechanism.links[30][0] as RealLink;
    expect(a.configuration.bodies[0].massProperties!.centerOfMassM).not.toBe(root.CoM);
  });

  it('F: consumes the existing welded bell crank as one authoritative root, never as its leaves', () => {
    const fixture = bellCrankFixture();
    const rootSpec = fixture.links.find((link) => link.joints === 'CDE')!;
    rootSpec.mass = 7;
    rootSpec.moi = 1.3;
    rootSpec.com = [2.4, 1.7];
    rootSpec.subset!.forEach((leaf) => {
      leaf.mass = 99;
      leaf.moi = 88;
    });
    const selected = sample(fixture, 30);
    const actual = snapshot(selected);
    const root = selected.mechanism.links[30].find((link) => link.id === 'CDE') as RealLink;
    expect(root.subset).toHaveLength(2);
    const mass = actual.configuration.bodies.find((body) => body.id === 'CDE')!.massProperties!;
    expect(mass).toEqual({
      massKg: root.mass,
      inertiaKgM2: root.massMoI,
      centerOfMassM: { x: root.CoM.x, y: root.CoM.y },
    });
    expect(mass.massKg).toBe(7);
    expect(mass.inertiaKgM2).toBe(1.3);
    expect(actual.states.map((s) => s.linkId)).not.toContain('CD');
    expect(actual.states.map((s) => s.linkId)).not.toContain('DE');
    selected.mechanism.prepareSolvers();
    KinematicsSolver.resetVariables();
    KinematicsSolver.determineKinematics(
      selected.mechanism.joints[30],
      selected.mechanism.links[30],
      selected.mechanism.inputAngularVelocities[30]
    );
    const omega = KinematicsSolver.linkAngVelMap.get('CDE')!;
    const state = actual.states.find((s) => s.linkId === 'CDE')!;
    const pivot = selected.mechanism.joints[30].find((j) => j.id === 'D')!;
    const rx = root.CoM.x - pivot.x,
      ry = root.CoM.y - pivot.y;
    close(
      state.centerOfMassAccelerationMPerS2.x,
      -state.angularAccelerationRadPerS2 * ry - omega * omega * rx
    );
    close(
      state.centerOfMassAccelerationMPerS2.y,
      state.angularAccelerationRadPerS2 * rx - omega * omega * ry
    );
    const result = analyzePmksDynamicFrame(selected, noLoad);
    if (result.status !== 'ok') throw new Error(result.status);
    const body = result.bodyEquilibrium.find((body) => body.linkId === 'CDE')!;
    close(body.inertialForceN.x, 7 * state.centerOfMassAccelerationMPerS2.x);
    close(body.inertialForceN.y, 7 * state.centerOfMassAccelerationMPerS2.y);
  });

  for (const fixture of [
    structuralDynamicCrankFixture,
    offsetLoadFourBarFixture,
    bellCrankFixture,
  ]) {
    for (const gravity of [false, true]) {
      it(
        'agrees with the strict legacy dynamic force equations: ' +
          fixture.name +
          ', gravity=' +
          gravity,
        () => {
          const selected = sample(fixture());
          for (const sampleIndex of [0, 30, 90]) {
            const current = { ...selected, sampleIndex };
            const { mechanism } = current;
            const state = snapshot(current);
            // Independent legacy path, explicitly prepared (no UI's displayed sample).
            mechanism.prepareSolvers();
            KinematicsSolver.resetVariables();
            KinematicsSolver.determineKinematics(
              mechanism.joints[sampleIndex],
              mechanism.links[sampleIndex],
              mechanism.inputAngularVelocities[sampleIndex]
            );
            const legacy = ForceSolver.analyzeFrame(
              mechanism.joints[sampleIndex],
              mechanism.links[sampleIndex],
              'dynamic',
              gravity,
              'm',
              mechanism.timeNum[sampleIndex],
              {
                linkAccelerations: KinematicsSolver.linkAccMap,
                linkAngularAccelerations: KinematicsSolver.linkAngAccMap,
                pistonAccelerations: new Map(),
              }
            );
            expect(legacy.status).toBe('ok');
            const frame = {
              ...current,
              joints: mechanism.joints[sampleIndex],
              links: mechanism.links[sampleIndex],
            };
            const loadCase = {
              ...loadCaseFromPmksForces(frame, mechanism.forces[sampleIndex], 'Legacy comparison'),
              gravityMPerS2: gravity ? { x: 0, y: -9.80665 } : undefined,
            };
            const actual = analyzeDynamic(state.configuration, state.states, loadCase);
            if (actual.status !== 'ok') throw new Error(actual.status);
            expect(legacy.sharedSupport).not.toBe(true);
            for (const reaction of actual.jointReactions) {
              const old = legacy.jointReactionsByLink.get(reaction.jointId)!.get(reaction.linkId)!;
              close(reaction.forceN.x, old[0]);
              close(reaction.forceN.y, old[1]);
            }
            close(actual.driverReactions[0].momentNm, legacy.inputEffort!.valueSI);
          }
        }
      );
    }
  }

  it('documents the legacy model-coordinate scaling discrepancy without copying it', () => {
    const selected = {
      ...sample(scaledFixture(structuralDynamicCrankFixture(), LengthUnit.METER, 'model')),
      coordinateSpace: 'model' as const,
    };
    const rates = selected.mechanism.snapshotAccelerations(0);
    const legacy = ForceSolver.analyzeFrame(
      selected.mechanism.joints[0],
      selected.mechanism.links[0],
      'dynamic',
      false,
      'm',
      0,
      {
        linkAccelerations: new Map(
          [...rates.linkAccelerations].map(([id, a]) => [id, [a[0], a[1]]])
        ),
        linkAngularAccelerations: new Map(rates.linkAngularAccelerations),
        pistonAccelerations: new Map(),
      }
    );
    const actual = analyzePmksDynamicFrame(selected, noLoad);
    if (actual.status !== 'ok') throw new Error(actual.status);
    close(actual.jointReactions[0].forceN.x, -8);
    close(legacy.jointReactionsByLink.get('A')!.get('AB')![0], -1600);
  });

  for (const sampleIndex of [-1, 0.5, Infinity, NaN, 999999]) {
    it('refuses an invalid sample index ' + sampleIndex, () => {
      const result = analyzePmksDynamicFrame({ ...sample(), sampleIndex }, noLoad);
      expect(result.status).toBe('invalid-dynamic-state');
      expect('jointReactions' in result).toBe(false);
    });
  }
  it('refuses absent analytical rates, errors, and nonfinite rate metadata without differencing', () => {
    const selected = sample();
    const spy = vi.spyOn(selected.mechanism, 'snapshotAccelerations').mockReturnValue({
      linkAccelerations: new Map(),
      linkAngularAccelerations: new Map(),
    });
    expect(analyzePmksDynamicFrame(selected, noLoad).status).toBe('invalid-dynamic-state');
    spy.mockImplementation(() => {
      throw new Error('Singular rate system');
    });
    expect(analyzePmksDynamicFrame(selected, noLoad).status).toBe('invalid-dynamic-state');
    spy.mockRestore();
    selected.mechanism.inputAngularVelocities[0] = NaN;
    expect(analyzePmksDynamicFrame(selected, noLoad).status).toBe('invalid-dynamic-state');
  });
  it('refuses prismatic samples before evaluating their acceleration source', () => {
    const selected = sample(punchPressFixture());
    const spy = vi.spyOn(selected.mechanism, 'snapshotAccelerations');
    expect(analyzePmksDynamicFrame(selected, noLoad).status).toBe('unsupported-joint-type');
    expect(spy).not.toHaveBeenCalled();
  });
  it('lets the dedicated service analyze an explicitly selected partition without changing document cases', () => {
    const service = new StructuralAnalysisService();
    service.replaceLoadCases([noLoad]);
    const partitions = [sample(structuralCrankFixture()).mechanism, sample().mechanism];
    const selected = { ...sample(), mechanism: partitions[1], sampleIndex: 30 };
    expect(service.analyzeDynamic(selected, noLoad)).toEqual(
      analyzePmksDynamicFrame(selected, noLoad)
    );
    expect(service.loadCases).toEqual([noLoad]);
  });
});
