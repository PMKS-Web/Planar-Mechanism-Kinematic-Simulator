// joint.ts first: the model modules form a runtime cycle when entered through link.ts.
import '../../../model/joint';
import DxfParser, {
  ICircleEntity,
  IEntity,
  ILineEntity,
  IPointEntity,
  ITextEntity,
} from 'dxf-parser';
import { Coord } from '../../../model/coord';
import { Force } from '../../../model/force';
import { PrisJoint, RealJoint, RevJoint } from '../../../model/joint';
import { RealLink, SliderBlock } from '../../../model/link';
import { LengthUnit } from '../../../model/unit-enums';
import { MODEL_SCALE } from '../../../model/render-scale';
import { BASIC_CENTERLINE_GOLDEN } from '../../../../test-data/dxf/basic-centerline.golden';
import { buildSemanticDxf, DXF_LAYER, SemanticDxfInput } from './semantic-dxf';
import { writeDxf } from './dxf-writer';

const S = MODEL_SCALE;

function parsedOf(document: ReturnType<typeof buildSemanticDxf>) {
  const parsed = new DxfParser().parseSync(writeDxf(document));
  expect(parsed).not.toBeNull();
  return parsed!;
}

function entitiesOn(entities: IEntity[], layer: string): IEntity[] {
  return entities.filter((entity) => entity.layer === layer);
}

function lineEnds(line: ILineEntity): number[][] {
  return line.vertices.map((point) => [point.x, point.y]);
}

function wire(link: RealLink | SliderBlock): void {
  link.joints.forEach((joint) => {
    if (joint instanceof RealJoint && !joint.links.includes(link)) joint.links.push(link);
  });
}

