import '../../../model/joint';
import { TestBed } from '@angular/core/testing';
import DxfParser from 'dxf-parser';
import { BehaviorSubject } from 'rxjs';
import { RevJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { MechanismService } from '../../mechanism.service';
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
    const file = service.create({ dataFile: 'none' });
    const parsed = new DxfParser().parseSync(file.content);

    expect(mechanism.encodeFromStartPose).toHaveBeenCalledOnce();
    expect(file.name).toBe('mechanism.dxf');
    expect(file.mime).toBe('application/dxf;charset=utf-8');
    expect(file.blob.type).toBe(file.mime);
    expect(parsed?.header['$INSUNITS']).toBe(6);
    expect(parsed?.entities.some((entity) => entity.type === 'LINE')).toBe(true);
  });

  it('packs the companion table beside the drawing, and says which files those are', () => {
    const { service } = setup();

    const csv = service.create({ dataFile: 'csv' });
    expect(csv.name).toBe('mechanism.zip');
    expect(csv.mime).toBe('application/zip');
    expect(csv.parts).toEqual(['mechanism.dxf', 'mechanism-joints.csv', 'mechanism-links.csv']);
    // The DXF is still the content, whatever the delivery: everything that
    // reads a file from this service reads the drawing.
    expect(csv.content).toContain('AC1015');

    const json = service.create({ dataFile: 'json' });
    expect(json.parts).toEqual(['mechanism.dxf', 'mechanism.json']);
  });

  it('publishes stable UI defaults and sanitizes the requested file name', () => {
    const { service } = setup();

    // The dialog opens on "Build parts", so that is what the service does when
    // it is told nothing: a layer per link, at the origin, holes and dimensions.
    // The plain reading of the drawing is `NEUTRAL_DXF_OPTIONS`, which is what
    // the builder assumes and what every other caller gets.
    expect(DEFAULT_DXF_EXPORT_OPTIONS).toMatchObject({
      fileName: 'mechanism',
      origin: 'ground',
      jointCircles: 'holes',
      perLinkLayers: true,
      includeDimensions: true,
      includeLabels: false,
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
    expect(service.create({ fileName: '///', dataFile: 'none' }).name).toBe('mechanism.dxf');
  });

  it('draws the picture inside each dimension block, not just the measurement', () => {
    const { service } = setup();
    const text = service.create({
      dataFile: 'none',
      includeDimensions: true,
      dimensionStyle: 'entities',
    }).content;
    const parsed = new DxfParser().parseSync(text)!;
    const block = parsed.blocks['*D0'];
    expect(block).toBeDefined();
    // A reader that redraws the dimension is happy with an empty block; one
    // that only draws what the block holds -- which is the whole reason anyone
    // asks for R12 -- would show nothing at all.
    expect(block.entities.length).toBeGreaterThan(0);
    expect(block.entities.some((entity) => entity.type === 'TEXT')).toBe(true);
    expect(block.entities.filter((entity) => entity.type === 'LINE').length).toBeGreaterThanOrEqual(
      3
    );
    // And the picture is drawn where the link is, not at the origin. The link
    // is 2cm by 1cm and this project is in metres.
    const drawn = block.entities.flatMap((entity) =>
      'vertices' in entity ? (entity.vertices as { x: number; y: number }[]) : []
    );
    expect(drawn.some((point) => Math.hypot(point.x - 0.02, point.y - 0.01) < 0.01)).toBe(true);
  });

  it('converts the geometry into the unit it labels it with', () => {
    const { service } = setup();
    const lengthIn = (unit: LengthUnit | undefined) => {
      const parsed = new DxfParser().parseSync(service.create({ dataFile: 'none', unit }).content)!;
      const ends = parsed.entities
        .filter((entity) => entity.type === 'LINE')
        .map((entity) => (entity as unknown as { vertices: { x: number; y: number }[] }).vertices)
        .map(([from, to]) => Math.hypot(to.x - from.x, to.y - from.y));
      return { header: parsed.header['$INSUNITS'], span: Math.max(...ends) };
    };
    // The same 2cm-by-1cm link, asked for three ways. Saying metres and then
    // writing centimetres hands CAD a mechanism a hundred times too big under
    // a label that looks right.
    const centimetres = lengthIn(LengthUnit.CM);
    expect(centimetres.header).toBe(5);
    expect(centimetres.span).toBeCloseTo(Math.hypot(2, 1), 6);

    const metres = lengthIn(LengthUnit.METER);
    expect(metres.header).toBe(6);
    expect(metres.span).toBeCloseTo(Math.hypot(2, 1) / 100, 6);

    const inches = lengthIn(LengthUnit.INCH);
    expect(inches.header).toBe(1);
    expect(inches.span).toBeCloseTo(Math.hypot(2, 1) / 2.54, 6);
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
    const dimension = parsed.entities.find((entity) => entity.type === 'DIMENSION') as unknown as {
      anchorPoint: { x: number; y: number };
    };
    expect(Math.abs(dimension.anchorPoint.x)).toBeGreaterThan(0);
    // And the picture went with it, rather than staying on the link.
    const drawn = parsed.blocks['*D0'].entities.flatMap((entity) =>
      'vertices' in entity ? (entity.vertices as { x: number; y: number }[]) : []
    );
    expect(drawn.every((point) => point.x === 0)).toBe(false);
  });

  it('is byte-deterministic for unchanged model state and choices', () => {
    const { service } = setup();
    const options = { fileName: 'drawing', includeLabels: true };

    expect(service.create(options).content).toBe(service.create(options).content);
  });
});
