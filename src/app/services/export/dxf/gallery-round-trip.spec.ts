import DxfParser from 'dxf-parser';
import { IEntity } from 'dxf-parser';
import { LengthUnit } from '../../../model/unit-enums';
import { buildMechanism } from '../../../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../../../test-utils/verification/fixture-gallery';
import { DxfExportChoices, DXF_PRESETS, NEUTRAL_DXF_OPTIONS } from './dxf-options';
import { buildSemanticDxf } from './semantic-dxf';
import { writeDxf } from './dxf-writer';

/**
 * Every published mechanism, exported and read back by a parser that knows
 * nothing about how it was written.
 *
 * This is the in-CI stand-in for "does CAD accept it". It cannot be the whole
 * answer -- `dxf-parser` is lenient where a real translator is strict, which is
 * exactly how the R2000 output went a long time with tables an auditor silently
 * repaired on the way in. `docs/tips-and-tricks.md` carries the ezdxf audit
 * script for that, and it stays a manual step. What this catches is the class
 * of thing that breaks when a mechanism is *unusual* rather than when the
 * writer is wrong: a slot with no travel, a link collapsed onto a point, a
 * welded compound with a hole in it, an outline that never closed.
 */
const PRESETS: { name: string; choices: Partial<DxfExportChoices> }[] = [
  { name: 'build parts', choices: DXF_PRESETS.build },
  { name: 'reference sketch', choices: DXF_PRESETS.reference },
];

function coordinatesOf(entity: IEntity): number[] {
  const parts = entity as unknown as {
    vertices?: { x: number; y: number }[];
    center?: { x: number; y: number };
    startPoint?: { x: number; y: number };
    radius?: number;
  };
  return [
    ...(parts.vertices ?? []).flatMap((vertex) => [vertex.x, vertex.y]),
    ...(parts.center ? [parts.center.x, parts.center.y] : []),
    ...(parts.startPoint ? [parts.startPoint.x, parts.startPoint.y] : []),
    ...(parts.radius === undefined ? [] : [parts.radius]),
  ];
}

describe('every published mechanism, exported and parsed back', () => {
  FIXTURE_GALLERY.forEach((entry) => {
    PRESETS.forEach((preset) => {
      it(`${entry.name} survives a round trip as a ${preset.name}`, () => {
        const built = buildMechanism(entry.fixture);
        const text = writeDxf(
          buildSemanticDxf({
            joints: built.joints,
            links: built.links,
            forces: built.forces,
            lengthUnit: 'cm',
            defaultInputClockwise: false,
            options: { ...NEUTRAL_DXF_OPTIONS, ...preset.choices },
          })
        );

        // It is R12, and it parses.
        expect(text).toContain('$ACADVER\r\n1\r\nAC1009');
        const parsed = new DxfParser().parseSync(text);
        expect(parsed).not.toBeNull();
        expect(parsed!.entities.length).toBeGreaterThan(0);

        // Nothing is drawn on a layer the file's own table never declared.
        const declared = new Set(Object.keys(parsed!.tables.layer.layers));
        parsed!.entities.forEach((entity) => expect(declared).toContain(entity.layer));

        // No coordinate that would land the geometry somewhere unrecoverable.
        // Most importers accept a NaN silently, which is the worst of both.
        parsed!.entities.forEach((entity) =>
          coordinatesOf(entity).forEach((value) => expect(Number.isFinite(value)).toBe(true))
        );

        // Every closed loop really is closed, and has enough vertices to be a
        // shape: a two-point "loop" is a line pretending, and CAD will not
        // offer it as a face.
        parsed!.entities
          .filter((entity) => entity.type === 'POLYLINE')
          .forEach((entity) => {
            const loop = entity as unknown as {
              shape: boolean;
              vertices: { x: number; y: number; bulge?: number }[];
            };
            if (!loop.shape) return;
            expect(loop.vertices.length).toBeGreaterThanOrEqual(2);
            // Two vertices is only a shape when both of them curve -- that is
            // how a circle is written as a polyline.
            if (loop.vertices.length === 2) {
              expect(loop.vertices.every((vertex) => (vertex.bulge ?? 0) !== 0)).toBe(true);
            }
          });
      });
    });
  });

  it('gives every link a body of its own to build, wherever it can', () => {
    // The point of the build preset, asserted once across the whole gallery
    // rather than per mechanism: a closed outline on a layer per link.
    const withBodies = FIXTURE_GALLERY.map((entry) => {
      const built = buildMechanism(entry.fixture);
      const document = buildSemanticDxf({
        joints: built.joints,
        links: built.links,
        forces: built.forces,
        lengthUnit: 'cm',
        defaultInputClockwise: false,
        options: { ...NEUTRAL_DXF_OPTIONS, ...DXF_PRESETS.build },
      });
      const bodies = document.entities.filter(
        (entity) => entity.type === 'POLYLINE' && /^PMKS_LINK_/.test(entity.layer)
      );
      return { name: entry.name, bodies: bodies.length };
    });
    const empty = withBodies.filter((one) => one.bodies === 0);
    expect(empty).toEqual([]);
  });
});
