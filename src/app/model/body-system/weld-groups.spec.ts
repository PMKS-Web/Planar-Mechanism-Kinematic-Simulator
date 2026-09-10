import { BodyFactory } from './body-factory';
import { compileWeldGroups } from './weld-groups';
import { BodyId, WORLD } from './body-id';

describe('native weld groups', () => {
  it('chooses its derived frame by code-point order, independent of display labels and locale', () => {
    const { f, bodies } = fixture();
    const mapped = new Map(bodies.map((id, i) => [id, ['a', 'Z', '_'][i] as BodyId]));
    const map = (id: BodyId) => mapped.get(id) ?? id;
    const document = {
      ...f.document,
      bodies: f.document.bodies.map((body) => ({ ...body, id: map(body.id) })),
      attachments: f.document.attachments.map((anchor) => ({
        ...anchor,
        bodyId: map(anchor.bodyId),
      })),
      joints: f.document.joints.map((joint) => ({
        ...joint,
        bodyA: map(joint.bodyA),
        bodyB: map(joint.bodyB),
      })),
    };
    const result = compileWeldGroups(document);
    if (!result.ok) throw new Error(result.code);
    expect(result.groupOf.get('a' as BodyId)!.frameBody).toBe('Z');
  });
  function fixture() {
    const f = new BodyFactory();
    const bodies = [0, 1, 2].map((i) =>
      f.body(String(i), { x: i * 2, y: i, angle: i * 0.2 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    );
    const anchors = bodies.map((id) => f.attachment(id, { x: 0, y: 0 }));
    f.joint('weld', anchors[0], anchors[1]);
    f.joint('weld', anchors[1], anchors[2]);
    const cycle = f.joint('weld', anchors[2], anchors[0]);
    return { f, bodies, anchors, cycle };
  }

  it('keeps free and one-connection material, and only welds fix a body to WORLD', () => {
    for (const kind of ['revolute', 'prismatic', 'weld'] as const) {
      const f = new BodyFactory();
      const b = f.body('single', { x: 0, y: 0, angle: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      const loose = f.body('loose', { x: 4, y: 0, angle: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      f.joint(kind, f.attachment(WORLD, { x: 0, y: 0 }), f.attachment(b, { x: 0, y: 0 }));
      const compiled = compileWeldGroups(f.document);
      if (!compiled.ok) throw new Error(compiled.code);
      expect(compiled.groupOf.get(b)!.fixed).toBe(kind === 'weld');
      expect(compiled.groupOf.get(loose)!.members.size).toBe(1);
      expect(f.document.bodies.length).toBe(3);
    }
  });

  it('checks redundant cycles and is independent of body, joint and attachment enumeration', () => {
    const { f, bodies } = fixture();
    const before = compileWeldGroups(f.document);
    const after = compileWeldGroups({
      ...f.document,
      bodies: [...f.document.bodies].reverse(),
      joints: [...f.document.joints].reverse(),
      attachments: [...f.document.attachments].reverse(),
    });
    expect(after).toEqual(before);
    if (!before.ok) throw new Error(before.code);
    expect(before.groupOf.get(bodies[0])!.members.size).toBe(3);
    expect(f.document.bodies.length).toBe(4);
  });

  it('refuses incompatible translations and directed angles around a weld cycle', () => {
    const { f, cycle } = fixture();
    for (const patch of [{ x: 0.1 }, { angle: Math.PI }]) {
      const document = {
        ...f.document,
        joints: f.document.joints.map((joint) =>
          joint.id !== cycle.id || joint.kind !== 'weld'
            ? joint
            : { ...joint, rest: { ...joint.rest, ...patch } }
        ),
      };
      expect(compileWeldGroups(document)).toMatchObject({ ok: false, code: 'weld-cycle' });
    }
  });
});
