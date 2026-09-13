import { Checksum } from './checksum';
import { DecimalSetting } from './stored-settings';
import { LengthUnit } from '../../model/unit-enums';
import { convertBodyUnits } from '../../model/body-system/body-unit-edit';
import { BodyDocumentAuthority } from '../../model/body-system/body-document-authority';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import {
  PRODUCTION_203_PAYLOADS,
  PRODUCTION_203_WELDED_LOAD,
} from '../../../test-utils/verification/production-203-payloads';
import { readLegacyProduction } from './legacy-production-reader';
import { encodeBodyDocument, decodeBodyDocument } from './body-document-codec';
import { compileBodyDocument } from '../../model/body-system/constraint-compiler';
import { WORLD } from '../../model/body-system/body-id';
import { StringTranscoder } from './string-transcoder';
import { legacyBodyId } from './legacy-production-material';
import { readBodyDocument } from './body-document-reader';
import { localToWorld } from '../../model/body-system/body-frame';

function read(payload: string) {
  const result = readLegacyProduction(payload);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.document;
}
describe('bounded production reader', () => {
  it('retains stored marker length in each source unit and converts it only with the drawing', () => {
    for (const [unit, meters] of [
      [LengthUnit.METER, 1],
      [LengthUnit.CM, 0.01],
      [LengthUnit.INCH, 0.0254],
    ] as const) {
      const old = new StringTranscoder();
      old.decodeURL(PRODUCTION_203_PAYLOADS['4-Bar']);
      old.addDecimalSetting(DecimalSetting.SCALE, 1.25);
      // The current writer adds development-only fields. Preserve the production record shape.
      const checksum = new Checksum(),
        sections = checksum.strip(PRODUCTION_203_PAYLOADS['4-Bar']).split('.');
      sections[1] = checksum.strip(old.encodeURL()).split('.')[1].split(',')[0];
      sections[3] = String(unit) + sections[3].slice(1);
      const payload = sections.join('.');
      const document = read(payload + checksum.generateChecksum(payload.length));
      expect(document.settings.objectScale).toBe(1.25);
      const converted = convertBodyUnits(document, { ...document.units, length: 'm' });
      if (!converted.ok) throw new Error(JSON.stringify(converted));
      expect(converted.document.settings.objectScale).toBeCloseTo(1.25 * meters, 12);
    }
  });
  for (const [name, payload] of Object.entries(PRODUCTION_203_PAYLOADS))
    it(`imports frozen ${name} and writes native records`, () => {
      const doc = read(payload),
        old = new StringTranscoder();
      old.decodeURL(payload);
      expect(doc.bodies.length).toBe(old.getLinks().length + 1);
      for (const link of old.getLinks()) {
        const body = doc.bodies.find((b) => b.id === legacyBodyId(link.id))!;
        if (body.kind !== 'material') throw new Error('material missing');
        expect(body.label).toBe(link.name);
        expect(body.mass.mass.value).toBe(link.mass);
        for (const id of link.jointIDs) {
          const p = doc.attachments.find((p) => p.bodyId === body.id && p.label === id)!;
          const actual = localToWorld(body.pose, p.point),
            expected = old.getJoints().find((j) => j.id === id)!;
          expect(actual.x).toBeCloseTo(expected.x, 12);
          expect(actual.y).toBeCloseTo(expected.y, 12);
        }
      }
      expect(compileBodyDocument(doc).ok).toBe(true);
      expect(doc.drivers.length).toBe(1);
      const written = encodeBodyDocument(doc);
      if (!written.ok) throw new Error(JSON.stringify(written));
      expect(written.payload.startsWith('pmks2:')).toBe(true);
      expect(decodeBodyDocument(written.payload).ok).toBe(true);
      expect(encodeBodyDocument(read(payload))).toEqual(written);
    });
  it('imports a grounded slider as massive carriage plus P and R', () => {
    const doc = read(PRODUCTION_203_PAYLOADS.Slider_Crank),
      carriage = legacyBodyId('CD');
    expect(doc.joints.filter((j) => j.kind === 'prismatic')).toHaveLength(1);
    expect(doc.joints.find((j) => j.kind === 'prismatic')).toMatchObject({
      bodyA: WORLD,
      bodyB: carriage,
    });
    expect(
      doc.joints.some(
        (j) => j.kind === 'revolute' && (j.bodyA === carriage || j.bodyB === carriage)
      )
    ).toBe(true);
    expect(doc.bodies.find((b) => b.id === carriage)).toMatchObject({
      mass: { mass: { mode: 'explicit', value: 1 }, inertia: { mode: 'explicit', value: 0 } },
    });
    expect(doc.joints.some((j) => j.kind === 'pin-in-slot')).toBe(false);
  });
  it('retains compound override and ambiguous load provenance without assigning it to a leaf', () => {
    const doc = read(PRODUCTION_203_WELDED_LOAD);
    expect(doc.groups[0]).toMatchObject({
      label: 'BCD',
      mass: { mass: 7.25, inertia: 0.375 },
      presentation: { fill: '#26a69a' },
    });
    const group = doc.groups[0],
      body = doc.bodies.find((b) => b.id === group.frameBody)!;
    expect(localToWorld(body.pose, group.mass!.center!.point)).toEqual({ x: 2, y: 0.75 });
    expect(doc.forces[0].legacyGroupScope!.members.map((m) => m.bodyId)).toEqual(group.members);
    expect(doc.forces[0].vector).toEqual({ x: 0, y: -10 });
    expect(
      doc.bodies.filter((b) => b.kind === 'material').every((b) => b.mass.mass.value === 1)
    ).toBe(true);
  });
  it('rejects sealed/floating or non-grounded prismatic development data, corruption and unknown versions', () => {
    const decoder = new StringTranscoder();
    decoder.decodeURL(PRODUCTION_203_PAYLOADS.Slider_Crank);
    decoder.getJoints().find((j) => j.id === 'D')!.isGrounded = false;
    expect(readLegacyProduction(decoder.encodeURL())).toMatchObject({
      ok: false,
      reason: 'unsupported-production',
    });
    expect(readBodyDocument('pmks9:anything')).toMatchObject({ ok: false });
    expect(readLegacyProduction(PRODUCTION_203_PAYLOADS['4-Bar'].slice(0, -1))).toMatchObject({
      ok: false,
    });
    const bad = PRODUCTION_203_PAYLOADS['4-Bar'].replace('0mv', '0?v');
    expect(readLegacyProduction(bad).ok).toBe(false);
    expect(readLegacyProduction('x'.repeat(1024 * 1024 + 1))).toMatchObject({
      ok: false,
      reason: 'too-large',
    });
  });
  it('refuses partial deletion of an ambiguous aggregate load even when the deleted leaf carries its reference frame', () => {
    for (const reverse of [false, true]) {
      const doc = read(PRODUCTION_203_WELDED_LOAD),
        load = doc.forces[0];
      const a = new BodyDocumentAuthority(
        reverse
          ? { ...doc, bodies: [...doc.bodies].reverse(), joints: [...doc.joints].reverse() }
          : doc
      );
      const result = a.commit(
        {
          id: 'partial',
          operations: [
            { kind: 'reset-group-mass', member: load.bodyId },
            { kind: 'delete', targets: [{ kind: 'body', id: load.bodyId }] },
          ],
        },
        NATIVE_EDIT_CONTEXT.state
      );
      expect(result).toMatchObject({ ok: false, code: 'ambiguous-load-owner' });
      expect(a.document.forces).toEqual([load]);
      expect(a.undoDepth).toBe(0);
    }
  });
  it('rejects shared or orphaned subset membership instead of depending on enumeration', () => {
    const decoder = new StringTranscoder();
    decoder.decodeURL(PRODUCTION_203_WELDED_LOAD);
    decoder
      .getLinks()
      .find((l) => l.id === 'BCD')!
      .subsetLinkIDs.push('AB');
    expect(readLegacyProduction(decoder.encodeURL()).ok).toBe(false);
  });
});
