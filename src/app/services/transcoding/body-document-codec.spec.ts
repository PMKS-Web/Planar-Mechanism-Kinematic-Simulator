import { BodyDocument, emptyBodyDocument } from '../../model/body-system/body-document';
import { BodyFactory } from '../../model/body-system/body-factory';
import { WORLD, newRecordId } from '../../model/body-system/body-id';
import { nativeRotatingCylinder } from '../../../test-utils/verification/native-rotating-cylinder-fixture';
import { nativeWeldedCylinder } from '../../../test-utils/verification/native-welded-cylinder-fixture';
import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { nativeTranslatingCylinder } from '../../../test-utils/verification/native-translating-cylinder-fixture';
import { nativeFoldPair } from '../../../test-utils/verification/native-fold-pair-fixture';
import { compileBodyDocument } from '../../model/body-system/constraint-compiler';
import { canonicalBodyDocument } from './body-document-canonical';
import { bodyDocumentEnvelope, MAX_NATIVE_DOCUMENT_BYTES } from './body-document-envelope';
import { decodeBodyDocument, encodeBodyDocument } from './body-document-codec';

const packed = (value: unknown) => bodyDocumentEnvelope(JSON.stringify(value))!;
function roundTrip(document: BodyDocument): BodyDocument {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  const decoded = decodeBodyDocument(encoded.payload);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  expect(canonicalBodyDocument(decoded.document)).toBe(canonicalBodyDocument(document));
  expect(encodeBodyDocument(decoded.document)).toEqual(encoded);
  return decoded.document;
}

