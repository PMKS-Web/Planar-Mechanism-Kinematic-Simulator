import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { newRecordId, WORLD } from './body-id';
import { compileBodyDocument } from './constraint-compiler';
import { bodyMobility } from './body-mobility';
import { createBodySolveFrame } from './body-solve-frame';
import { admitBodyPartition } from './body-admission';

function compiled(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.system;
}
function mobility(document: BodyDocument) {
  const system = compiled(document),
    partition = system.partitions[0];
  const frame = createBodySolveFrame(
    partition,
    new Map([...system.groups].map(([id, group]) => [id, group.pose]))
  );
  return bodyMobility(frame.partition, frame.initialPoses);
}

describe('native mobility and admission', () => {
  it('counts a regular four-bar and a redundant duplicate by independent constraints', () => {
    const { document, bJoint } = nativeFourBar();
    for (const input of [
      document,
      { ...document, joints: [...document.joints, { ...bJoint, id: newRecordId<'joint'>() }] },
    ]) {
      expect(mobility(input)).toMatchObject({ dof: 1, infinitesimal: 1 });
      const system = compiled(input);
      expect(admitBodyPartition(system, system.partitions[0]).ok).toBe(true);
    }
  });

  it('does not count the infinitesimal bend of two stretched rods as a real freedom', () => {
    const f = new BodyFactory();
    const a = f.body('first', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const b = f.body('second', { x: 1, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const input = f.joint(
      'revolute',
      f.attachment(WORLD, { x: 0, y: 0 }),
      f.attachment(a, { x: 0, y: 0 })
    );
    f.joint('revolute', f.attachment(a, { x: 1, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
    f.joint('revolute', f.attachment(b, { x: 1, y: 0 }), f.attachment(WORLD, { x: 2, y: 0 }));
    const document: BodyDocument = {
      ...f.document,
      drivers: [
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: input.id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: 1 },
        },
      ],
    };
    expect(mobility(document)).toMatchObject({ infinitesimal: 1, dof: 0, status: 'isolated' });
    const system = compiled(document);
    expect(admitBodyPartition(system, system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'immobile',
    });
  });

  it('keeps unconnected geometry and reports its three freedoms', () => {
    const f = new BodyFactory();
    f.body('loose', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ]);
    expect(mobility(f.document)).toMatchObject({ dof: 3, status: 'regular' });
    expect(f.document.bodies.length).toBe(2);
  });
});
