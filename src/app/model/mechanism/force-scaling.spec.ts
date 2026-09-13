import { RevJoint } from '../joint';
import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { LengthUnit } from '../unit-enums';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { KinematicsSolver } from './kinematic-solver';
import { Coord } from '../coord';
import { Force } from '../force';
import { ForceUnit } from '../unit-enums';
import { siUnitFactorsForLength } from '../unit-conversions';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { ForceSolver } from './force-solver';
import { Injector } from '@angular/core';
import { ExportTableService } from '../../services/export/export-table.service';
import { ExportFlowService } from '../../services/export/export-flow.service';
import { ExportCatalogService } from '../../services/export/export-catalog.service';
import { ExportColumnsService } from '../../services/export/export-columns.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';

function physicalRod(unit: LengthUnit, customInertia = false, loaded = false) {
  const h = createMechanismHarness();
  h.settings.lengthUnit.next(unit);
  h.settings.forceUnit.next(unit === LengthUnit.INCH ? ForceUnit.LBF : ForceUnit.NEWTON);
  h.settings.isGravity.next(false);
  const factors = siUnitFactorsForLength(unit);
  const coordinate = MODEL_SCALE / factors.distanceToM;
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0.4 * coordinate, 0);
  a.driveSpeed = 30 / Math.PI;
  const bar = new RealLink('AB', [a, b]);
  bar.mass = 2 / factors.massToKg;
  if (customInertia) {
    bar.massMoI = 0.08 / factors.inertiaToKgM2;
    bar.moiIsCustom = true;
  }
  h.service.joints = [a, b];
  h.service.links = [bar];
  if (loaded) {
    const force = new Force(
      'F1',
      bar,
      new Coord(0.2 * coordinate, 0),
      new Coord(0.2 * coordinate, -coordinate),
      false,
      true,
      10 / factors.forceToN
    );
    h.service.forces = [force];
    bar.forces = [force];
  }
  wireGraph(h.service);
  h.service.updateMechanism();
  return { h, bar, factors };
}

