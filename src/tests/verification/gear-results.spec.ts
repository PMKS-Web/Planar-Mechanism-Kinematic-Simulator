import { TestBed } from '@angular/core/testing';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { SettingsService } from '../../app/services/settings.service';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { ExportFlowService } from '../../app/services/export/export-flow.service';
import { ExportTableService } from '../../app/services/export/export-table.service';
import { toCsv } from '../../app/services/export/csv-writer';
import { toXlsx } from '../../app/services/export/xlsx-writer';
import { mechanismSvg } from '../../app/services/export/mechanism-svg';
import { AngleUnit } from '../../app/model/unit-enums';
import { Checksum } from '../../app/services/transcoding/checksum';

describe('gear results and atomic production loading', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(
      TEMPLATE_LINKAGES.Simple_Gear_Pair,
      false,
      true,
      false
    );
  });
  afterEach(() => {
    const s = TestBed.inject(MechanismService);
    s.isPlaying = false;
    s.animate(0, false);
  });
  it('uses the same continuous numbers in tables, CSV and XLSX in degrees and radians', () => {
    const flow = TestBed.inject(ExportFlowService),
      tables = TestBed.inject(ExportTableService),
      s = TestBed.inject(MechanismService),
      settings = TestBed.inject(SettingsService);
    flow.reset();
    const gear = flow.offeredParts().filter((p) => p.kind === 'gear')[1];
    expect(gear.available).toBe(true);
    flow.togglePart(gear);
    for (const unit of [AngleUnit.DEGREE, AngleUnit.RADIAN]) {
      settings.angleUnit.next(unit);
      const table = tables.tables()[0];
      expect(table.columns).toHaveLength(4);
      const conversion = unit === AngleUnit.DEGREE ? 180 / Math.PI : 1;
      const sample = s.mechanisms[0].joints.length - 1;
      const values = [
        'Angular Gear Pos',
        'Angular Gear Travel',
        'Angular Gear Vel',
        'Angular Gear Acc',
      ].map(
        (prop) =>
          TestBed.inject(AnalysisSampleService).sampleAt(
            s.mechanisms[0],
            sample,
            'kinematic',
            '',
            prop,
            gear.id
          )[0] * conversion
      );
      table.columns.forEach((column, i) => expect(column.at(-1)).toBeCloseTo(values[i], 9));
      const last = toCsv(table, 'full').trim().split('\n').at(-1)!.split(',').slice(1).map(Number);
      expect(last).toEqual(table.columns.map((c) => c.at(-1)));
      const xml = new TextDecoder().decode(toXlsx([table], 'full'));
      values.forEach((value) => expect(xml).toContain(`<v>${value}</v>`));
      expect(Math.abs(values[1])).toBeCloseTo(unit === AngleUnit.DEGREE ? 360 : 2 * Math.PI, 8);
    }
  });
  it('includes pitch circles beyond short reference arms in the report fallback', () => {
    const m = TestBed.inject(MechanismService).mechanisms[0];
    const svg = mechanismSvg(m.joints[0], m.links[0], 330, 230, m.transmission);
    expect(svg).toContain('data-gear-id=');
    expect(svg).toContain('40T');
    expect(svg).not.toContain('NaN');
  });
  it('rejects a malformed incoming extension without changing a paused drawing, units or selection', () => {
    const s = TestBed.inject(MechanismService),
      urls = TestBed.inject(UrlProcessorService);
    s.animate(183, false);
    s.activeObjService.selectGear(s.gears[1].id);
    const pose = s.joints.map((j) => [j.id, j.x, j.y]),
      before = TestBed.inject(UrlGenerationService).generateUrlQuery();
    const bad = new Checksum().stamp(
      new Checksum().strip(TEMPLATE_LINKAGES.Simple_Gear_Pair).replace('G1~', 'G99~')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    urls.updateFromURL(bad, false, true, false);
    expect(s.joints.map((j) => [j.id, j.x, j.y])).toEqual(pose);
    expect(s.activeObjService.selectedGearId).toBe(s.gears[1].id);
    expect(TestBed.inject(UrlGenerationService).generateUrlQuery()).toBe(before);
  });
});
