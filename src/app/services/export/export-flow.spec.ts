import { inject } from '@angular/core';
import { RealJoint } from '../../model/joint';
import { ForceUnit } from '../../model/unit-enums';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ActiveObjService } from '../active-obj.service';
import { AnalysisSampleService } from '../analysis-sample.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { withTestInjector } from '../../../test-utils/mechanism-harness';
import {
  buildMechanismFixture,
  LEGACY_FORCE_MECHANISM,
  MechanismFixture,
} from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { ExportCatalogService } from './export-catalog.service';
import { ExportFlowService } from './export-flow.service';
import { ExportTableService, ExportTable } from './export-table.service';
import { toCsv } from './csv-writer';
import { toXlsx } from './xlsx-writer';
import { plotSvg } from './graph-svg';
import { reportHtml } from './report-html';
import { crc32 } from './zip';

/** The drawer's three services, over one fixture's mechanism. */
interface Flow {
  flow: ExportFlowService;
  tables: ExportTableService;
  fixture: MechanismFixture;
}

function flowFor(payload: string, options: { forces?: boolean } = {}): Flow {
  const fixture = buildMechanismFixture(payload);
  // The stub service the fixtures build is the panels' one; these three
  // questions are the export drawer's own, so they are answered here rather
  // than added to every panel's fixture.
  Object.assign(fixture.service, {
    readinessOfEachMechanism: () => [
      {
        id: 'M1',
        ready: true,
        checks: [],
        facts: [{ label: 'Input speed', value: '20.00 RPM CW' }],
      },
    ],
    sliderFor: () => undefined,
    forceAnalysisReady: () => options.forces === true,
  });

  const built = withTestInjector(
    [
      { provide: MechanismService, useValue: fixture.service },
      { provide: ActiveObjService, useValue: fixture.active },
      { provide: SettingsService, useValue: fixture.settings },
      {
        provide: SelectedTabService,
        useValue: {
          getCurrentTab: () => (options.forces ? TabID.FORCE : TabID.ANALYZE),
          isAnalysisMode: () => true,
        } as unknown as SelectedTabService,
      },
      { provide: AnalysisSampleService, deps: [] },
      { provide: ExportCatalogService, deps: [] },
      { provide: ExportFlowService, deps: [] },
      { provide: ExportTableService, deps: [] },
    ],
    () => ({
      flow: inject(ExportFlowService),
      tables: inject(ExportTableService),
    })
  );
  built.flow.reset();
  return { ...built, fixture };
}

function pick(flow: ExportFlowService, ...labels: string[]): void {
  flow
    .partGroups()
    .flatMap((group) => group.parts)
    .filter((part) => labels.includes(part.label))
    .forEach((part) => flow.togglePart(part));
}

describe('the export drawer', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  it('lists every part of the mechanism, and refuses a grounded joint its kinematics', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    const parts = flow.partGroups().flatMap((group) => group.parts);
    expect(parts.map((part) => part.label)).toEqual([
      'Joint A',
      'Joint B',
      'Joint C',
      'Joint D',
      'Link AB',
      'Link BC',
      'Link CD',
    ]);
    const grounded = parts.find((part) => part.label === 'Joint D')!;
    expect(grounded.note).toContain('grounded');
    expect(grounded.available).toBe(false);
    expect(parts.find((part) => part.label === 'Joint B')!.available).toBe(true);
  });

  it('offers a grounded joint once force analysis is set up, for its reaction', () => {
    const { flow } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    const grounded = flow
      .partGroups()
      .flatMap((group) => group.parts)
      .find((part) => part.note.includes('grounded'))!;
    expect(grounded.available).toBe(true);
    expect(flow.forcesAvailable()).toBe(true);
  });

  it('asks about the quantities the chosen parts turn out to have', () => {
    const { flow } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    expect(flow.columnGroups('kinematics').map((group) => group.title)).toEqual(['Joint B']);

    pick(flow, 'Joint C', 'Link AB');
    const groups = flow.columnGroups('kinematics');
    expect(groups.map((group) => group.title)).toEqual(['Joints B, C', 'Link AB']);
    expect(groups[0].columns.map((column) => column.label)).toEqual([
      'Position',
      'Velocity',
      'Acceleration',
    ]);
    expect(groups[1].columns.map((column) => column.label)).toContain('Centre of mass');
  });

  it('writes one row per solved sample, on the mechanism’s own clock', () => {
    const { flow, tables, fixture } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    const [table] = tables.tables();
    expect(table.times).toHaveLength(fixture.mechanism.timeNum.length);
    table.times.forEach((time, at) => expect(time).toBeCloseTo(fixture.mechanism.timeNum[at], 12));
    expect(table.columns.every((column) => column.length === table.times.length)).toBe(true);
  });

  it('heads a column with the quantity, the part, the component and the unit', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Link AB');
    const [table] = tables.tables();
    expect(table.heads[0]).toBe('Time (s)');
    expect(table.heads).toContain('Position B X (cm)');
    expect(table.heads).toContain('Velocity B Mag (cm/s)');
    expect(table.heads).toContain('Angle AB (deg)');
  });

  it('drops the magnitude series when the reader asks for X and Y alone', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    const withMag = tables.tables()[0].heads.length;
    flow.withMagnitude = false;
    const without = tables.tables()[0].heads;
    expect(without.some((head) => head.includes('Mag'))).toBe(false);
    // Velocity and acceleration each lose one; position never had one.
    expect(without.length).toBe(withMag - 2);
  });

  it('rounds every number to the digits the reader chose', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    flow.decimals = 2;
    const csv = toCsv(tables.tables()[0], flow.decimals);
    const cells = csv.split('\n')[1].split(',');
    cells.filter(Boolean).forEach((cell) => {
      expect((cell.split('.')[1] ?? '').length).toBeLessThanOrEqual(2);
    });
  });

  it('splits a file per part when asked, and one per machine at the very least', () => {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B', 'Joint C');
    expect(tables.tables()).toHaveLength(1);
    flow.splitPerPart = true;
    const split = tables.tables();
    expect(split).toHaveLength(2);
    expect(split.map((table) => table.name)).toEqual(['M1_JointB', 'M1_JointC']);
  });

  it('heads a force column with the analysis it came from, in the reader’s unit', () => {
    const { flow, tables, fixture } = flowFor(LEGACY_FORCE_MECHANISM, { forces: true });
    fixture.settings.forceUnit.next(ForceUnit.LBF);
    flow.refresh();
    const input = flow
      .partGroups()
      .flatMap((group) => group.parts)
      .find((part) => (part.part as RealJoint).input)!;
    flow.togglePart(input);
    flow.tab = 'forces';

    const heads = tables.tables()[0].heads;
    expect(heads.some((head) => head.startsWith('Static force at'))).toBe(true);
    expect(heads.some((head) => head.includes('input torque') && head.includes('(lbf·in)'))).toBe(
      true
    );
  });
});

