import { DxfDocument } from './dxf-model';
import { writeSvg } from './svg-writer';

const document: DxfDocument = {
  layers: [
    { name: 'PMKS_LINK_AB', color: 7 },
    { name: 'PMKS_NOTES', color: 8 },
  ],
  entities: [
    {
      type: 'POLYLINE',
      layer: 'PMKS_LINK_AB',
      closed: true,
      points: [
        { x: 0, y: 0, bulge: -1 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
      ],
    },
    { type: 'CIRCLE', layer: 'PMKS_LINK_AB', center: { x: 1, y: 1 }, radius: 0.3 },
    { type: 'TEXT', layer: 'PMKS_NOTES', at: { x: 0, y: -2 }, height: 0.2, text: 'a & b' },
  ],
};

describe('the SVG writer', () => {
  it('carries the physical size, which is the thing DXF cannot', () => {
    const svg = writeSvg(document, 'cm');
    // Width in real centimeters against a viewBox in drawing units: the part
    // prints and cuts at the size it was drawn, with no import dialog to get
    // wrong. A meter drawing says the same size in centimeters, because SVG
    // has no meter.
    expect(svg).toMatch(/width="[\d.]+cm"/);
    const metric = writeSvg(document, 'm');
    const asCm = Number(/width="([\d.]+)cm"/.exec(metric)![1]);
    const asCentimeters = Number(/width="([\d.]+)cm"/.exec(svg)![1]);
    expect(asCm).toBeCloseTo(asCentimeters * 100, 4);
    expect(writeSvg(document, 'in')).toMatch(/width="[\d.]+in"/);
  });

  it('keeps a layer per part, which is what one sketch per part depends on', () => {
    const svg = writeSvg(document, 'cm');
    expect(svg).toContain('<g id="PMKS_LINK_AB"');
    expect(svg).toContain('inkscape:groupmode="layer"');
    // Only the layers something is drawn on: an empty group is a layer a
    // reader has to open to discover there is nothing in it.
    expect(svg).not.toContain('PMKS_JOINT_CENTERS');
  });

  it('closes a closed loop and curves a bulge, as the DXF does', () => {
    const svg = writeSvg(document, 'cm');
    const path = /<path d="([^"]+)"/.exec(svg)![1];
    expect(path.startsWith('M0 0')).toBe(true);
    // The bulge becomes an arc rather than being flattened to a chord.
    expect(path).toMatch(/A[\d.]+ [\d.]+ 0 \d \d 4 0/);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('draws with y upward, the way every other part of this pipeline counts', () => {
    // One flip for the whole drawing, and the text flipped back so it is not
    // written upside down.
    const svg = writeSvg(document, 'cm');
    expect(svg).toContain('transform="scale(1,-1)"');
    expect(svg).toMatch(/<text x="0" y="2"/);
  });

  it('escapes what would otherwise close a tag', () => {
    expect(writeSvg(document, 'cm')).toContain('a &amp; b');
  });

  it('has something to say about an empty drawing rather than nothing', () => {
    const empty = writeSvg({ layers: [], entities: [] }, 'cm');
    expect(empty).toContain('<svg');
    expect(empty).toContain('</svg>');
    expect(empty).not.toMatch(/NaN|Infinity/);
  });
});