describe('application force-analysis physical scaling', () => {
  it('requires 0.02 N for 1 kg at 0.02 m and 1 rad/s, including the drawing boundary', () => {
    const h = createMechanismHarness();
    h.settings.lengthUnit.next(LengthUnit.CM);
    h.settings.isGravity.next(false);
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 4 * MODEL_SCALE, 0);
    a.driveSpeed = 30 / Math.PI;
    const bar = new RealLink('AB', [a, b]);
    bar.mass = 1000; // Stored grams: exactly one physical kilogram.
    h.service.joints = [a, b];
    h.service.links = [bar];
    wireGraph(h.service);
    h.service.updateMechanism();
    const machine = h.service.mechanisms[0];
    machine.prepareSolvers();
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = machine.requiredLoops;
    KinematicsSolver.determineKinematics(machine.joints[0], machine.links[0], 1);
    expect(KinematicsSolver.linkAccMap.get('AB')![0]).toBeCloseTo(-2 * MODEL_SCALE, 10);
    expect(KinematicsSolver.linkAccMap.get('AB')![0] / MODEL_SCALE / 100).toBeCloseTo(-0.02, 12);
    const frame = machine.getForceAnalysis('dynamic').frames[0];
    expect(frame.status).toBe('ok');
    expect(frame.jointReactions.get('A')![0]).toBeCloseTo(-0.02, 10);
  });
  for (const unit of [LengthUnit.METER, LengthUnit.CM, LengthUnit.INCH]) {
    it(`retains physical position/rates, rod inertia, reactions and static moments in unit ${unit}`, () => {
      const { h, bar, factors } = physicalRod(unit, false, true);
      const machine = h.service.mechanisms[0];
      const samples = h.injector.get(AnalysisSampleService);
      const kin = (property: string) =>
        samples.sampleAt(machine, 0, 'kinematic', 'loop', property, 'AB');
      expect(bar.massMoI * factors.inertiaToKgM2).toBeCloseTo((2 * 0.4 ** 2) / 12, 12);
      expect(kin("Linear Link's CoM Pos")[0] * factors.distanceToM).toBeCloseTo(0.2, 10);
      expect(kin("Linear Link's CoM Vel")[1] * factors.distanceToM).toBeCloseTo(0.2, 10);
      expect(kin("Linear Link's CoM Acc")[0] * factors.distanceToM).toBeCloseTo(-0.2, 10);
      expect(kin('Angular Link Vel')[0]).toBeCloseTo(1, 10);
      expect(kin('Angular Link Acc')[0]).toBeCloseTo(0, 10);
      const statics = machine.getForceAnalysis('static').frames[0];
      const dynamic = machine.getForceAnalysis('dynamic').frames[0];
      expect(statics.inputEffort!.valueSI).toBeCloseTo(2, 10);
      expect(dynamic.inputEffort!.valueSI).toBeCloseTo(2, 10);
      expect(statics.jointReactions.get('A')![0]).toBeCloseTo(0, 10);
      expect(dynamic.jointReactions.get('A')![0]).toBeCloseTo(-0.4, 10);
      expect(dynamic.jointReactions.get('A')![1]).toBeCloseTo(10, 10);
      const effort = samples.sampleAt(machine, 0, 'force', 'dynamic', 'Input Effort', 'A')[0];
      expect(effort * factors.forceToN * factors.distanceToM).toBeCloseTo(2, 10);
      const exporting = Injector.create({
        parent: h.injector,
        providers: [
          { provide: ExportTableService, deps: [] },
          { provide: ExportFlowService, deps: [] },
          { provide: ExportCatalogService, deps: [] },
          { provide: ExportColumnsService, deps: [] },
          {
            provide: SelectedTabService,
            useValue: { getCurrentTab: () => TabID.FORCE, isAnalysisMode: () => true },
          },
        ],
      });
      h.settings.forceAnalysisMode.next('dynamic');
      const flow = exporting.get(ExportFlowService);
      flow.reset();
      const input = flow
        .partGroups()
        .flatMap((group) => group.parts)
        .find((part) => part.id === 'A')!;
      flow.togglePart(input);
      const table = exporting.get(ExportTableService).tables()[0];
      const torqueColumn = table.heads.findIndex((head) => head.includes('input torque')) - 1;
      expect(torqueColumn).toBeGreaterThanOrEqual(0);
      expect(table.columns[torqueColumn][0] * factors.forceToN * factors.distanceToM).toBeCloseTo(
        2,
        10
      );
      exporting.destroy();
      const legacy = machine.forceAnalysis('dynamics')[0];
      expect(
        Number(legacy[3]) * (unit === LengthUnit.INCH ? factors.forceToN * factors.distanceToM : 1)
      ).toBeCloseTo(2, 4);
      expect(Number(legacy[1]) * factors.forceToN).toBeCloseTo(-0.4, 3);
      // Angular acceleration is prescribed here at the domain boundary: the app's
      // single crank runs at constant speed and cannot create this test by itself.
      const tangential = ForceSolver.analyzeFrame(
        machine.joints[0],
        machine.links[0],
        'dynamic',
        false,
        machine.unit,
        0,
        {
          linkAccelerations: new Map([['AB', [0, (0.6 * MODEL_SCALE) / factors.distanceToM]]]),
          linkAngularAccelerations: new Map([['AB', 3]]),
          pistonAccelerations: new Map(),
        },
        false,
        machine.coordinateScale
      );
      expect(tangential.inputEffort!.valueSI).toBeCloseTo(
        2 + (0.02666666666666667 + 2 * 0.2 ** 2) * 3,
        10
      );
    });
    it(`preserves manually entered physical inertia in unit ${unit}`, () => {
      const { h, bar, factors } = physicalRod(unit, true);
      expect(bar.moiIsCustom).toBe(true);
      expect(bar.massMoI * factors.inertiaToKgM2).toBeCloseTo(0.08, 12);
      const machine = h.service.mechanisms[0];
      const result = ForceSolver.analyzeFrame(
        machine.joints[0],
        machine.links[0],
        'dynamic',
        false,
        machine.unit,
        0,
        {
          linkAccelerations: new Map([['AB', [0, 0]]]),
          linkAngularAccelerations: new Map([['AB', 3]]),
          pistonAccelerations: new Map(),
        },
        false,
        machine.coordinateScale
      );
      expect(result.inputEffort!.valueSI).toBeCloseTo(0.24, 12);
    });
  }
  it('preserves the physical force and inertia through actual cm to m to inch edits', () => {
    const { h } = physicalRod(LengthUnit.CM, true, true);
    let previous = LengthUnit.CM;
    for (const next of [LengthUnit.METER, LengthUnit.INCH, LengthUnit.CM]) {
      h.settings.lengthUnit.next(next);
      h.service.updateLinkageUnits(previous, next);
      h.service.updateMechanism();
      const machine = h.service.mechanisms[0];
      const frame = machine.getForceAnalysis('dynamic').frames[0];
      expect(frame.jointReactions.get('A')![0]).toBeCloseTo(-0.4, 9);
      expect(frame.inputEffort!.valueSI).toBeCloseTo(2, 9);
      expect(
        (machine.links[0][0] as RealLink).massMoI * siUnitFactorsForLength(next).inertiaToKgM2
      ).toBeCloseTo(0.08, 12);
      previous = next;
    }
  });
  it('converts finite-difference acceleration once when analytic kinematics are unavailable', () => {
    const { h } = physicalRod(LengthUnit.CM);
    const original = h.service.mechanisms[0];
    const times = [-0.0001, 0, 0.0001];
    const bodies = times.map((time) => {
      const angle = 2 * time + 1.5 * time ** 2;
      const a = new RevJoint('A', 0, 0, true, true);
      const b = new RevJoint('B', 8000 * Math.cos(angle), 8000 * Math.sin(angle));
      const body = new RealLink('AB', [a, b], 2000, 800, new Coord(b.x / 2, b.y / 2));
      a.links = [body];
      b.links = [body];
      return body;
    });
    const skipAnalytic = vi
      .spyOn(KinematicsSolver, 'determineKinematics')
      .mockImplementation(() => {});
    try {
      const frames = ForceSolver.analyzeMechanism(
        {
          joints: bodies.map((body) => body.joints),
          links: bodies.map((body) => [body]),
          timeNum: times,
          inputAngularVelocities: [2, 2, 2],
          requiredLoops: [],
          gravity: false,
          unit: 'cm',
          coordinateScale: original.coordinateScale,
        },
        'dynamic'
      ).frames;
      expect(frames[1].status).toBe('ok');
      expect(frames[1].jointReactions.get('A')![0]).toBeCloseTo(-1.6, 6);
      expect(frames[1].jointReactions.get('A')![1]).toBeCloseTo(1.2, 6);
      expect(frames[1].inputEffort!.valueSI).toBeCloseTo((0.08 + 2 * 0.2 ** 2) * 3, 6);
    } finally {
      skipAnalytic.mockRestore();
    }
  });
});
