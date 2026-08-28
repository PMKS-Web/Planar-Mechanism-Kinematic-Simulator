import { DxfDocument, DxfLayer } from './dxf-model';
import { writeDxf } from './dxf-writer';

const layers: DxfLayer[] = [
  { name: 'PMKS_LINKS', color: 7 },
  { name: 'PMKS_JOINTS', color: 2 },
];

describe('ASCII DXF writer', () => {
  it('writes a deterministic R2000 document with units, layers, extents, and finite entities', () => {
    const document: DxfDocument = {
      units: 'cm',
      layers,
      entities: [
        { type: 'LINE', layer: 'PMKS_LINKS', start: { x: -2, y: 1 }, end: { x: 4, y: 3 } },
        { type: 'CIRCLE', layer: 'PMKS_JOINTS', center: { x: 4, y: 3 }, radius: 0.1 },
        {
          type: 'LWPOLYLINE',
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
    expect(first).toContain('$ACADVER\r\n1\r\nAC1015');
    expect(first).toContain('$INSUNITS\r\n70\r\n5');
    expect(first).toContain('$EXTMIN\r\n10\r\n-2\r\n20\r\n-5');
    expect(first).toContain('$EXTMAX\r\n10\r\n4.1\r\n20\r\n3.1');
    // Both layers are declared, each as its own record. Not asserted as one
    // run of bytes: R2000 puts a handle and two subclass markers between the
    // record and its name, and this test is about the table being there.
    expect(first).toContain('AcDbLayerTableRecord');
    expect(first).toContain('PMKS_LINKS');
    expect(first).toContain('PMKS_JOINTS');
    expect(first).toContain('LWPOLYLINE');
    expect(first.endsWith('0\r\nEOF\r\n')).toBe(true);
    expect(first).not.toMatch(/NaN|Infinity/);
  });

  it('rejects invalid coordinates instead of producing a corrupt drawing', () => {
    expect(() =>
      writeDxf({
        units: 'in',
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

  it('maps every project length unit to the corresponding DXF unit code', () => {
    const code = (units: DxfDocument['units']) =>
      writeDxf({ units, layers, entities: [] }).match(/\$INSUNITS\r\n70\r\n(\d+)/)?.[1];

    expect(code('in')).toBe('1');
    expect(code('cm')).toBe('5');
    expect(code('m')).toBe('6');
  });
});