describe('semantic DXF centerline geometry', () => {
  it('exports project-unit, Y-up geometry at the global origin and ignores editor locks', () => {
    const a = new RevJoint('A', -2 * S, 3 * S, true, true);
    const b = new RevJoint('B', 4 * S, -1 * S);
    a.locked = true;
    const link = new RealLink('AB', [a, b]);
    wire(link);

    const document = buildSemanticDxf({
      joints: [a, b],
      links: [link],
      forces: [],
      lengthUnit: 'cm',
      defaultInputClockwise: true,
    });
    const parsed = parsedOf(document);
    const centerline = entitiesOn(parsed.entities, DXF_LAYER.links)[0] as ILineEntity;

    expect(lineEnds(centerline)).toEqual([
      [-2, 3],
      [4, -1],
    ]);
    // R12 has no header field for units; the file's name and its notes carry
    // them instead, which is what the import dialog asks for anyway.
    expect(parsed.header['$ACADVER']).toBe('AC1009');
    expect(
      entitiesOn(parsed.entities, DXF_LAYER.joints).filter((entity) => entity.type === 'CIRCLE')
    ).toHaveLength(2);
    // And nothing else: a bare POINT is what sketch importers drop or turn
    // into stray points somebody has to clean out one at a time.
    expect(parsed.entities.every((entity) => entity.type !== 'POINT')).toBe(true);
    expect(entitiesOn(parsed.entities, DXF_LAYER.labels)).toHaveLength(0);
    expect(
      entitiesOn(parsed.entities, DXF_LAYER.annotations).some(
        (entity) => entity.type === 'POLYLINE'
      )
    ).toBe(true);
    expect(Object.keys(parsed.tables.layer.layers)).toEqual(
      expect.arrayContaining(Object.values(DXF_LAYER))
    );

    const normalized = parsedOf(
      buildSemanticDxf({
        joints: [a, b],
        links: [link],
        forces: [],
        lengthUnit: 'cm',
        defaultInputClockwise: true,
        includeKinematicAnnotations: false,
      })
    ).entities.map((entity) => {
      if (entity.type === 'LINE') {
        return {
          type: entity.type,
          layer: entity.layer,
          geometry: lineEnds(entity as ILineEntity),
        };
      }
      if (entity.type === 'POINT') {
        const position = (entity as IPointEntity).position;
        return { type: entity.type, layer: entity.layer, geometry: [position.x, position.y] };
      }
      const circle = entity as ICircleEntity;
      return {
        type: entity.type,
        layer: entity.layer,
        geometry: [circle.center.x, circle.center.y, circle.radius],
      };
    });
    expect(normalized).toEqual(BASIC_CENTERLINE_GOLDEN);

    a.locked = false;
    expect(
      writeDxf(
        buildSemanticDxf({
          joints: [a, b],
          links: [link],
          forces: [],
          lengthUnit: 'cm',
          defaultInputClockwise: true,
        })
      )
    ).toBe(writeDxf(document));
  });

  it('consolidates collinear welded members but keeps a non-collinear constituent network', () => {
    const a = new RevJoint('A', -2 * S, 0);
    const b = new RevJoint('B', 0, 0);
    const c = new RevJoint('C', 3 * S, 0);
    const d = new RevJoint('D', 0, 2 * S);
    b.isWelded = true;
    const ab = new RealLink('AB', [a, b]);
    const bc = new RealLink('BC', [b, c]);
    const bd = new RealLink('BD', [b, d]);
    [ab, bc, bd].forEach(wire);
    const compound = new RealLink('ABCD', [a, b, c, d], 0, 0, undefined, [ab, bc, bd]);

    const parsed = parsedOf(
      buildSemanticDxf({
        joints: [a, b, c, d],
        links: [compound],
        forces: [],
        lengthUnit: 'cm',
        defaultInputClockwise: true,
      })
    );
    const lines = entitiesOn(parsed.entities, DXF_LAYER.links) as ILineEntity[];
    const normalized = lines
      .map(lineEnds)
      .map((ends) => JSON.stringify(ends))
      .sort();

    expect(normalized).toEqual([
      JSON.stringify([
        [-2, 0],
        [3, 0],
      ]),
      JSON.stringify([
        [0, 0],
        [0, 2],
      ]),
    ]);
    const jointEntities = entitiesOn(parsed.entities, DXF_LAYER.joints);
    const weldedMarker = jointEntities.some((entity) => {
      const point =
        entity.type === 'POINT'
          ? (entity as IPointEntity).position
          : entity.type === 'CIRCLE'
            ? (entity as ICircleEntity).center
            : undefined;
      return point?.x === 0 && point.y === 0;
    });
    expect(weldedMarker).toBe(false);
  });

  it('exports multi-joint bodies and independent mechanisms as deduplicated axis networks', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2 * S, 0);
    const c = new RevJoint('C', 0, 2 * S);
    const x = new RevJoint('X', 10 * S, -3 * S);
    const y = new RevJoint('Y', 12 * S, -3 * S);
    const body = new RealLink('ABC', [a, b, c]);
    const separate = new RealLink('XY', [x, y]);
    [body, separate].forEach(wire);

    const parsed = parsedOf(
      buildSemanticDxf({
        joints: [a, b, c, x, y],
        // A defensive duplicate must not duplicate the linework.
        links: [body, separate, body],
        forces: [],
        lengthUnit: 'cm',
        defaultInputClockwise: true,
      })
    );
    const lines = (entitiesOn(parsed.entities, DXF_LAYER.links) as ILineEntity[]).map(lineEnds);

    // A three-joint body is a closed triangle, not two lines meeting at
    // whichever joint happened to be first. Drawn as a star out of joint[0] it
    // came out as an open corner -- neither the part nor anything a reader
    // would recognize as one.
    const edges = lines.map((ends) => JSON.stringify(ends.slice().sort()));
    const has = (from: number[], to: number[]) => edges.includes(JSON.stringify([from, to].sort()));
    expect(has([0, 0], [2, 0])).toBe(true);
    expect(has([2, 0], [0, 2])).toBe(true);
    expect(has([0, 2], [0, 0])).toBe(true);
    expect(has([10, -3], [12, -3])).toBe(true);
    // Three edges round the triangle and one for the separate bar, with the
    // defensive duplicate link contributing nothing.
    expect(lines).toHaveLength(4);
  });

  it('exports grounded and floating slot axes, with a circle at each pin', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4 * S, 0);
    const carrier = new RealLink('AB', [a, b]);
    wire(carrier);
    const floating = new PrisJoint('P', 2 * S, 0);
    floating.slideOn(carrier, a, b);
    const grounded = new PrisJoint('Q', -2 * S, -2 * S, false, true);
    grounded.groundAt(Math.PI / 2);

    const parsed = parsedOf(
      buildSemanticDxf({
        joints: [a, b, floating, grounded],
        links: [carrier],
        forces: [],
        lengthUnit: 'cm',
        defaultInputClockwise: true,
      })
    );
    const onSlots = entitiesOn(parsed.entities, DXF_LAYER.slots);
    const slots = onSlots.filter((entity) => entity.type === 'LINE') as ILineEntity[];

    expect(slots.map(lineEnds)).toContainEqual([
      [0, 0],
      [4, 0],
    ]);
    expect(slots.map(lineEnds)).toContainEqual([
      [-2, -3],
      [-2, -1],
    ]);
    // The axis, and the block riding on it. Without the block a sliding pair is
    // one more line among lines, and nothing separates "slides along here" from
    // "another bar happens to lie here".
    expect(slots).toHaveLength(2);
    expect(onSlots.filter((entity) => entity.type === 'POLYLINE')).toHaveLength(2);
    const sliderPins = entitiesOn(parsed.entities, DXF_LAYER.joints).filter(
      (entity) => entity.type === 'CIRCLE'
    ) as ICircleEntity[];
    expect(sliderPins.map((entity) => [entity.center.x, entity.center.y])).toEqual(
      expect.arrayContaining([
        [2, 0],
        [-2, -2],
      ])
    );
  });

  it('reduces a sealed cylinder to its two visible attachment centers and connecting axis', () => {
    const barrelFar = new RevJoint('A', -4 * S, 0);
    const barrelNear = new RevJoint('B', 0, 0);
    const pin = new RevJoint('C', 1 * S, 0);
    const rodFar = new RevJoint('D', 5 * S, 0);
    const slider = new PrisJoint('P', pin.x, pin.y);
    slider.isSealed = true;
    slider.input = true;
    pin.isWelded = true;
    const barrel = new RealLink('AB', [barrelFar, barrelNear]);
    const rod = new RealLink('CD', [pin, rodFar]);
    const block = new SliderBlock('CP', [pin, slider]);
    [barrel, rod, block].forEach(wire);
    slider.slideOn(barrel, barrelFar, barrelNear);

    const parsed = parsedOf(
      buildSemanticDxf({
        joints: [barrelFar, barrelNear, pin, rodFar, slider],
        links: [barrel, rod, block],
        forces: [],
        lengthUnit: 'cm',
        defaultInputClockwise: true,
        includeLabels: true,
      })
    );

    const onCylinders = entitiesOn(parsed.entities, DXF_LAYER.cylinders);
    const cylinders = onCylinders.filter((entity) => entity.type === 'LINE') as ILineEntity[];
    expect(cylinders).toHaveLength(1);
    expect(lineEnds(cylinders[0])).toEqual([
      [-4, 0],
      [5, 0],
    ]);
    // And the barrel drawn as a body beside it: which half is the sleeve and
    // which is the rod is the whole point of a cylinder, and a plain line
    // between two mounts says neither.
    expect(onCylinders.filter((entity) => entity.type === 'POLYLINE')).toHaveLength(1);
    expect(entitiesOn(parsed.entities, DXF_LAYER.links)).toHaveLength(0);
    expect(
      entitiesOn(parsed.entities, DXF_LAYER.joints).filter((entity) => entity.type === 'CIRCLE')
    ).toHaveLength(2);
    const labels = entitiesOn(parsed.entities, DXF_LAYER.labels) as ITextEntity[];
    expect(labels.map((label) => label.text)).not.toEqual(expect.arrayContaining(['B', 'C', 'P']));
    expect(entitiesOn(parsed.entities, DXF_LAYER.annotations).length).toBeGreaterThan(0);
  });

  it('keeps the optional semantic annotations on separable layers', () => {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 2 * S, 0);
    const link = new RealLink('AB', [a, b]);
    link.name = 'Coupler';
    wire(link);
    const force = new Force('F1', link, new Coord(S, 0), new Coord(S, 2 * S));
    force.name = 'Load';
    const base: SemanticDxfInput = {
      joints: [a, b],
      links: [link],
      forces: [force],
      lengthUnit: 'in',
      defaultInputClockwise: false,
    };

    const withOptions = parsedOf(
      buildSemanticDxf({ ...base, includeLabels: true, includeKinematicAnnotations: true })
    );
    expect(entitiesOn(withOptions.entities, DXF_LAYER.annotations).length).toBeGreaterThan(0);
    expect(entitiesOn(withOptions.entities, DXF_LAYER.labels).length).toBeGreaterThan(0);
    expect(
      (entitiesOn(withOptions.entities, DXF_LAYER.labels) as ITextEntity[]).map(
        (entity) => entity.text
      )
    ).toEqual(expect.arrayContaining(['Coupler']));
    // The load is not drawn at all any more: an arrow in a file somebody is
    // about to extrude is sketch geometry tangled into a part, and the numbers
    // behind it are in the companion table instead.
    expect(
      withOptions.entities.map((entity) => (entity as { layer?: string }).layer)
    ).not.toContain('PMKS_FORCES');

    const without = parsedOf(
      buildSemanticDxf({
        ...base,
        includeLabels: false,
        includeKinematicAnnotations: false,
      })
    );
    expect(entitiesOn(without.entities, DXF_LAYER.annotations)).toHaveLength(0);
    expect(entitiesOn(without.entities, DXF_LAYER.labels)).toHaveLength(0);
  });
});
