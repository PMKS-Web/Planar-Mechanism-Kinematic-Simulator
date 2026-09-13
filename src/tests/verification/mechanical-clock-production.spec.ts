import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { SettingsService } from '../../app/services/settings.service';
import { GearEditorService } from '../../app/services/gear-editor.service';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { SolverExplanationService } from '../../app/services/solver-explanation.service';
import { ExportFlowService } from '../../app/services/export/export-flow.service';
import { ExportTableService } from '../../app/services/export/export-table.service';
import { toCsv } from '../../app/services/export/csv-writer';
import { toXlsx } from '../../app/services/export/xlsx-writer';
import { AngleUnit, LengthUnit } from '../../app/model/unit-enums';
import { RealJoint } from '../../app/model/joint';
import { gearDerivation } from '../../app/model/gear-derivation';
import { GEAR_QUANTITIES } from '../../app/model/gear-analysis';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { MECHANICAL_CLOCK } from '../../test-utils/verification/mechanical-clock-fixture';
import { validateGearAssembly } from '../../app/model/mechanism/gear-validation';

const encode = () => TestBed.inject(UrlGenerationService).generateUrlQuery();
describe('mechanical clock production document', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(
      TEMPLATE_LINKAGES.Mechanical_Clock,
      false,
      true,
      true
    );
  });
  afterEach(() => TestBed.inject(MechanismService).animate(0, false));

  it('loads distinct concentric hand hosts and round-trips the ordinary G1 document', () => {
    const s = TestBed.inject(MechanismService),
      first = encode();
    expect(s.links.map((l) => l.name)).toEqual(['Minute hand', 'Intermediate shaft', 'Hour hand']);
    expect(s.driveSpeedOf(s.joints[0] as RealJoint)).toBe(-60);
    for (let i = 0; i < 4; i++) {
      TestBed.inject(UrlProcessorService).updateFromURL(encode(), false, true, false);
      expect(encode()).toBe(first);
      const m = s.mechanisms[0];
      expect(m.isMechanismValid()).toBe(true);
      expect(m.gearDrive!.bodies).toHaveLength(3);
      expect(m.joints).toHaveLength(4321);
      expect(m.gearTravel.at(-1)).toBeCloseTo(-24 * Math.PI, 10);
      expect(s.joints.filter((j) => (j as RealJoint).input)).toHaveLength(1);
      expect(s.gears.find((g) => g.id === 'GA')!.hostLinkId).not.toBe(
        s.gears.find((g) => g.id === 'GD')!.hostLinkId
      );
    }
  });

  it('keeps coaxial geometry, pitch spacing and twelve turns through unit changes and reload', () => {
    const s = TestBed.inject(MechanismService),
      settings = TestBed.inject(SettingsService);
    for (const unit of [LengthUnit.METER, LengthUnit.INCH, LengthUnit.CM]) {
      s.updateLinkageUnits(settings.lengthUnit.value, unit);
      settings.lengthUnit.next(unit);
      s.updateMechanism(true);
      TestBed.inject(UrlProcessorService).updateFromURL(encode(), false, true, false);
      expect(validateGearAssembly(s.transmission, s.joints, s.links)).toEqual([]);
      const a = s.joints.find((j) => j.id === 'A')!,
        e = s.joints.find((j) => j.id === 'E')!;
      expect([a.x, a.y]).toEqual([e.x, e.y]);
      expect(s.mechanisms[0].gearDrive!.periodTurns).toBe(12);
      expect(s.mechanisms[0].cyclePeriod).toBeCloseTo(12, 8);
    }
    expect(s.gears[0].module).toBeCloseTo(20, 9);
  });

  it('uses normal speed and gear history without merging the coaxial hosts', () => {
    const s = TestBed.inject(MechanismService),
      history = TestBed.inject(SaveHistoryService),
      first = encode();
    s.setDriveSpeed(s.joints[0] as RealJoint, -30);
    s.updateMechanism(true);
    expect(s.mechanisms[0].cyclePeriod).toBeCloseTo(24, 9);
    history.undo();
    expect(encode()).toBe(first);
    history.redo();
    expect(s.mechanisms[0].cyclePeriod).toBeCloseTo(24, 9);
    history.undo();
    TestBed.inject(GearEditorService).removeGear('GD');
    expect(s.gears).toHaveLength(3);
    expect(s.links.map((l) => l.id)).toContain('EF');
    expect(s.gearMeshes).toHaveLength(1);
    history.undo();
    expect(encode()).toBe(first);
    history.redo();
    expect(s.gears).toHaveLength(3);
    history.undo();
    expect(encode()).toBe(first);
  });

  it('explains the two mesh stages, shared shaft and compiler-owned overall ratio', () => {
    const s = TestBed.inject(MechanismService),
      explain = TestBed.inject(SolverExplanationService);
    const text = explain.gearDerivation(s.mechanisms[0]).join('\n');
    expect(text).toContain('-12/48 = -1/4');
    expect(text).toContain('-15/45 = -1/3');
    expect(text).toContain('Same shaft CD: Intermediate B and Intermediate C');
    expect(text).toContain('Hour D / Minute A: (-1/4) × (-1/3) = +1/12. Same rotation direction');
    expect(explain.gearsAt(s.mechanisms[0], 4320).map((g) => g.ratio)).toEqual([
      '1/1',
      '-1/4',
      '-1/4',
      '1/12',
    ]);
  });

  it('explains the same input route when mesh endpoints are authored in reverse order', () => {
    const m = TestBed.inject(MechanismService).mechanisms[0];
    const reversed = {
      ...m.transmission,
      meshes: m.transmission.meshes.map((mesh) => ({
        ...mesh,
        gearAId: mesh.gearBId,
        gearBId: mesh.gearAId,
      })),
    };
    const text = gearDerivation(reversed, m.gearDrive).join('\n');
    expect(text).toContain('Hour D / Minute A: (-1/4) \u00d7 (-1/3) = +1/12');
    expect(gearDerivation(reversed, undefined)).toEqual([]);
  });

  it('matches ordinary hand angular rates and all gear table/CSV/XLSX endpoint values', () => {
    const s = TestBed.inject(MechanismService),
      m = s.mechanisms[0],
      sampler = TestBed.inject(AnalysisSampleService);
    const flow = TestBed.inject(ExportFlowService),
      tables = TestBed.inject(ExportTableService);
    for (const step of [0, 360, 1080, 2160, 4320]) {
      for (const [link, gear] of [
        ['AB', 'GA'],
        ['EF', 'GD'],
      ]) {
        for (const kind of ['Vel', 'Acc']) {
          expect(
            sampler.sampleAt(m, step, 'kinematic', '', 'Angular Link ' + kind, link)[0]
          ).toBeCloseTo(
            sampler.sampleAt(m, step, 'kinematic', '', 'Angular Gear ' + kind, gear)[0],
            10
          );
        }
      }
    }
    for (const part of flow.offeredParts().filter((p) => p.kind === 'gear')) {
      flow.reset();
      flow.togglePart(part);
      for (const unit of [AngleUnit.DEGREE, AngleUnit.RADIAN]) {
        TestBed.inject(SettingsService).angleUnit.next(unit);
        const table = tables.tables()[0],
          factor = unit === AngleUnit.DEGREE ? 180 / Math.PI : 1;
        const expected = GEAR_QUANTITIES.map(
          ({ property }) =>
            sampler.sampleAt(m, 4320, 'kinematic', '', property, part.id)[0] * factor
        );
        expect(table.columns.map((c) => c.at(-1))).toEqual(expected);
        expect(
          toCsv(table, 'full').trim().split('\n').at(-1)!.split(',').slice(1).map(Number)
        ).toEqual(expected);
        const xml = new TextDecoder().decode(toXlsx([table], 'full'));
        expected.forEach((v) => expect(xml).toContain(`<v>${v}</v>`));
      }
    }
  });

  it('records solve, complete analysis and export costs without changing sample limits', () => {
    const start = performance.now(),
      { mechanism } = buildMechanism(MECHANICAL_CLOCK);
    const solveMs = performance.now() - start;
    const flow = TestBed.inject(ExportFlowService),
      tables = TestBed.inject(ExportTableService);
    flow.reset();
    flow
      .offeredParts()
      .filter((p) => p.kind === 'gear')
      .forEach((p) => flow.togglePart(p));
    const analysisStart = performance.now(),
      result = tables.tables(),
      analysisMs = performance.now() - analysisStart;
    const csvStart = performance.now(),
      csvBytes = result.map((t) => new TextEncoder().encode(toCsv(t, 'full')).length),
      csvMs = performance.now() - csvStart;
    const xlsxStart = performance.now(),
      workbook = toXlsx(result, 'full'),
      xlsxMs = performance.now() - xlsxStart;
    expect(mechanism.joints).toHaveLength(4321);
    expect(result.flatMap((t) => t.columns).every((c) => c.every(Number.isFinite))).toBe(true);
    mkdirSync('artifacts/clock', { recursive: true });
    writeFileSync(
      'artifacts/clock/performance.json',
      JSON.stringify(
        {
          samples: mechanism.joints.length,
          solveMs,
          analysisMs,
          csvMs,
          csvBytes,
          xlsxMs,
          xlsxBytes: workbook.length,
        },
        null,
        2
      )
    );
  });
});
