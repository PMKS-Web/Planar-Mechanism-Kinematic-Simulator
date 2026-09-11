import { nativeUnitFixture } from '../../../test-utils/verification/native-unit-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import {
  nativeThreeCylinders,
  NATIVE_EDIT_CONTEXT,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { BodyId, WORLD } from './body-id';
import { BodyCopyOperation, planBodyCopy } from './body-copy-edit';
import { MaterialBody } from './material-body';
import { canonicalBodyDocument } from '../../services/transcoding/body-document-canonical';
import { bodyGroupPresentation } from './body-group-presentation';
import { compileWeldFrames } from './weld-frames';
import { validateBodyEditDocument } from './body-edit-validation';
import { menuRefusal } from '../edit-permission';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const state = NATIVE_EDIT_CONTEXT.state;
const offset = { x: 7, y: -4 };
function copy(source: BodyDocument, bodyIds: readonly BodyId[], includeGround = true) {
  const operation: BodyCopyOperation = { kind: 'copy-bodies', bodyIds, includeGround, offset };
  const planned = planBodyCopy(source, operation, 'copy:0');
  if (!planned.ok) throw new Error(JSON.stringify(planned));
  const authority = new BodyDocumentAuthority(source);
  const result = authority.commit({ id: 'copy', operations: [operation] }, state);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return { authority, ids: planned.ids, document: authority.document };
}
function reopen(document: BodyDocument) {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  const decoded = decodeBodyDocument(encoded.payload);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  return decoded.document;
}
describe('native copy identity and lifecycle', () => {
  it('copies locked fabrication, mass references, load scope and holds without touching the source or synthesis ownership', () => {
    const f = nativeUnitFixture();
    const { authority: a, ids, document: d } = copy(f.document, [f.body, f.bracket]);
    for (const body of f.document.bodies)
      expect(d.bodies.find((item) => item.id === body.id)).toEqual(body);
    expect(d.synthesis).toEqual(f.document.synthesis);
    expect(d.view).toEqual(f.document.view);
    const bracket = d.bodies.find((body) => body.id === ids.bodies.get(f.bracket))! as MaterialBody;
    const original = f.document.bodies.find((body) => body.id === f.bracket)! as MaterialBody;
    expect(bracket.pose).toEqual({
      ...original.pose,
      x: original.pose.x + 7,
      y: original.pose.y - 4,
    });
    expect(bracket.locked).toBe(true);
    expect(bracket.mass.inertia).toEqual(original.mass.inertia);
    if (bracket.mass.center.mode !== 'explicit' || original.mass.center.mode !== 'explicit')
      throw new Error('Expected custom center');
    expect(bracket.mass.center.point).toEqual(original.mass.center.point);
    expect(bracket.mass.center.editAnchor).toEqual({
      attachmentId: ids.attachments.get(f.weld.frameB.attachmentId),
    });
    expect(bracket.mass.center.editAxis).toEqual(
      original.mass.center.editAxis!.map((id) => ids.vertices.get(f.bracket)!.get(id))
    );
    const group = d.groups.find((g) => g.members.includes(bracket.id))!;
    expect(group.mass!.center!.editAnchor).toEqual({ attachmentId: ids.attachments.get(f.tip) });
    expect(group.mass!.mass).toBe(7);
    const force = d.forces.find((item) => item.id === ids.forces.get(f.document.forces[0].id))!;
    expect(force.bodyId).toBe(ids.bodies.get(f.bracket));
    expect(force.locked).toBe(true);
    expect(force.vector).toEqual({ x: 0, y: -10 });
    expect(force.couple).toBe(3);
    expect(force.legacyGroupScope!.members.map((m) => m.bodyId).sort()).toEqual(
      [ids.bodies.get(f.body), ids.bodies.get(f.bracket)].sort()
    );
    expect(d.holds[1]).toEqual({
      ...d.holds[0],
      bodyId: ids.bodies.get(f.body),
      from: ids.attachments.get(d.holds[0].from),
      to: ids.attachments.get(f.tip),
    });
    expect(d.locks).toContain(ids.attachments.get(f.tip));
    expect(a.local.selection.map((item) => ('id' in item ? item.id : '')).sort()).toEqual(
      [ids.bodies.get(f.body), ids.bodies.get(f.bracket)].sort()
    );
    expect(canonicalBodyDocument(reopen(d))).toBe(canonicalBodyDocument(d));
    expect(a.undo(state).ok).toBe(true);
    expect(a.document).toEqual(f.document);
    expect(a.redo(state).ok).toBe(true);
    expect(a.document).toEqual(d);
    const removed = a.commit(
      {
        id: 'delete-copy',
        operations: [{ kind: 'delete', targets: [{ kind: 'group', members: group.members }] }],
      },
      state
    );
    expect(removed.ok).toBe(true);
    expect(a.document.forces).toEqual(f.document.forces);
    for (const body of f.document.bodies)
      expect(a.document.bodies.find((item) => item.id === body.id)).toEqual(body);
  });
  it('closes cylinder ownership, retains stroke/drive IDs and leaves an unselected welded bracket outside the copy', () => {
    const f = nativeAxialCarriage('weld');
    const { authority: a, ids, document: d } = copy(f.document, [f.assembly.rod]);
    expect(ids.bodies.has(f.carriage)).toBe(false);
    const cylinder = d.assemblies.find((item) => item.id === ids.assemblies.get(f.assembly.id))!;
    expect(cylinder.rod).toBe(ids.bodies.get(f.assembly.rod));
    expect(cylinder.barrel).toBe(ids.bodies.get(f.assembly.barrel));
    expect(cylinder.dimensions).toEqual(f.assembly.dimensions);
    expect(d.limits.find((item) => item.id === cylinder.strokeLimit)!.coordinate.jointId).toBe(
      cylinder.internalJoint
    );
    expect(
      d.drivers.find((item) => item.id === ids.drivers.get(f.driver.id))!.coordinate.jointId
    ).toBe(cylinder.internalJoint);
    expect(a.local.selection).toEqual([{ kind: 'assembly', id: cylinder.id }]);
    expect(canonicalBodyDocument(reopen(d))).toBe(canonicalBodyDocument(d));
    expect(
      a.commit(
        {
          id: 'remove',
          operations: [{ kind: 'delete', targets: [{ kind: 'assembly', id: cylinder.id }] }],
        },
        state
      ).ok
    ).toBe(true);
    expect(a.document.assemblies).toEqual(f.document.assemblies);
    expect(a.document.drivers).toEqual(f.document.drivers);
    expect(a.document.bodies).toEqual(f.document.bodies);
  });
  it('preserves a copied pin through an omitted hub and keeps identities independent of table and selection order', () => {
    const f = nativeThreeCylinders();
    const originalHub = f.document.attachments.find((point) => point.id === f.pin.hub)!.bodyId;
    const selected = f.cylinders.map((c) => c.barrel).filter((id) => id !== originalHub);
    const first = copy(f.document, selected, false);
    const reversed: BodyDocument = {
      ...f.document,
      bodies: [...f.document.bodies].reverse(),
      attachments: [...f.document.attachments].reverse(),
      joints: [...f.document.joints].reverse(),
      assemblies: [...f.document.assemblies].reverse(),
      limits: [...f.document.limits].reverse(),
    };
    const second = copy(reversed, [...selected].reverse(), false);
    const pin = first.document.junctions.find((item) => item.id !== f.pin.id)!;
    expect(pin.attachments.length).toBe(2);
    expect(pin.joints.length).toBe(1);
    const edge = first.document.joints.find((item) => item.id === pin.joints[0])!;
    expect(edge.kind).toBe('revolute');
    expect([edge.bodyA, edge.bodyB].sort()).toEqual(
      selected.map((id) => first.ids.bodies.get(id)).sort()
    );
    expect(second.document.joints.find((item) => item.id === edge.id)).toEqual(edge);
    for (const id of selected) expect(second.ids.bodies.get(id)).toBe(first.ids.bodies.get(id));
    expect(canonicalBodyDocument(reopen(first.document))).toBe(
      canonicalBodyDocument(first.document)
    );
  });
  it('copies deliberate ground connections to independent anchors in either weld order, or leaves the copy free', () => {
    for (const reversed of [false, true]) {
      const f = new BodyFactory();
      const body = f.body('Foundation', { x: 2, y: -1, angle: 0.7 }, [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]);
      const a = f.attachment(WORLD, { x: 3, y: 4 }),
        b = f.attachment(body, { x: 0.4, y: 0.2 });
      const weld = f.joint('weld', reversed ? b : a, reversed ? a : b);
      for (const includeGround of [true, false]) {
        const result = copy(f.document, [body], includeGround);
        const joint = result.document.joints.find((j) => j.id === result.ids.joints.get(weld.id));
        expect(!!joint).toBe(includeGround);
        expect(result.document.bodies.filter((item) => item.id === WORLD).length).toBe(1);
        if (includeGround) {
          const point = result.document.attachments.find(
            (p) => p.id === result.ids.attachments.get(a)
          )!;
          expect(point.bodyId).toBe(WORLD);
          expect(point.point).toEqual({ x: 10, y: 0 });
          expect(point.id).not.toBe(a);
          const groups = compileWeldFrames(result.document);
          if (!groups.ok) throw new Error(groups.code);
          expect(groups.groupOf.get(result.ids.bodies.get(body)!)!.members.has(WORLD)).toBe(true);
        }
        expect(validateBodyEditDocument(result.document)).toBeUndefined();
      }
    }
  });
  it('refuses partial aggregate and ambiguous imported ownership instead of dropping either, and rolls back a mixed batch', () => {
    const f = nativeUnitFixture();
    const operation: BodyCopyOperation = {
      kind: 'copy-bodies',
      bodyIds: [f.bracket],
      offset,
      includeGround: false,
    };
    const a = new BodyDocumentAuthority(f.document);
    const result = a.commit(
      {
        id: 'partial',
        operations: [
          { kind: 'body-properties', bodyId: f.body, change: { label: 'Must not survive' } },
          operation,
        ],
      },
      state
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('aggregate-properties');
    expect(a.document).toEqual(f.document);
    expect(a.undoDepth).toBe(0);
    const scope = planBodyCopy({ ...f.document, groups: [] }, operation, 'scope');
    expect(scope.ok).toBe(false);
    if (!scope.ok) expect(scope.code).toBe('ambiguous-load-owner');
    const playing = { ...state, playing: true };
    const refused = a.preview(
      { id: 'playing', operations: [{ ...operation, bodyIds: [f.body, f.bracket] }] },
      playing
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.permission).toEqual(menuRefusal(playing, 'start'));
  });
  it('keeps a copied pin bundle when another operation changes an original joint kind', () => {
    const f = nativeThreeCylinders();
    const a = new BodyDocumentAuthority(f.document);
    const result = a.commit(
      {
        id: 'mixed',
        operations: [
          {
            kind: 'copy-bodies',
            bodyIds: f.cylinders.map((c) => c.barrel),
            includeGround: false,
            offset,
          },
          { kind: 'joint-kind', jointId: f.pin.joints[0], jointKind: 'weld' },
        ],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(a.document.junctions.length).toBe(2);
    const copied = a.document.junctions.find((pin) => pin.id !== f.pin.id)!;
    expect(copied.attachments.length).toBe(3);
    expect(copied.joints.length).toBe(2);
  });
  it('copies an annotated grounded fabrication without duplicating its WORLD group annotation', () => {
    const f = new BodyFactory();
    const body = f.body('Base', { x: 0, y: 0, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    f.joint('weld', f.attachment(WORLD, { x: 0, y: 0 }), f.attachment(body, { x: 0, y: 0 }));
    const document: BodyDocument = {
      ...f.document,
      groups: [
        {
          members: [WORLD, body],
          frameBody: body,
          label: 'Foundation',
          presentation: { fill: '#ff1234', hidden: false, showCenter: true },
        },
      ],
    };
    const result = copy(document, [body]);
    expect(result.document.groups.length).toBe(1);
    expect(result.document.groups[0].presentation).toEqual(document.groups[0].presentation);
    expect(result.document.groups[0].members).toContain(result.ids.bodies.get(body));
  });
  it('remaps a floating guide display station and bound shape vertices rather than borrowing the original guide', () => {
    const f = new BodyFactory();
    const carrier = f.body('Guide', { x: 1, y: 2, angle: 0.4 }, [
      { x: -2, y: 0 },
      { x: 3, y: 0 },
    ]);
    const rider = f.body('Rider', { x: 1, y: 2, angle: 1.2 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const joint = f.joint(
      'pin-in-slot',
      f.attachment(carrier, { x: 0, y: 0 }),
      f.attachment(rider, { x: 0, y: 0 }),
      0.4
    );
    const material = f.document.bodies.find((body) => body.id === carrier)! as MaterialBody;
    if (material.geometry.kind !== 'bar') throw new Error('Expected bar');
    const station = f.vertexAttachment(carrier, material.geometry.vertices[0].id);
    const document: BodyDocument = {
      ...f.document,
      joints: [
        {
          ...joint,
          kind: 'pin-in-slot',
          angleZero: 0.8,
          travelZero: 0,
          guideDisplay: {
            bodyId: carrier,
            frame: { attachmentId: station, angle: 0 },
            from: 0,
            to: 5,
          },
        },
      ],
    };
    const result = copy(document, [carrier, rider], false);
    const next = result.document.joints.find(
      (item) => item.id === result.ids.joints.get(joint.id)
    )!;
    if (next.kind !== 'pin-in-slot') throw new Error('Expected slot');
    expect(next.guideDisplay).toEqual({
      ...(document.joints[0].kind === 'pin-in-slot' ? document.joints[0].guideDisplay : {}),
      bodyId: result.ids.bodies.get(carrier),
      frame: { attachmentId: result.ids.attachments.get(station), angle: 0 },
    });
    const anchor = result.document.attachments.find(
      (item) => item.id === result.ids.attachments.get(station)
    )!;
    expect(anchor.vertexId).toBe(
      result.ids.vertices.get(carrier)!.get(material.geometry.vertices[0].id)
    );
    expect(anchor.bodyId).toBe(next.bodyA);
  });
  it('copies the displayed returning ram as a new anchor without restarting the original machine', () => {
    const f = nativeAxialCarriage('weld');
    const a = new BodyDocumentAuthority(f.document);
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.carriage)!;
    const part = built.snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    const index = part.inputs.findIndex(
      (input) => input.sample.direction === -1 && !input.reversal
    );
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const clocks = a.local.clocks,
      displayed = a.display!.poses;
    const copied = a.commit(
      {
        id: 'posed-copy',
        operations: [
          {
            kind: 'copy-bodies',
            bodyIds: [f.assembly.rod, f.carriage],
            includeGround: true,
            offset,
          },
        ],
      },
      { ...state, atStart: false }
    );
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    expect(a.local.clocks.find((clock) => clock.driverId === f.driver.id)).toEqual(clocks[0]);
    for (const body of f.document.bodies)
      expect(a.document.bodies.find((item) => item.id === body.id)).toEqual(body);
    const newCylinder = a.document.assemblies.find((item) => item.id !== f.assembly.id)!;
    const oldPose = displayed.get(f.assembly.rod)!;
    expect(a.display!.poses.get(newCylinder.rod)).toEqual({
      ...oldPose,
      x: oldPose.x + 7,
      y: oldPose.y - 4,
    });
    const newDriver = a.document.drivers.find((driver) => driver.id !== f.driver.id)!;
    expect(newDriver.profile.initial).toBeCloseTo(part.inputs[index].sample.command, 10);
    expect(a.local.clocks.find((clock) => clock.driverId === newDriver.id)!.time).toBe(0);
    expect(a.undo({ ...state, atStart: false }).ok).toBe(true);
    expect(a.local.clocks).toEqual(clocks);
    expect(a.document).toEqual(f.document);
  });
  it('preserves the visible group identity when copied IDs sort differently from the source IDs', () => {
    const f = new BodyFactory();
    for (let i = 0; i < 11; i++)
      f.body(`Material ${i}`, { x: i * 2, y: 0, angle: 0.1 * i }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
    const bodies = f.document.bodies
      .filter((body) => body.kind === 'material')
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const first = bodies[2],
      second = bodies[10];
    f.joint(
      'weld',
      f.attachment(first.id, { x: 0, y: 0 }),
      f.attachment(second.id, { x: 0, y: 0 })
    );
    const document: BodyDocument = {
      ...f.document,
      bodies: f.document.bodies.map((body) =>
        body.kind === 'world'
          ? body
          : {
              ...body,
              presentation: {
                ...body.presentation,
                fill: body.id === first.id ? '#112233' : '#aabbcc',
              },
            }
      ),
    };
    const result = copy(
      document,
      bodies.map((body) => body.id),
      false
    );
    const frames = compileWeldFrames(result.document);
    if (!frames.ok) throw new Error(frames.code);
    const shown = bodyGroupPresentation(
      result.document,
      frames.groupOf.get(result.ids.bodies.get(first.id)!)!
    );
    expect(shown.label).toBe(first.label);
    expect(shown.presentation!.fill).toBe('#112233');
    expect(
      result.document.bodies
        .filter(
          (body) =>
            body.kind === 'material' &&
            [result.ids.bodies.get(first.id), result.ids.bodies.get(second.id)].includes(body.id)
        )
        .map((body) => (body.kind === 'material' ? body.presentation.fill : ''))
        .sort()
    ).toEqual(['#112233', '#aabbcc']);
  });
  it('retains a singleton group override rather than assuming only multi-member groups have properties', () => {
    const f = new BodyFactory();
    const body = f.body('Plate', { x: 2, y: 1, angle: 0.3 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const anchor = f.attachment(body, { x: 1, y: 0 });
    const document: BodyDocument = {
      ...f.document,
      groups: [
        {
          members: [body],
          frameBody: body,
          label: 'Measured plate',
          mass: {
            mass: 9,
            inertia: 4,
            center: { point: { x: 0.7, y: 0.2 }, editAnchor: { attachmentId: anchor } },
          },
        },
      ],
    };
    const result = copy(document, [body], false);
    const group = result.document.groups.find((item) =>
      item.members.includes(result.ids.bodies.get(body)!)
    );
    expect(group).toEqual({
      ...document.groups[0],
      members: [result.ids.bodies.get(body)],
      frameBody: result.ids.bodies.get(body),
      mass: {
        ...document.groups[0].mass,
        center: {
          point: { x: 0.7, y: 0.2 },
          editAnchor: { attachmentId: result.ids.attachments.get(anchor) },
        },
      },
    });
  });
});
