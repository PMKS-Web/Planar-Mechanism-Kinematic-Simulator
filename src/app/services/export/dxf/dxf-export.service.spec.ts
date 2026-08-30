import '../../../model/joint';
import { TestBed } from '@angular/core/testing';
import DxfParser from 'dxf-parser';
import { BehaviorSubject } from 'rxjs';
import { RevJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { MechanismService } from '../../mechanism.service';
import { linkBodyWidth } from './link-bodies';
import { SettingsService } from '../../settings.service';
import {
  DEFAULT_DXF_EXPORT_OPTIONS,
  DxfExportService,
  NEUTRAL_DXF_OPTIONS,
} from './dxf-export.service';

describe('DxfExportService', () => {
  function setup() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2 * MODEL_SCALE, MODEL_SCALE);
    const link = new RealLink('AB', [a, b]);
    a.links.push(link);
    b.links.push(link);
    const mechanism = {
      joints: [a, b],
      links: [link],
      forces: [],
      encodeFromStartPose: vi.fn(<T>(run: (heldStep: number) => T): T => run(27)),
    };
    const settings = {
      lengthUnit: new BehaviorSubject(LengthUnit.METER),
      isInputCW: new BehaviorSubject(false),
    };
    TestBed.configureTestingModule({
      providers: [
        DxfExportService,
        { provide: MechanismService, useValue: mechanism },
        { provide: SettingsService, useValue: settings },
      ],
    });
    return { service: TestBed.inject(DxfExportService), mechanism };
  }

  it('exports the entire editable drawing through the start-pose boundary', () => {
    const { service, mechanism } = setup();

    // Without the companion file, so this is about the DXF and the boundary
    // rather than about how two files are packed; the zip has its own test.
    const file = service.create({ dataFile: 'none', linkBodies: 'centerlines' });
    const parsed = new DxfParser().parseSync(file.content);

    expect(mechanism.encodeFromStartPose).toHaveBeenCalledOnce();
    // The unit is in the name: R12 has no header field for it, and the import
    // dialog asks regardless -- so the answer is in front of the reader when
    // they are being asked.
    expect(file.name).toBe('mechanism (m).dxf');
    expect(file.mime).toBe('application/dxf;charset=utf-8');
    expect(file.blob.type).toBe(file.mime);
    expect(parsed?.header['$ACADVER']).toBe('AC1009');
    expect(parsed?.entities.some((entity) => entity.type === 'LINE')).toBe(true);
  });

  it('packs the companion table beside the drawing, and says which files those are', () => {
    const { service } = setup();

    const csv = service.create({ dataFile: 'csv' });
    expect(csv.name).toBe('mechanism.zip');
    expect(csv.mime).toBe('application/zip');
    // A README travels with it: DXF carries geometry and nothing else, and the
    // last stretch into a moving assembly is a handful of steps in whichever
    // program the reader opens next.
    expect(csv.parts).toEqual([
      'mechanism (m).dxf',
      'mechanism-joints.csv',
      'mechanism-links.csv',
      'README.txt',
    ]);
    // The DXF is still the content, whatever the delivery: everything that
    // reads a file from this service reads the drawing.
    expect(csv.content).toContain('AC1009');

    const json = service.create({ dataFile: 'json' });
    expect(json.parts).toEqual(['mechanism (m).dxf', 'mechanism.json', 'README.txt']);
  });

  it('publishes stable UI defaults and sanitizes the requested file name', () => {
    const { service } = setup();

    // The dialog opens on "Build parts", so that is what the service does when
    // it is told nothing: a layer per link, at the origin, holes, and every
    // decorative thing off -- annotations, dimensions and traced curves all
    // land in CAD as extra sketch geometry tangled into the faces the reader
    // is trying to select. The plain reading of the drawing is
    // `NEUTRAL_DXF_OPTIONS`, which is what the builder assumes.
    expect(DEFAULT_DXF_EXPORT_OPTIONS).toMatchObject({
      fileName: 'mechanism',
      origin: 'ground',
      jointCircles: 'holes',
      perLinkLayers: true,
      includeDimensions: false,
      includeKinematicAnnotations: false,
      includeTracedPaths: false,
      includeLabels: false,
      includeNotes: true,
      dataFile: 'csv',
    });
    expect(NEUTRAL_DXF_OPTIONS).toMatchObject({
      origin: 'model',
      jointCircles: 'marks',
      perLinkLayers: false,
      includeDimensions: false,
      dataFile: 'none',
    });
    // A data file means two files, so the download is a zip named for the stem.
    expect(service.create({ fileName: '  Lab / linkage.DXF  ' }).name).toBe('Lab_linkage.zip');
    expect(service.create({ fileName: '///', dataFile: 'none' }).name).toBe('mechanism (m).dxf');
  });

  it('draws each dimension as lines and a number, not as a DIMENSION entity', () => {
    const { service } = setup();
    const parsed = new DxfParser().parseSync(
      service.create({ dataFile: 'none', includeDimensions: true, dimensionStyle: 'entities' })
        .content
    )!;
    // A real DIMENSION would be worth its machinery -- an anonymous block
    // apiece, a DIMSTYLE table, a second entity shape -- only if an importer
    // turned it into something the reader could drive the model from. Fusion
    // and Onshape do not, so every reader gets the same lines and text.
    expect(parsed.entities.some((entity) => entity.type === 'DIMENSION')).toBe(false);
    expect(Object.keys(parsed.blocks ?? {})).toHaveLength(0);
    const drawn = parsed.entities.filter(
      (entity) => (entity as { layer?: string }).layer === 'PMKS_DIMENSIONS'
    );
    expect(drawn.filter((entity) => entity.type === 'LINE').length).toBeGreaterThanOrEqual(3);
    const label = drawn.find((entity) => entity.type === 'TEXT') as unknown as { text: string };
    expect(label.text).toMatch(/^[\d.]+ m$/);
  });

  it('stands the dimension line off square to what it measures', () => {
    const { service, mechanism } = setup();
    // Straight up from the origin: the case a fixed drop in Y gets wrong, by
    // laying the dimension along the very centreline it is dimensioning.
    mechanism.joints[1].x = 0;
    mechanism.joints[1].y = 2 * MODEL_SCALE;
    const parsed = new DxfParser().parseSync(
      service.create({ dataFile: 'none', includeDimensions: true, dimensionStyle: 'entities' })
        .content
    )!;
    const drawn = parsed.entities
      .filter((entity) => (entity as { layer?: string }).layer === 'PMKS_DIMENSIONS')
      .filter((entity) => entity.type === 'LINE') as unknown as {
      vertices: { x: number; y: number }[];
    }[];
    expect(drawn.length).toBeGreaterThan(0);
    // Every part of the picture is off the line the link lies on.
    expect(drawn.some((line) => line.vertices.some((point) => Math.abs(point.x) > 1e-6))).toBe(
      true
    );
  });

  it('converts the geometry into the unit it names in the file', () => {
    const { service } = setup();
    const lengthIn = (unit: 'mm' | 'cm' | 'm' | 'in' | undefined) => {
      const file = service.create({ dataFile: 'none', unit, linkBodies: 'centerlines' });
      const parsed = new DxfParser().parseSync(file.content)!;
      const ends = parsed.entities
        .filter((entity) => entity.type === 'LINE')
        .map((entity) => (entity as unknown as { vertices: { x: number; y: number }[] }).vertices)
        .map(([from, to]) => Math.hypot(to.x - from.x, to.y - from.y));
      return { name: file.name, span: Math.max(...ends) };
    };
    // The same 2cm-by-1cm link, asked for three ways. Saying metres and then
    // writing centimetres hands CAD a mechanism a hundred times too big under
    // a label that looks right -- and R12 has no header field to say which, so
    // the name is where the answer lives.
    const centimetres = lengthIn('cm');
    expect(centimetres.name).toBe('mechanism (cm).dxf');
    expect(centimetres.span).toBeCloseTo(Math.hypot(2, 1), 6);

    const metres = lengthIn('m');
    expect(metres.name).toBe('mechanism (m).dxf');
    expect(metres.span).toBeCloseTo(Math.hypot(2, 1) / 100, 6);

    const inches = lengthIn('in');
    expect(inches.name).toBe('mechanism (in).dxf');
    expect(inches.span).toBeCloseTo(Math.hypot(2, 1) / 2.54, 6);

    // Millimetres, which is what a CAD importer defaults to and what a drawing
    // is dimensioned in. It belongs to the export rather than to the project:
    // the app has no millimetre, and giving it one would reach into the mass
    // and inertia units that pair with each length.
    const millimetres = lengthIn('mm');
    expect(millimetres.name).toBe('mechanism (mm).dxf');
    expect(millimetres.span).toBeCloseTo(Math.hypot(2, 1) * 10, 6);
  });

  it('puts the notes under the drawing, wherever the drawing turned out to be', () => {
    const { service } = setup();
    // Placed at a fixed offset from the origin they landed in the middle of
    // it: the origin is wherever the reader moved it to and the mechanism is
    // wherever it was drawn, and the two have nothing to do with each other.
    const parsed = new DxfParser().parseSync(
      service.create({ dataFile: 'none', includeNotes: true }).content
    )!;
    const notes = parsed.entities.filter(
      (entity) => (entity as { layer?: string }).layer === 'PMKS_NOTES'
    ) as unknown as { startPoint: { x: number; y: number } }[];
    expect(notes.length).toBeGreaterThan(0);
    const drawing = parsed.entities
      .filter((entity) => (entity as { layer?: string }).layer !== 'PMKS_NOTES')
      .flatMap((entity) => {
        const parts = entity as unknown as {
          vertices?: { y: number }[];
          center?: { y: number };
          radius?: number;
        };
        if (parts.center) return [parts.center.y - (parts.radius ?? 0)];
        return (parts.vertices ?? []).map((vertex) => vertex.y);
      });
    const lowest = Math.min(...drawing);
    notes.forEach((note) => expect(note.startPoint.y).toBeLessThan(lowest));
  });

  it('draws each link as a closed outline with its holes already in it', () => {
    const { service } = setup();
    const parsed = new DxfParser().parseSync(service.create({ dataFile: 'none' }).content)!;
    const body = parsed.entities.find((entity) => entity.type === 'POLYLINE') as unknown as {
      layer: string;
      shape: boolean;
      vertices: { x: number; y: number; bulge?: number }[];
    };
    // A centreline cannot be extruded. This is the same rounded bar the canvas
    // draws, closed, so CAD has a face to pick.
    expect(body).toBeDefined();
    expect(body.shape).toBe(true);
    expect(body.layer).toBe('PMKS_LINK_AB');
    expect(body.vertices.some((vertex) => (vertex.bulge ?? 0) !== 0)).toBe(true);
    // The holes are on the part's own layer, not a shared one: a face with its
    // holes in it extrudes into a finished body in one step.
    const holes = parsed.entities.filter(
      (entity) =>
        entity.type === 'CIRCLE' && (entity as { layer?: string }).layer === 'PMKS_LINK_AB'
    );
    expect(holes).toHaveLength(2);
    // And the shared joint layer does not cut them a second time.
    expect(
      parsed.entities.filter(
        (entity) => (entity as { layer?: string }).layer === 'PMKS_JOINT_CENTERS'
      )
    ).toHaveLength(0);
    // No centreline underneath: one line per link on top of the body it
    // describes is one more thing to delete in CAD.
    expect(
      parsed.entities.filter(
        (entity) => (entity as { layer?: string }).layer === 'PMKS_LINK_CENTERLINES'
      )
    ).toHaveLength(0);
  });

  it('sizes the pin to the parts unless somebody chooses one', () => {
    const { service } = setup();
    // Half the width the bodies are drawn at, which leaves a quarter of the
    // width as material either side. A fixed default cannot be right: the
    // bodies are whatever width the canvas happens to be using, and the old
    // 0.6 beside a 0.13-wide bar was a hole with no part left around it.
    const derived = service.pinDiameter();
    // Model units -> centimetres -> metres, which is what this project is in.
    const bodyWidth = linkBodyWidth() / MODEL_SCALE / 100;
    expect(derived).toBeGreaterThan(0);
    expect(derived).toBeLessThan(bodyWidth);
    expect(derived).toBeCloseTo(bodyWidth / 2, 3);
    // It follows the unit, because it is a physical hole rather than a number.
    expect(service.pinDiameter({ unit: 'cm' })).toBeCloseTo(derived * 100, 3);
    // And a chosen one is used as given.
    expect(service.pinDiameter({ pinDiameter: 0.42 })).toBe(0.42);
  });

  it('says so when a chosen pin would break out of the parts', () => {
    const { service } = setup();
    expect(service.pinWarning({ pinDiameter: 10 })).toContain('wider than');
    // The default no longer can, which is the point of deriving it.
    expect(service.pinWarning()).toBe('');
    // Only when there is a body for it to break out of.
    expect(service.pinWarning({ pinDiameter: 10, linkBodies: 'centerlines' })).toBe('');
    expect(service.pinWarning({ pinDiameter: 10, jointCircles: 'marks' })).toBe('');
  });

  it('says which links meet at each joint, which DXF cannot', () => {
    const { service } = setup();
    const table = service['jointCsv']('cm') as string;
    const [heading, ...rows] = table.trim().split('\r\n');
    expect(heading.endsWith(',links')).toBe(true);
    // Two holes in two layers are the same pin only if something says so.
    expect(rows[0].endsWith(',AB')).toBe(true);
    const json = JSON.parse(service['dataJson']('cm') as string);
    expect(json.joints[0].links).toEqual(['AB']);
  });

  it('is byte-deterministic for unchanged model state and choices', () => {
    const { service } = setup();
    const options = { fileName: 'drawing', includeLabels: true };

    expect(service.create(options).content).toBe(service.create(options).content);
  });
});
