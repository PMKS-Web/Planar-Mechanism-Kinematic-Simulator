import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { compose, localToWorld, rotate } from './body-frame';
import { newRecordId } from './body-id';
import { validateBodyDocument } from './body-validation';
import { captureLoadScope } from './load-provenance';
import { rebaseBody } from './rebase-body';
import { compileWeldFrames } from './weld-frames';

describe('imported group-load provenance', () => {
  function fixture() {
    const f = new BodyFactory();
    const ids = [0, 1, 2].map((i) =>
      f.body(String(i), { x: 2 * i, y: i, angle: 0.4 * i }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    );
    const anchors = ids.map((id) => f.attachment(id, { x: 0, y: 0 }));
    f.joint('weld', anchors[0], anchors[1]);
    f.joint('weld', anchors[1], anchors[2]);
    const compiled = compileWeldFrames(f.document);
    if (!compiled.ok) throw new Error(compiled.code);
    const force = {
      id: newRecordId<'force'>(),
      bodyId: ids[1],
      point: { x: 3, y: -2 },
      vector: { x: 5, y: 7 },
      frame: 'body' as const,
      couple: -3,
      label: '',
      legacyGroupScope: captureLoadScope(compiled.groupOf.get(ids[1])!, ids[1], ids),
    };
    const document: BodyDocument = { ...f.document, forces: [force] };
    return { document, ids };
  }

  function worldLoad(document: BodyDocument) {
    const force = document.forces[0];
    const pose = document.bodies.find((body) => body.id === force.bodyId)!.pose;
    return { point: localToWorld(pose, force.point), vector: rotate(force.vector, pose.angle) };
  }

  it('preserves each scoped frame and the world wrench through every member rebase order', () => {
    const { document, ids } = fixture();
    const before = JSON.stringify(document);
    for (const order of [ids, [...ids].reverse(), [ids[1], ids[0], ids[2]]]) {
      let changed = document;
      for (const id of order) {
        changed = rebaseBody(changed, id, { x: 4, y: -7, angle: 4 * Math.PI + 0.8 });
        expect(validateBodyDocument(changed)).toEqual([]);
        const expected = worldLoad(document);
        const actual = worldLoad(changed);
        for (const part of ['point', 'vector'] as const)
          for (const axis of ['x', 'y'] as const)
            expect(actual[part][axis]).toBeCloseTo(expected[part][axis], 10);
      }
    }
    expect(JSON.stringify(document)).toBe(before);
  });

  it('allows a global rigid motion and enumeration changes but rejects translation or angle reshaping', () => {
    const { document } = fixture();
    const moved = {
      ...document,
      bodies: document.bodies
        .map((body) =>
          body.kind === 'world'
            ? body
            : {
                ...body,
                pose: compose({ x: 15, y: -9, angle: 2 * Math.PI + 0.3 }, body.pose),
              }
        )
        .reverse(),
      joints: [...document.joints].reverse(),
    };
    expect(validateBodyDocument(moved)).toEqual([]);
    for (const delta of [
      { x: 1, y: 0, angle: 0 },
      { x: 0, y: 0, angle: 0.3 },
    ]) {
      const reshaped = {
        ...document,
        joints: document.joints.map((joint, i) =>
          joint.kind !== 'weld' || i !== 0 ? joint : { ...joint, rest: compose(joint.rest, delta) }
        ),
      };
      expect(
        validateBodyDocument(reshaped).some((issue) => issue.code === 'load-scope-changed')
      ).toBe(true);
    }
  });

  it('reports scope changes alongside unrelated bad limits and material properties', () => {
    const { document } = fixture();
    const changed: BodyDocument = {
      ...document,
      joints: [],
      limits: [
        {
          id: newRecordId<'limit'>(),
          coordinate: { jointId: newRecordId<'joint'>(), coordinate: 'travel' },
          lower: 2,
          upper: 1,
        },
      ],
      bodies: document.bodies.map((body) =>
        body.kind === 'world'
          ? body
          : {
              ...body,
              mass: { ...body.mass, mass: { mode: 'explicit', value: -1 } },
            }
      ),
    };
    const codes = validateBodyDocument(changed).map((issue) => issue.code);
    expect(codes).toContain('invalid-limit');
    expect(codes).toContain('invalid-mass');
    expect(codes).toContain('split-load-scope');
  });
});
