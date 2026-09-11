import { createBodyCylinder } from './cylinder-factory';
import { emptyBodyDocument } from './body-document';
import {
  nativeThreeCylinders,
  executeNativeEdit,
  NATIVE_EDIT_CONTEXT,
  insertNativeFixture,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { planBodyEdit } from './body-edit-plan';
import { refuseNativeJointChange } from './joint-permission';
import { newRecordId, WORLD } from './body-id';
import { compileWeldFrames } from './weld-frames';
import { reverseJoint } from './reverse-joint';
import { BodyFactory } from './body-factory';

describe('native joint permission boundary', () => {
  it('welds one external pair at a three-cylinder mount without absorbing the third', () => {
    const fixture = nativeThreeCylinders();
    for (const id of fixture.pin.joints) {
      expect(refuseNativeJointChange(fixture.document, id)).toBeUndefined();
      const result = executeNativeEdit(fixture.document, [
        { kind: 'joint-kind', jointId: id, jointKind: 'weld' },
      ]);
      const joint = result.joints.find((item) => item.id === id)!,
        frames = compileWeldFrames(result);
      if (!frames.ok) throw new Error(frames.code);
      const third = fixture.cylinders.find(
        (assembly) => ![joint.bodyA, joint.bodyB].includes(assembly.barrel)
      )!;
      expect(frames.groupOf.get(joint.bodyA)).toBe(frames.groupOf.get(joint.bodyB));
      expect(frames.groupOf.get(third.barrel)).not.toBe(frames.groupOf.get(joint.bodyA));
      expect(
        result.joints.filter(
          (item) => fixture.pin.joints.includes(item.id) && item.kind === 'revolute'
        )
      ).toHaveLength(1);
    }
  });
  it('unwelds the selected pair at the same shared pin without replacing its attachment identity', () => {
    const fixture = nativeThreeCylinders(),
      jointId = fixture.pin.joints[0];
    const welded = executeNativeEdit(fixture.document, [
      { kind: 'joint-kind', jointId, jointKind: 'weld' },
    ]);
    const restored = executeNativeEdit(welded, [
      { kind: 'joint-kind', jointId, jointKind: 'revolute', worldPoint: { x: 0, y: 0 } },
    ]);
    expect(restored.attachments).toHaveLength(fixture.document.attachments.length);
    expect(restored.junctions).toHaveLength(1);
    expect(restored.junctions[0].id).toBe(fixture.pin.id);
    expect(new Set(restored.junctions[0].attachments)).toEqual(new Set(fixture.pin.attachments));
    expect(restored.junctions[0].joints).toHaveLength(2);
  });

  it('allows a consistent rigid cylinder but refuses locking a nonzero internal drive into that group', () => {
    const cylinder = createBodyCylinder(
      emptyBodyDocument(),
      { x: 0, y: 0, angle: 0.4 },
      { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
      0.4
    );
    const f = new BodyFactory(cylinder.document),
      weld = f.joint('weld', cylinder.assembly.barrelMount, cylinder.assembly.rodMount);
    const operation = { kind: 'insert' as const, records: { joints: [weld] } };
    expect(
      planBodyEdit(
        cylinder.document,
        0,
        { id: 'static', operations: [operation] },
        NATIVE_EDIT_CONTEXT
      ).ok
    ).toBe(true);
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: cylinder.assembly.internalJoint, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0.4, speed: 0.2 },
    };
    const source = insertNativeFixture({ ...cylinder.document, drivers: [driver] });
    expect(
      planBodyEdit(source, 0, { id: 'driven', operations: [operation] }, NATIVE_EDIT_CONTEXT)
    ).toMatchObject({ ok: false, code: 'drive-in-rigid-group' });
  });

  it('protects internal P and individual assembly members through the same planning boundary', () => {
    const fixture = nativeThreeCylinders(),
      assembly = fixture.cylinders[0];
    const refused = refuseNativeJointChange(fixture.document, assembly.internalJoint);
    expect(refused).toMatchObject({ ok: false, code: 'assembly-interior' });
    expect(
      planBodyEdit(
        fixture.document,
        0,
        {
          id: 'interior',
          operations: [{ kind: 'joint-kind', jointId: assembly.internalJoint, jointKind: 'weld' }],
        },
        NATIVE_EDIT_CONTEXT
      )
    ).toEqual(refused);
    expect(
      planBodyEdit(
        fixture.document,
        0,
        {
          id: 'member',
          operations: [{ kind: 'delete', targets: [{ kind: 'body', id: assembly.barrel }] }],
        },
        NATIVE_EDIT_CONTEXT
      )
    ).toMatchObject({ ok: false, code: 'assembly-member' });
  });
  it('retains a travel coordinate and requires explicit removal when its coordinate disappears', () => {
    const fixture = nativeObliqueCylinder(),
      guide = fixture.document.joints.find(
        (joint) => joint.kind === 'prismatic' && joint.bodyA === WORLD
      )!;
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: guide.id, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 0.1 },
    };
    const document = insertNativeFixture({ ...fixture.document, drivers: [driver] });
    const slot = executeNativeEdit(document, [
      { kind: 'joint-kind', jointId: guide.id, jointKind: 'pin-in-slot' },
    ]);
    expect(slot.drivers).toEqual([driver]);
    const command = {
      id: 'weld',
      operations: [{ kind: 'joint-kind' as const, jointId: guide.id, jointKind: 'weld' as const }],
    };
    expect(planBodyEdit(document, 0, command, NATIVE_EDIT_CONTEXT)).toMatchObject({
      ok: false,
      code: 'coordinate-in-use',
    });
    const welded = executeNativeEdit(document, [
      { ...command.operations[0], removeCoordinates: true },
    ]);
    expect(welded.drivers).toEqual([]);
  });
  it('keeps the actual guide owner when a reversed P becomes a slot and maps its input sign', () => {
    const f = new BodyFactory();
    const carrier = f.body('guide', { x: 0, y: 0, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    const rider = f.body('rider', { x: Math.cos(0.4), y: Math.sin(0.4), angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const guide = f.joint(
      'prismatic',
      f.attachment(carrier, { x: 0, y: 0 }),
      f.attachment(rider, { x: 0, y: 0 }),
      0.4
    );
    if (guide.kind !== 'prismatic') throw new Error('Expected P');
    const visible = {
      ...guide,
      guideDisplay: { bodyId: carrier, frame: guide.frameA, from: -1, to: 3 },
    };
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: guide.id, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: -0.2 },
    };
    const document = insertNativeFixture({
      ...f.document,
      joints: [reverseJoint(visible)],
      drivers: [driver],
    });
    const result = executeNativeEdit(document, [
      { kind: 'joint-kind', jointId: guide.id, jointKind: 'pin-in-slot' },
    ]);
    const slot = result.joints[0];
    expect(slot.bodyA).toBe(carrier);
    expect(result.drivers[0].profile.speed).toBe(0.2);
    expect(result.bodies).toEqual(document.bodies);
  });
});