describe('what the export is written as', () => {
  beforeAll(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => vi.restoreAllMocks());

  function sample(): { flow: ExportFlowService; table: ExportTable } {
    const { flow, tables } = flowFor(TEMPLATE_LINKAGES['4-Bar']);
    pick(flow, 'Joint B');
    return { flow, table: tables.tables()[0] };
  }

  it('quotes a CSV head that carries a comma', () => {
    const { flow, table } = sample();
    const doctored = { ...table, heads: ['Time (s)', 'Force at B, on AB X (N)'] } as ExportTable;
    expect(toCsv(doctored, flow.decimals).split('\n')[0]).toContain('"Force at B, on AB X (N)"');
  });

  it('writes a workbook a reader can open: one sheet per table, every part intact', () => {
    const { flow, table } = sample();
    const bytes = toXlsx([table, { ...table, name: 'M1_forces' }], flow.decimals);
    const entries = readZip(bytes);
    expect(entries.map((entry) => entry.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    entries.forEach((entry) => expect(crc32(entry.data)).toBe(entry.crc));
    const workbook = new TextDecoder().decode(entries[2].data);
    expect(workbook).toContain(`name="${table.name}"`);
    expect(workbook).toContain('name="M1_forces"');
    const sheet = new TextDecoder().decode(entries[4].data);
    expect(sheet).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Time (s)</t>');
    // One head row and one row per solved sample.
    expect(sheet.match(/<row /g)).toHaveLength(table.times.length + 1);
  });

  it('draws a graph with a line per series', () => {
    const { table } = sample();
    const plot = table.plots.find((candidate) => candidate.head.startsWith('Velocity'))!;
    const svg = plotSvg(plot, table.times, { width: 640, height: 360, standalone: true });
    expect(svg.match(/<polyline/g)).toHaveLength(plot.series.length);
    expect(svg).toContain(plot.title);
    expect(svg).toContain(`${table.times[table.times.length - 1].toFixed(2)} s`);
  });

  it('paginates the report, and prints the way back to the mechanism on every page', () => {
    const { flow, table } = sample();
    const rows = table.times.map((time) => [String(time), '1', '2']);
    const html = reportHtml({
      logoUrl: 'assets/PMKS_logo.png',
      sections: [
        {
          title: 'Kinematic analysis — M1',
          subtitle: '3 links · 20.00 RPM CW',
          dataTitle: 'Data — M1',
          graphsTitle: 'Graphs — M1',
          drawing: '<svg></svg>',
          facts: [{ label: 'Cycle', value: '3.00 s' }],
          shareUrl: 'https://app.pmksplus.com/?abc',
          plots: [],
          heads: ['Time (s)', 'Position B X (cm)', 'Position B Y (cm)'],
          rows,
          footer: 'M1 · 3 links',
        },
      ],
    });
    const pages = html.match(/<section class="page">/g) ?? [];
    // One first page, then a page per forty rows.
    expect(pages).toHaveLength(1 + Math.ceil(rows.length / 40));
    expect(html.match(/Page 1 of /g)).toHaveLength(1);
    expect(html).toContain(`Page ${pages.length} of ${pages.length}`);
    expect(html).toContain('https://app.pmksplus.com/?abc');
    expect(flow.extension()).toBe('.csv');
  });
});

/** Read back a stored zip: enough of the format to prove this one is well formed. */
function readZip(bytes: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: { name: string; data: Uint8Array; crc: number }[] = [];
  for (let n = 0; n < count; n++) {
    const nameLength = view.getUint16(at + 28, true);
    const size = view.getUint32(at + 24, true);
    const crc = view.getUint32(at + 16, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const localNameLength = view.getUint16(offset + 26, true);
    const extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLength + extra;
    entries.push({ name, crc, data: bytes.subarray(start, start + size) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return entries;
}
