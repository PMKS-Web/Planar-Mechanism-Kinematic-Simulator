import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { SettingsService } from '../../app/services/settings.service';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { SolverExplanationService } from '../../app/services/solver-explanation.service';
import { ExportFlowService } from '../../app/services/export/export-flow.service';
import { ExportTableService } from '../../app/services/export/export-table.service';
import { toCsv } from '../../app/services/export/csv-writer';
import { toXlsx } from '../../app/services/export/xlsx-writer';
import { mechanismSvg } from '../../app/services/export/mechanism-svg';
import { AngleUnit } from '../../app/model/unit-enums';
import { GEAR_QUANTITIES } from '../../app/model/gear-analysis';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { COMPOUND_GEAR_FOUR_BAR } from '../../test-utils/verification/compound-gear-fixtures';

describe('compound results across analysis, worksheet and file writers', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(
      fixturePayload(COMPOUND_GEAR_FOUR_BAR),
      false,
      true,
      false
    );
  });
  afterEach(() => TestBed.inject(MechanismService).animate(0, false));

  it('keeps individual gear identities with identical B/C series and a continuous six-turn endpoint', () => {
    const m = TestBed.inject(MechanismService).mechanisms[0];
    const samples = TestBed.inject(AnalysisSampleService);
    for (let step = 0; step < m.joints.length; step++) {
      for (const { property } of GEAR_QUANTITIES) {
        expect(samples.sampleAt(m, step, 'kinematic', '', property, 'GB')).toEqual(
          samples.sampleAt(m, step, 'kinematic', '', property, 'GC')
        );
      }
    }
    const end = m.joints.length - 1;
    const rows = TestBed.inject(SolverExplanationService).gearsAt(m, end);
    expect(rows.map((r) => r.id)).toEqual(['GA', 'GB', 'GC', 'GD']);
    expect(rows.map((r) => r.ratio)).toEqual(['1/1', '-1/2', '-1/2', '1/6']);
    for (const row of rows) {
      expect(row.angle).toBe(
        samples.sampleAt(m, end, 'kinematic', '', 'Angular Gear Pos', row.id)[0]
      );
      expect(row.alpha).toBeCloseTo(
        samples.sampleAt(m, end, 'kinematic', '', 'Angular Gear Acc', row.id)[0],
        12
      );
    }
    expect(Math.abs(m.gearTravel[end])).toBeCloseTo(12 * Math.PI, 9);
    expect(
      Math.abs(samples.sampleAt(m, end, 'kinematic', '', 'Angular Gear Travel', 'GD')[0])
    ).toBeCloseTo(2 * Math.PI, 9);
  });

  it('offers four separate gear exports and preserves endpoint values in degrees and radians', () => {
    const flow = TestBed.inject(ExportFlowService),
      tables = TestBed.inject(ExportTableService);
    const m = TestBed.inject(MechanismService).mechanisms[0],
      end = m.joints.length - 1;
    const parts = flow.offeredParts().filter((p) => p.kind === 'gear');
    expect(parts.map((p) => p.id)).toEqual(['GA', 'GB', 'GC', 'GD']);
    for (const part of parts) {
      flow.reset();
      flow.togglePart(part);
      for (const unit of [AngleUnit.DEGREE, AngleUnit.RADIAN]) {
        TestBed.inject(SettingsService).angleUnit.next(unit);
        const table = tables.tables()[0];
        const factor = unit === AngleUnit.DEGREE ? 180 / Math.PI : 1;
        const expected = GEAR_QUANTITIES.map(
          ({ property }) =>
            TestBed.inject(AnalysisSampleService).sampleAt(
              m,
              end,
              'kinematic',
              '',
              property,
              part.id
            )[0] * factor
        );
        expect(table.columns.map((column) => column.at(-1))).toEqual(expected);
        const csv = toCsv(table, 'full').trim().split('\n').at(-1)!.split(',').slice(1).map(Number);
        expect(csv).toEqual(expected);
        const xml = new TextDecoder().decode(toXlsx([table], 'full'));
        expected.forEach((value) => expect(xml).toContain(`<v>${value}</v>`));
      }
    }
  });

  it('labels both concentric attachments and their axial planes in report fallback SVG', () => {
    const m = TestBed.inject(MechanismService).mechanisms[0];
    const svg = mechanismSvg(m.joints[0], m.links[0], 660, 460, m.transmission);
    expect(svg.match(/data-gear-id=/g)).toHaveLength(4);
    expect(svg).toContain('40T · P1');
    expect(svg).toContain('10T · P2');
    expect(svg).not.toContain('NaN');
  });
});
