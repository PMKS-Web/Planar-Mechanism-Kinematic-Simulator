import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument, emptyBodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { createBodyCylinder } from './cylinder-factory';
import { localToWorld, rotate } from './body-frame';
import { WORLD } from './body-id';
import { GuidedJoint } from './joint-record';
import { SI_UNITS } from './body-units';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const state = NATIVE_EDIT_CONTEXT.state;
function mark(document: BodyDocument, joint: GuidedJoint) {
  const guide = joint.guideDisplay!;
  const origin = document.attachments.find((a) => a.id === guide.frame.attachmentId)!.point;
  const offset = rotate({ x: guide.station ?? 0, y: guide.normalOffset ?? 0 }, guide.frame.angle);
  return localToWorld(document.bodies.find((b) => b.id === guide.bodyId)!.pose, {
    x: origin.x + offset.x,
    y: origin.y + offset.y,
  });
}
function roundTrip(document: BodyDocument) {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(encoded.reason);
  const decoded = decodeBodyDocument(encoded.payload);
  if (!decoded.ok) throw new Error(decoded.reason);
  expect(encodeBodyDocument(decoded.document)).toEqual(encoded);
}

describe('native guide artwork stations', () => {
  it('rotates the entire artwork offset without moving its locked, traced attachment', () => {
    const f = nativeLinearCarriage(),
      factory = new BodyFactory(f.document);
    const offset = rotate({ x: 2, y: 0.5 }, 0.4);
    const origin = factory.attachment(WORLD, { x: 2 + offset.x, y: -1 + offset.y });
    const joint: GuidedJoint = {
      ...(f.guide as GuidedJoint),
      guideDisplay: {
        bodyId: WORLD,
        frame: { attachmentId: origin, angle: 0.4 },
        station: 0.3,
        normalOffset: 0.2,
        from: -0.2,
        to: 0.4,
      },
    };
    const source: BodyDocument = {
      ...factory.document,
      joints: [joint],
      locks: [origin],
      attachments: factory.document.attachments.map((a) =>
        a.id === origin ? { ...a, trace: true } : a
      ),
    };
    const a = new BodyDocumentAuthority(source);
    const changed = a.commit(
      { id: 'axis', operations: [{ kind: 'guide-axis', jointId: joint.id, worldAxis: 1.1 }] },
      state
    );
    if (!changed.ok) throw new Error(JSON.stringify(changed));
    const guide = a.document.joints[0] as GuidedJoint;
    expect(a.document.attachments).toEqual(source.attachments);
    expect(a.document.locks).toEqual(source.locks);
    expect(guide.guideDisplay!.frame.attachmentId).toBe(joint.frameA.attachmentId);
    expect(guide.guideDisplay!.station).toBeCloseTo(2.3, 12);
    expect(guide.guideDisplay!.normalOffset).toBeCloseTo(0.7, 12);
    expect(guide.guideDisplay!.from).toBeCloseTo(1.8, 12);
    expect(guide.guideDisplay!.to).toBeCloseTo(2.4, 12);
    const world = mark(a.document, guide);
    expect(world.x).toBeCloseTo(2 + 2.3 * Math.cos(1.1) - 0.7 * Math.sin(1.1), 12);
    expect(world.y).toBeCloseTo(-1 + 2.3 * Math.sin(1.1) + 0.7 * Math.cos(1.1), 12);
    roundTrip(a.document);
    expect(
      a.commit(
        {
          id: 'units',
          operations: [{ kind: 'convert-units', units: { ...SI_UNITS, length: 'cm' } }],
        },
        state
      ).ok
    ).toBe(true);
    const converted = a.document.joints[0] as GuidedJoint;
    const cm = mark(a.document, converted);
    expect(cm.x).toBeCloseTo(world.x * 100, 10);
    expect(cm.y).toBeCloseTo(world.y * 100, 10);
    expect(converted.guideDisplay!.from).toBeCloseTo(180, 10);
    expect(converted.guideDisplay!.to).toBeCloseTo(240, 10);
    roundTrip(a.document);
    a.undo(state);
    a.undo(state);
    expect(a.document).toEqual(source);
  });
  it('keeps the cylinder P mark at the barrel mouth throughout travel and unit conversion', () => {
    for (const travel of [0, 0.4, 1.5]) {
      const origin = { x: 1, y: -2, angle: 0.7 };
      const c = createBodyCylinder(
        emptyBodyDocument(),
        origin,
        { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
        travel
      );
      const a = new BodyDocumentAuthority(c.document);
      const joint = a.document.joints[0] as GuidedJoint;
      const mouth = mark(a.document, joint);
      expect(mouth.x).toBeCloseTo(1 + 3 * Math.cos(0.7), 12);
      expect(mouth.y).toBeCloseTo(-2 + 3 * Math.sin(0.7), 12);
      expect(joint.guideDisplay!.bodyId).toBe(c.assembly.barrel);
      expect(
        a.commit(
          {
            id: 'units',
            operations: [{ kind: 'convert-units', units: { ...SI_UNITS, length: 'cm' } }],
          },
          state
        ).ok
      ).toBe(true);
      const cm = mark(a.document, a.document.joints[0] as GuidedJoint);
      expect(cm.x).toBeCloseTo(mouth.x * 100, 10);
      expect(cm.y).toBeCloseTo(mouth.y * 100, 10);
      roundTrip(a.document);
    }
  });
});
