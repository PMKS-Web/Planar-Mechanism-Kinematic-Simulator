import DxfParser from 'dxf-parser';
import { DxfDocument, DxfLayer } from './dxf-model';
import { writeDxf } from './dxf-writer';

const layers: DxfLayer[] = [
  { name: 'PMKS_LINKS', color: 7 },
  { name: 'PMKS_JOINTS', color: 2 },
];

const parse = (document: DxfDocument) => new DxfParser().parseSync(writeDxf(document))!;

describe('ASCII DXF writer', () => {
  it('writes a deterministic R12 document with layers, extents and finite entities', () => {
    const document: DxfDocument = {
      layers,
      entities: [
        { type: 'LINE', layer: 'PMKS_LINKS', start: { x: -2, y: 1 }, end: { x: 4, y: 3 } },
        { type: 'CIRCLE', layer: 'PMKS_JOINTS', center: { x: 4, y: 3 }, radius: 0.1 },
        {
          type: 'POLYLINE',
          layer: 'PMKS_LINKS',
          closed: false,
          points: [
            { x: -2, y: 1 },
            { x: 0, y: -5 },
          ],
        },
        { type: 'TEXT', layer: 'PMKS_JOINTS', at: { x: 4, y: 3 }, height: 0.2, text: 'A' },
      ],
    };

    const first = writeDxf(document);
    const second = writeDxf(document);

    expect(first).toBe(second);
    expect(first).toContain('$ACADVER\r\n1\r\nAC1009');
    expect(first).toContain('$EXTMIN\r\n10\r\n-2\r\n20\r\n-5');
    expect(first).toContain('$EXTMAX\r\n10\r\n4.1\r\n20\r\n3.1');
    expect(first).toContain('PMKS_LINKS');
    expect(first).toContain('PMKS_JOINTS');
    expect(first.endsWith('0\r\nEOF\r\n')).toBe(true);
    expect(first).not.toMatch(/NaN|Infinity/);
  });

  it('carries nothing R12 predates, which is the whole reason to write R12', () => {
    const text = writeDxf({
      layers,
      entities: [
        {
          type: 'POLYLINE',
          layer: 'PMKS_LINKS',
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
          ],
        },
      ],
    });
    // No subclass markers, no LWPOLYLINE, no handles, no blocks, no dimension
    // style: a reader old enough to want R12 stops at the first of them.
    expect(text).not.toContain('AcDb');
    expect(text).not.toContain('LWPOLYLINE');
    expect(text).not.toContain('BLOCKS');
    expect(text).not.toContain('DIMSTYLE');
    expect(text).toContain('POLYLINE');
    expect(text).toContain('VERTEX');
    expect(text).toContain('SEQEND');
  });

  it('closes a closed loop, so an importer has a face rather than a path', () => {
    const parsed = parse({
      layers,
      entities: [
        {
          type: 'POLYLINE',
          layer: 'PMKS_LINKS',
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
          ],
        },
      ],
    });
    const loop = parsed.entities.find((entity) => entity.type === 'POLYLINE') as unknown as {
      shape: boolean;
      vertices: { x: number; y: number }[];
    };
    expect(loop.vertices).toHaveLength(3);
    expect(loop.shape).toBe(true);
  });

  it('curves a run with a bulge, which is how a rounded outline stays one loop', () => {
    // A half circle from (0,0) up to (0,2): the included angle is pi, so the
    // bulge is tan(pi/4) -- 1. Without it the corner arcs of a link outline
    // would have to be separate ARC entities, and the loop would not be one.
    const parsed = parse({
      layers,
      entities: [
        {
          type: 'POLYLINE',
          layer: 'PMKS_LINKS',
          closed: true,
          points: [
            { x: 0, y: 0, bulge: 1 },
            { x: 0, y: 2 },
          ],
        },
      ],
    });
    const loop = parsed.entities.find((entity) => entity.type === 'POLYLINE') as unknown as {
      vertices: { x: number; y: number; bulge?: number }[];
    };
    expect(loop.vertices[0].bulge).toBeCloseTo(1, 6);
    expect(loop.vertices[1].bulge ?? 0).toBe(0);
  });

  it('rejects invalid coordinates instead of producing a corrupt drawing', () => {
    expect(() =>
      writeDxf({
        layers,
        entities: [
          {
            type: 'LINE',
            layer: 'PMKS_LINKS',
            start: { x: 0, y: 0 },
            end: { x: Number.NaN, y: 1 },
          },
        ],
      })
    ).toThrowError(/finite/);
  });

  it('refuses an entity on a layer its own table never declared', () => {
    expect(() =>
      writeDxf({
        layers,
        entities: [
          { type: 'LINE', layer: 'PMKS_NOWHERE', start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
        ],
      })
    ).toThrowError(/undeclared layer/);
  });

  it('names a text style, so labels do not import at a size nobody chose', () => {
    const text = writeDxf({
      layers,
      entities: [
        { type: 'TEXT', layer: 'PMKS_LINKS', at: { x: 0, y: 0 }, height: 0.5, text: 'AB' },
      ],
    });
    expect(text).toContain('STANDARD');
  });
});
