import DxfParser from 'dxf-parser';
import { DxfDocument } from './dxf-model';
import { writeDxf } from './dxf-writer';

/**
 * The three things the redesigned export adds to the file, checked against a
 * parser that knows nothing about how they were written.
 *
 * Blocks and dimensions are where a hand-rolled DXF stops being obviously safe:
 * a DIMENSION naming a block the file never defines, or an INSERT with no
 * BLOCKS section, is a file an importer is entitled to refuse. Round-tripping
 * them is the only way to know they are real.
 */
const base: DxfDocument = {
  units: 'cm',
  layers: [
    { name: 'PMKS_LINK_CENTERLINES', color: 7 },
    { name: 'PMKS_DIMENSIONS', color: 8 },
  ],
  entities: [],
};

describe('the DXF writer, on the entities the CAD export added', () => {
  it('defines a block and places it, and the parser finds both', () => {
    const parsed = new DxfParser().parseSync(
      writeDxf({
        ...base,
        blocks: [
          {
            name: 'PMKS_GROUND',
            base: { x: 0, y: 0 },
            entities: [
              {
                type: 'LINE',
                layer: 'PMKS_LINK_CENTERLINES',
                start: { x: -1, y: 0 },
                end: { x: 1, y: 0 },
              },
            ],
          },
        ],
        entities: [
          {
            type: 'INSERT',
            layer: 'PMKS_LINK_CENTERLINES',
            name: 'PMKS_GROUND',
            at: { x: 4, y: 2 },
          },
        ],
      })
    )!;
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed.blocks ?? {})).toContain('PMKS_GROUND');
    const insert = parsed.entities.find((entity) => entity.type === 'INSERT');
    expect(insert).toBeDefined();
    expect((insert as { name?: string }).name).toBe('PMKS_GROUND');
  });

  it('writes an aligned dimension that keeps its two measured points', () => {
    const parsed = new DxfParser().parseSync(
      writeDxf({
        ...base,
        blocks: [{ name: '*D0', base: { x: 0, y: 0 }, entities: [] }],
        entities: [
          {
            type: 'DIMENSION',
            layer: 'PMKS_DIMENSIONS',
            blockName: '*D0',
            definition: { x: 0, y: -1 },
            from: { x: 0, y: 0 },
            to: { x: 6, y: 0 },
            textAt: { x: 3, y: -1.2 },
            text: '6.00 cm',
          },
        ],
      })
    )!;
    const dimension = parsed.entities.find((entity) => entity.type === 'DIMENSION') as
      Record<string, unknown> | undefined;
    expect(dimension).toBeDefined();
    expect(dimension!['text']).toBe('6.00 cm');
  });

  it('says R12 in the header when the older format was asked for', () => {
    expect(writeDxf({ ...base, version: 'R12' })).toContain('AC1009');
    expect(writeDxf(base)).toContain('AC1015');
  });

  it('names a text style, so labels do not import at a size nobody chose', () => {
    const text = writeDxf({
      ...base,
      entities: [
        {
          type: 'TEXT',
          layer: 'PMKS_LINK_CENTERLINES',
          at: { x: 0, y: 0 },
          height: 0.5,
          text: 'AB',
        },
      ],
    });
    expect(text).toContain('STANDARD');
  });
});