describe('native body document codec', () => {
  it('retains every native joint kind and the worked cylinder constructions at full precision', () => {
    for (const document of [
      emptyBodyDocument(),
      nativeRotatingCylinder().document,
      nativeWeldedCylinder().document,
      nativeObliqueCylinder().document,
      nativeTranslatingCylinder().document,
      nativeFoldPair().document,
    ]) {
      const before = JSON.stringify(document),
        decoded = roundTrip(document);
      expect(compileBodyDocument(decoded).ok).toBe(true);
      expect(JSON.stringify(document)).toBe(before);
    }
    const factory = new BodyFactory();
    const body = factory.body('Link π — 日本語 🛠', { x: Math.PI, y: 1e-12, angle: Math.sqrt(2) }, [
      { x: -1, y: 0 },
      { x: 2, y: 0 },
    ]);
    factory.junction([WORLD, body], { x: Math.PI, y: 1e-12 });
    const decoded = roundTrip(factory.document);
    expect(decoded.bodies.find((b) => b.id === body)).toEqual(
      factory.document.bodies.find((b) => b.id === body)
    );
    expect(decoded.junctions[0].hub).toBe(factory.document.junctions[0].hub);
    expect(new Set(decoded.junctions[0].attachments)).toEqual(
      new Set(factory.document.junctions[0].attachments)
    );
  });

  it('retains material and group overrides, body-owned loads, holds, locks and trace identity', () => {
    const f = new BodyFactory(
      emptyBodyDocument({ length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' })
    );
    const a = f.body('painted bar', { x: 2, y: 3, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const b = f.body('disk', { x: 5, y: 4, angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const start = f.attachment(a, { x: 0, y: 0 }),
      end = f.attachment(a, { x: 3, y: 0 });
    f.joint('weld', start, f.attachment(b, { x: 0, y: 0 }));
    const load = {
      id: newRecordId<'force'>(),
      bodyId: b,
      label: 'owning disk',
      point: { x: 0.2, y: 0.3 },
      frame: 'body' as const,
      vector: { x: 0.1, y: -0.5 },
      couple: 0.025,
    };
    const document: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.kind !== 'material'
          ? body
          : body.id === a
            ? {
                ...body,
                presentation: { ...body.presentation, fill: '#26a69a', outline: 'circle' },
                mass: {
                  mass: { mode: 'explicit', value: 2.5 },
                  inertia: { mode: 'explicit', value: 0.0125 },
                  center: { mode: 'explicit', point: { x: 0.25, y: 0.1 }, editAnchor: 'grid' },
                },
              }
            : { ...body, geometry: { kind: 'circle', center: { x: 0.1, y: 0.2 }, radius: 0.5 } }
      ),
      attachments: f.document.attachments.map((point) =>
        point.id === end ? { ...point, trace: true, label: 'witness' } : point
      ),
      groups: [
        {
          members: [a, b],
          frameBody: a,
          label: 'custom group',
          presentation: { fill: '#5c6bc0', hidden: false, showCenter: true },
          mass: { mass: 12, inertia: 3, center: { point: { x: 0.4, y: 0.3 }, editAnchor: 'body' } },
        },
      ],
      forces: [load],
      holds: [{ bodyId: a, from: start, to: end, length: 3, angle: 0.4 }],
      locks: [end],
    };
    const decoded = roundTrip(document);
    expect(decoded.forces[0]).toEqual(load);
    expect(decoded.groups[0].mass).toEqual(document.groups[0].mass);
    expect(decoded.holds).toEqual(document.holds);
    expect(decoded.locks).toEqual([end]);
    expect(decoded.attachments.find((point) => point.id === end)?.trace).toBe(true);
  });

  it('canonicalizes record and membership enumeration without reversing authored geometry', () => {
    const source = nativeWeldedCylinder().document;
    const reversed = {
      ...source,
      bodies: [...source.bodies].reverse(),
      joints: [...source.joints].reverse(),
      attachments: [...source.attachments].reverse(),
      limits: [...source.limits].reverse(),
      forces: [...source.forces].reverse(),
    };
    expect(encodeBodyDocument(reversed)).toEqual(encodeBodyDocument(source));
    const material = source.bodies.find((b) => b.kind === 'material')!;
    if (material.kind !== 'material' || material.geometry.kind !== 'bar')
      throw new Error('fixture needs a bar');
    const geometry = material.geometry;
    const changed: BodyDocument = {
      ...source,
      bodies: source.bodies.map((b) =>
        b === material
          ? {
              ...material,
              geometry: { ...geometry, vertices: [geometry.vertices[1], geometry.vertices[0]] },
            }
          : b
      ),
    };
    expect(encodeBodyDocument(changed)).not.toEqual(encodeBodyDocument(source));
  });

  it('rejects unsupported versions, damaged bytes and malformed JSON without a partial document', () => {
    expect(decodeBodyDocument('pmks3:12345678.e30')).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
    expect(decodeBodyDocument(packed({ ...emptyBodyDocument(), version: 3 }))).toEqual({
      ok: false,
      reason: 'unsupported-version',
    });
    const valid = packed(emptyBodyDocument());
    const changed = valid.slice(0, -4) + (valid.at(-4) === 'A' ? 'B' : 'A') + valid.slice(-3);
    expect(decodeBodyDocument(changed)).toEqual({ ok: false, reason: 'checksum' });
    expect(decodeBodyDocument(bodyDocumentEnvelope('{broken')!)).toEqual({
      ok: false,
      reason: 'invalid-format',
    });
    expect(decodeBodyDocument('pmks2:bad')).toEqual({ ok: false, reason: 'invalid-format' });
  });

  it('does not silently erase unknown physics or wrong-kind fields, even with a valid checksum', () => {
    const source = nativeObliqueCylinder().document;
    for (const candidate of [
      { ...source, couplings: [{ kind: 'gear', ratio: 2 }] },
      { ...source, selection: { kind: 'body', id: source.bodies[1].id } },
      { ...source, joints: source.joints.map((j, i) => (i ? j : { ...j, kind: 'gear' })) },
      { ...source, joints: source.joints.map((j, i) => (i ? j : { ...j, ratio: 2 })) },
      {
        ...source,
        assemblies: source.assemblies.map((a) => ({
          ...a,
          dimensions: { ...a.dimensions, secretTravel: 5 },
        })),
      },
      { ...source, units: { ...source.units, length: 'mm' } },
    ])
      expect(decodeBodyDocument(packed(candidate))).toEqual({
        ok: false,
        reason: 'invalid-document',
      });
  });

  it('checks all references and malformed nested values before handing data to the typed validator', () => {
    const source = nativeWeldedCylinder().document;
    for (const candidate of [
      null,
      [],
      { ...source, bodies: null },
      { ...source, bodies: [null] },
      { ...source, bodies: [...source.bodies, source.bodies[1]] },
      { ...source, attachments: [] },
      {
        ...source,
        forces: [
          {
            id: 'load',
            bodyId: 'missing',
            label: 'load',
            point: { x: 0, y: 0 },
            vector: { x: 1, y: 0 },
            frame: 'world',
            couple: 0,
          },
        ],
      },
      { ...source, locks: ['missing'] },
      { ...source, joints: source.joints.map((j, i) => (i ? j : { ...j, frameA: {} })) },
    ]) {
      const result = decodeBodyDocument(packed(candidate));
      expect(result.ok).toBe(false);
      expect('document' in result).toBe(false);
    }
    expect(encodeBodyDocument({ ...source, bodies: new Array(2) })).toEqual({
      ok: false,
      reason: 'invalid-document',
    });
  });

  it('bounds aggregate depth, record counts and payload bytes before accepting a candidate', () => {
    const source = emptyBodyDocument();
    expect(decodeBodyDocument(packed({ ...source, locks: Array(20001).fill('x') }))).toEqual({
      ok: false,
      reason: 'invalid-document',
    });
    let nested: unknown = {};
    for (let i = 0; i < 40; i++) nested = { child: nested };
    expect(decodeBodyDocument(packed({ ...source, nested }))).toEqual({
      ok: false,
      reason: 'invalid-document',
    });
    expect(
      decodeBodyDocument(
        'pmks2:00000000.' + 'A'.repeat(Math.ceil(MAX_NATIVE_DOCUMENT_BYTES / 3) * 4 + 1)
      )
    ).toEqual({ ok: false, reason: 'too-large' });
  });
});
