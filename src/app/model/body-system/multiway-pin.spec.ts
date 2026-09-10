import { BodyFactory } from './body-factory';
import { BodyId } from './body-id';
import { validateBodyDocument } from './body-validation';
import { compileWeldGroups } from './weld-groups';

describe('native multiway pin', () => {
  it('persists a hub and binary pairs, leaving a third member pinned after a pair weld', () => {
    const f = new BodyFactory();
    const ids = [0, 1, 2].map((i) =>
      f.body('same label', { x: i, y: 0, angle: i * 0.4 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    );
    const junction = f.junction(ids, { x: 0.3, y: 0.7 });
    expect(junction.joints.length).toBe(2);
    expect(validateBodyDocument(f.document)).toEqual([]);
    const weld = f.joint('weld', junction.attachments[0], junction.attachments[1]);
    const first = junction.joints[0];
    const document = {
      ...f.document,
      joints: f.document.joints.filter((joint) => joint.id !== first),
      junctions: [{ ...junction, joints: [weld.id, junction.joints[1]] }],
    };
    expect(validateBodyDocument(document)).toEqual([]);
    const groups = compileWeldGroups(document);
    if (!groups.ok) throw new Error(groups.code);
    expect(groups.groupOf.get(ids[0])).toBe(groups.groupOf.get(ids[1]));
    expect(groups.groupOf.get(ids[0])).not.toBe(groups.groupOf.get(ids[2]));
    expect(document.bodies.length).toBe(4);
    expect(
      validateBodyDocument({
        ...document,
        bodies: [...document.bodies].reverse(),
        joints: [...document.joints].reverse(),
        attachments: [...document.attachments].reverse(),
      })
    ).toEqual([]);
  });

  it('does not change the candidate when a pin references a missing member', () => {
    const f = new BodyFactory();
    const id = f.body('member', { x: 0, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const before = f.document;
    expect(() => f.junction([id, 'missing' as BodyId], { x: 0, y: 0 })).toThrow();
    expect(f.document).toBe(before);
  });

  it('rejects a bundle with a duplicate pair and a disconnected member', () => {
    const f = new BodyFactory();
    const ids = [0, 1, 2].map((i) =>
      f.body(String(i), { x: i, y: 0, angle: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    );
    const junction = f.junction(ids, { x: 0, y: 0 });
    const document = {
      ...f.document,
      junctions: [{ ...junction, joints: [junction.joints[0], junction.joints[0]] }],
    };
    expect(validateBodyDocument(document).some((issue) => issue.code === 'invalid-pin-tree')).toBe(
      true
    );
  });
});
