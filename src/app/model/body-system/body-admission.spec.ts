import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition, fixedBodyAdmission } from './body-admission';
import { BodyJoint } from './joint-record';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';

function compiled(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.system;
}
function driver(joint: BodyJoint, coordinate: 'angle' | 'travel') {
  return {
    id: newRecordId<'driver'>(),
    coordinate: { jointId: joint.id, coordinate },
    profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
  };
}
function guided(kind: 'prismatic' | 'pin-in-slot') {
  const f = new BodyFactory();
  const id = f.body('block', { x: 0, y: 0, angle: 0.3 }, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const guide = f.attachment(WORLD, { x: 0, y: 0 });
  const block = f.attachment(id, { x: 0, y: 0 });
  const joint = f.joint(kind, guide, block, 0.7);
  return { f, id, joint, guide, block };
}

describe('native solver admission boundaries', () => {
  it('distinguishes P guidance from the extra rotation left by a pin-in-slot', () => {
    for (const kind of ['prismatic', 'pin-in-slot'] as const) {
      const { f, joint } = guided(kind);
      const system = compiled({ ...f.document, drivers: [driver(joint, 'travel')] });
      const result = admitBodyPartition(system, system.partitions[0]);
      if (kind === 'prismatic') expect(result.ok).toBe(true);
      else
        expect(result).toMatchObject({
          ok: false,
          reason: 'underconstrained',
          mobility: { dof: 2 },
        });
    }
  });

  it('does not discard a frozen internal drive or passive travel limit', () => {
    const { f, joint, guide, block } = guided('prismatic');
    f.joint('weld', guide, block);
    const driven = compiled({ ...f.document, drivers: [driver(joint, 'travel')] });
    expect(driven.partitions).toEqual([]);
    expect(fixedBodyAdmission(driven)).toBe('fixed-drive');
    const stopped = compiled({
      ...f.document,
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: joint.id, coordinate: 'travel' },
          lower: 1,
          upper: 2,
        },
      ],
    });
    expect(fixedBodyAdmission(stopped)).toBe('travel');
    const matching = compiled({
      ...f.document,
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: joint.id, coordinate: 'travel' },
          lower: -1,
          upper: 1,
        },
      ],
    });
    expect(fixedBodyAdmission(matching)).toBeUndefined();
  });

  it('refuses an internal drive that does not control the surrounding moving compound', () => {
    const f = new BodyFactory();
    const a = f.body('first', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('second', { x: 1, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const aa = f.attachment(a, { x: 1, y: 0 }),
      ab = f.attachment(b, { x: 0, y: 0 });
    const internal = f.joint('revolute', aa, ab);
    f.joint('weld', aa, ab);
    f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), f.attachment(a, { x: 0, y: 0 }));
    const system = compiled({ ...f.document, drivers: [driver(internal, 'angle')] });
    expect(admitBodyPartition(system, system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'drive-does-not-control-motion',
    });
  });

  it('does not project a genuinely inconsistent start into a convenient valid drawing', () => {
    const { document } = nativeFourBar();
    const broken = {
      ...document,
      bodies: document.bodies.map((body, i) =>
        body.kind === 'world' || i !== 1
          ? body
          : {
              ...body,
              pose: { ...body.pose, y: body.pose.y + 0.01 },
            }
      ),
    };
    const system = compiled(broken);
    expect(admitBodyPartition(system, system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'inconsistent',
    });
  });

  it('admits and advances the same mechanism after a distant world translation', () => {
    const { document } = nativeFourBar();
    const offset = 1e9;
    const translated = {
      ...document,
      bodies: document.bodies.map((body) =>
        body.kind === 'world' ? body : { ...body, pose: { ...body.pose, x: body.pose.x + offset } }
      ),
      attachments: document.attachments.map((anchor) =>
        anchor.bodyId !== WORLD
          ? anchor
          : { ...anchor, point: { ...anchor.point, x: anchor.point.x + offset } }
      ),
    };
    const system = compiled(translated),
      result = admitBodyPartition(system, system.partitions[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const state = initialBodyContinuation(result);
    expect(advanceBodyCommand(result, state, 0.4).ok).toBe(true);
    expect(result.frame.inputPrecision).toBeLessThan(1e-5);
  });
});
