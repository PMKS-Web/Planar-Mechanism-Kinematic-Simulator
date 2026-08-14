import { RealJoint } from '../model/joint';
import { ForceUnit } from '../model/unit-enums';
import { SelectedTabService, TabID } from '../selected-tab.service';
import { AnalysisExportService } from './analysis-export.service';
import { AnalysisSampleService } from './analysis-sample.service';
import { buildMechanismFixture, MechanismFixture } from '../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { ActiveObjService } from './active-obj.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { withTestInjector } from '../../test-utils/mechanism-harness';

/** The tab service, reduced to the one question the exporter asks of it. */
function tabsOn(tab: TabID): SelectedTabService {
  return {
    getCurrentTab: () => tab,
    isAnalysisMode: () => tab === TabID.ANALYZE || tab === TabID.FORCE,
  } as unknown as SelectedTabService;
}

function exporterFor(fixture: MechanismFixture, tab: TabID): AnalysisExportService {
  return withTestInjector(
    [
      { provide: MechanismService, useValue: fixture.service },
      { provide: ActiveObjService, useValue: fixture.active },
      { provide: SettingsService, useValue: fixture.settings },
      { provide: AnalysisSampleService, deps: [] },
      { provide: SelectedTabService, useValue: tabsOn(tab) },
    ],
    () => new AnalysisExportService()
  );
}

/** A joint the linkage actually moves, which is what has graphs worth reading. */
function freeJoint(fixture: MechanismFixture): RealJoint {
  return fixture.service.joints.find(
    (joint): joint is RealJoint => joint instanceof RealJoint && !joint.ground
  )!;
}

/** The CSV, as a header row and the rows under it. */
function sheetOf(service: AnalysisExportService): { head: string[]; rows: string[][] } {
  const written: string[] = [];
  const anchor = {
    setAttribute: (_: string, value: string) => written.push(value),
    click: () => {},
    remove: () => {},
  };
  const create = vi
    .spyOn(document, 'createElement')
    .mockReturnValue(anchor as unknown as HTMLElement);
  const append = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
  service.download();
  create.mockRestore();
  append.mockRestore();

  const href = written.find((value) => value.startsWith('data:text/csv'));
  const csv = decodeURI(href!).replace('data:text/csv;charset=utf-8,', '');
  const lines = csv.trim().split('\n');
  return { head: lines[0].split(','), rows: lines.slice(1).map((line) => line.split(',')) };
}

describe('AnalysisExportService', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  it('writes one row per solved sample, on the mechanism’s own clock', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const joint = freeJoint(fixture);
    fixture.active.updateSelectedObj(joint);

    const sheet = sheetOf(exporterFor(fixture, TabID.ANALYZE));
    expect(sheet.rows).toHaveLength(fixture.mechanism.timeNum.length);
    sheet.rows.forEach((row, index) => {
      expect(Number(row[0])).toBeCloseTo(fixture.mechanism.timeNum[index], 12);
    });
  });

  it('gives a joint its position, velocity and acceleration in one sheet', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    fixture.active.updateSelectedObj(freeJoint(fixture));

    const { head } = sheetOf(exporterFor(fixture, TabID.ANALYZE));
    expect(head[0]).toBe('Time (seconds)');
    // Two components for position, three for the rates, which carry a magnitude.
    expect(head).toHaveLength(1 + 2 + 3 + 3);
    expect(head).toContain('Position X (cm)');
    expect(head).toContain('Velocity Mag (cm/s)');
    expect(head).toContain('Acceleration Y (cm/s^2)');
  });

  it('names the force columns in the unit the reader picked', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const input = fixture.service.joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    )!;
    fixture.active.updateSelectedObj(input);
    fixture.settings.forceUnit.next(ForceUnit.LBF);

    const { head } = sheetOf(exporterFor(fixture, TabID.FORCE));
    expect(head.some((column) => column.includes('(lbf)'))).toBe(true);
    expect(
      head.some((column) => column.includes('Input Torque') && column.includes('lbf.in'))
    ).toBe(true);
  });

  it('has nothing to export with nothing selected, or outside an analysis mode', () => {
    const fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    expect(exporterFor(fixture, TabID.ANALYZE).canExport()).toBe(false);

    fixture.active.updateSelectedObj(freeJoint(fixture));
    expect(exporterFor(fixture, TabID.ANALYZE).canExport()).toBe(true);
    expect(exporterFor(fixture, TabID.EDIT).canExport()).toBe(false);
  });
});
