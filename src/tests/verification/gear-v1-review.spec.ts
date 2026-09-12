import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { MechanismService } from '../../app/services/mechanism.service';
import { GearEditorService } from '../../app/services/gear-editor.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { UrlGenerationService } from '../../app/services/url-generation.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { SelectionBatchService } from '../../app/services/selection-batch.service';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { ExportFlowService } from '../../app/services/export/export-flow.service';
import { ExportTableService } from '../../app/services/export/export-table.service';
import { encodeGearDocument } from '../../app/services/transcoding/gear-codec';
import { GEAR_PAIR } from '../../test-utils/verification/gear-fixtures';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { Coord } from '../../app/model/coord';
import { MODEL_SCALE as S } from '../../app/model/render-scale';

function services() {
  return {
    s: TestBed.inject(MechanismService),
    editor: TestBed.inject(GearEditorService),
    urls: TestBed.inject(UrlProcessorService),
    encode: () => TestBed.inject(UrlGenerationService).generateUrlQuery(),
    history: TestBed.inject(SaveHistoryService),
    batch: TestBed.inject(SelectionBatchService),
  };
}
type Harness = ReturnType<typeof services>;

describe('isolated V1 engineering review', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    TestBed.inject(UrlProcessorService).updateFromURL(
      TEMPLATE_LINKAGES.Simple_Gear_Pair,
      false,
      true,
      true
    );
  });
  afterEach(() => {
    TestBed.inject(MechanismService).isPlaying = false;
    vi.restoreAllMocks();
  });

  const operations: [string, (h: Harness) => void][] = [
    ['delete gear', ({ s, editor }) => editor.removeGear(s.gears[1].id)],
    ['delete mesh', ({ s, editor }) => editor.removeMesh(s.gearMeshes[0].id)],
    [
      'delete center',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(
          s.joints.find((j) => j.id === s.gears[1].centerJointId)
        );
        s.deleteJoint();
      },
    ],
    [
      'delete reference',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(
          s.joints.find((j) => j.id === s.gears[1].referenceJointId)
        );
        s.deleteJoint();
      },
    ],
    [
      'delete host',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(s.links.find((l) => l.id === s.gears[1].hostLinkId));
        s.deleteLink();
      },
    ],
    ['delete complete mechanism', ({ s }) => s.deleteMechanism(0)],
    [
      'add tracer and rename host',
      ({ s }) => {
        s.activeObjService.updateSelectedObj(s.links[1]);
        s.addJointAt(new Coord(S, S));
      },
    ],
    [
      'duplicate complete train',
      ({ s, batch }) => {
        expect(
          batch.duplicateSelected(
            s.links.map((l) => ({ kind: 'link' as const, id: l.id })),
            { x: 0, y: 8 * S }
          ).ok
        ).toBe(true);
      },
    ],
    [
      'duplicate partial train',
      ({ s, batch }) => {
        expect(
          batch.duplicateSelected([{ kind: 'link', id: s.links[1].id }], { x: 0, y: 8 * S }).ok
        ).toBe(true);
      },
    ],
  ];
  for (const [name, operate] of operations) {
    it(`restores authored identity and geometry through undo/redo after ${name}`, () => {
      const h = services();
      if (name.startsWith('duplicate'))
        h.urls.updateFromURL(TEMPLATE_LINKAGES.Idler_Gear_Train, false, true, true);
      const before = h.encode();
      operate(h);
      const after = h.encode();
      expect(after).not.toBe(before);
      h.history.undo();
      expect(h.encode()).toBe(before);
      h.history.redo();
      expect(h.encode()).toBe(after);
      h.history.undo();
      expect(h.s.mechanisms[0].isMechanismValid()).toBe(true);
    });
  }

  it('restores tracer removal and its host remapping with real history', () => {
    const h = services();
    h.s.activeObjService.updateSelectedObj(h.s.links[1]);
    h.s.addJointAt(new Coord(S, S));
    const withTracer = h.encode();
    h.s.activeObjService.updateSelectedObj(h.s.joints.at(-1));
    h.s.deleteJoint();
    const without = h.encode();
    expect(h.s.gearMeshes).toHaveLength(1);
    h.history.undo();
    expect(h.encode()).toBe(withTracer);
    h.history.redo();
    expect(h.encode()).toBe(without);
  });

  it('keeps independent clocks, sampled values and force capabilities after reload', () => {
    const h = services();
    const other = buildMechanism({
      joints: [
        { id: 'X', x: 2000, y: 0, ground: true, input: true },
        { id: 'Y', x: 2200, y: 0 },
      ],
      links: [{ joints: 'XY' }],
      inputAngVel: Math.PI,
    });
    h.s.joints.push(...other.joints);
    h.s.links.push(...other.links);
    h.s.updateMechanism(true);
    const saved = h.encode();
    h.urls.updateFromURL(saved, false, true, true);
    expect(h.encode()).toBe(saved);
    expect(h.s.mechanisms).toHaveLength(2);
    const gi = h.s.mechanisms.findIndex((m) => m.transmission.gears.length),
      oi = 1 - gi;
    const geared = h.s.mechanisms[gi],
      ordinary = h.s.mechanisms[oi];
    h.s.seekMechanismTo(gi, 1);
    const end = h.s.currentSampleOf(gi);
    h.s.seekMechanismTo(oi, 0.25);
    expect(h.s.currentSampleOf(gi)).toBe(end);
    expect(end).toBe(geared.joints.length - 1);
    const sampler = TestBed.inject(AnalysisSampleService),
      gear = h.s.gears[1];
    const travel = () =>
      sampler.sampleAt(geared, end, 'kinematic', '', 'Angular Gear Travel', gear.id);
    const value = travel();
    sampler.sampleAt(ordinary, h.s.currentSampleOf(oi), 'kinematic', '', 'Angular Link Vel', 'XY');
    expect(travel()).toEqual(value);
    expect(Math.abs(value[0])).toBeCloseTo(2 * Math.PI, 8);
    expect(geared.getForceAnalysis('static').successfulFrames).toBe(0);
    expect(ordinary.getForceAnalysis('static').successfulFrames).toBeGreaterThan(0);
    const flow = TestBed.inject(ExportFlowService);
    flow.reset();
    flow.setParts(flow.offeredParts(), true);
    const forceColumns = flow.columnGroups('forces').flatMap((g) => g.columns);
    expect(forceColumns.length).toBeGreaterThan(0);
    const ordinaryKeys = new Set(
      flow
        .selectedParts()
        .filter((p) => p.mechanismIndex === oi)
        .map((p) => p.key)
    );
    expect(forceColumns.every((c) => c.appliesTo.every((key) => ordinaryKeys.has(key)))).toBe(true);
    const tables = TestBed.inject(ExportTableService).tables();
    expect(new Set(tables.map((t) => t.mechanismIndex)).size).toBe(2);
    expect(tables.every((t) => t.columns.every((c) => c.every(Number.isFinite)))).toBe(true);
  });

  it('encodes gear records independently of locale collation', () => {
    const assembly = {
      gears: GEAR_PAIR.transmission.gears.map((g, i) => ({ ...g, id: i ? 'B' : 'a' })),
      meshes: [],
    };
    const before = encodeGearDocument(assembly, []);
    vi.spyOn(String.prototype, 'localeCompare').mockReturnValue(-1);
    expect(encodeGearDocument(assembly, [])).toEqual(before);
  });
});
