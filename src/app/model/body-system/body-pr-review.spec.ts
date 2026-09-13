import {
  nativeLongChain,
  nativeGuideWitness,
  translateNativeDrawing,
} from '../../../test-utils/verification/native-review-fixtures';
import { nativeEditableBar } from '../../../test-utils/verification/native-geometry-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { bodyAnchorClock } from './body-anchor-recovery';
import { relaxBodyEdit } from './body-edit-relaxation';
import { editAdd, editConstant, editSubtract, editVariable } from './body-edit-scalar';
import {
  NATIVE_EDIT_CONTEXT,
  nativeThreeCylinders,
} from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { rebaseBody } from './rebase-body';
import { localToWorld, rotate } from './body-frame';
import { BodyDocument } from './body-document';
import { GuidedJoint } from './joint-record';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { BodyFactory } from './body-factory';
import { WORLD, newRecordId } from './body-id';

const state = NATIVE_EDIT_CONTEXT.state;
function point(document: BodyDocument, id: string) {
  const a = document.attachments.find((a) => a.id === id)!;
  return localToWorld(document.bodies.find((b) => b.id === a.bodyId)!.pose, a.point);
}
function mark(document: BodyDocument, joint: GuidedJoint) {
  const guide = joint.guideDisplay!,
    a = document.attachments.find((a) => a.id === guide.frame.attachmentId)!;
  const offset = rotate({ x: guide.station ?? 0, y: guide.normalOffset ?? 0 }, guide.frame.angle);
  return localToWorld(document.bodies.find((b) => b.id === guide.bodyId)!.pose, {
    x: a.point.x + offset.x,
    y: a.point.y + offset.y,
  });
}

describe('full-PR native review regressions', () => {
  it('edits a twelve-member sketch whose extent exceeds the member scale', () => {
    const f = nativeLongChain(),
      a = new BodyDocumentAuthority(f.document);
    const target = { x: f.at.x - 0.2, y: f.at.y + 0.2 };
    const result = a.commit(
      { id: 'chain', operations: [{ kind: 'move-point', attachmentId: f.end, target }] },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(point(a.document, f.end).x).toBeCloseTo(target.x, 10);
    expect(point(a.document, f.end).y).toBeCloseTo(target.y, 10);
    expect(a.document.attachments).toEqual(f.document.attachments);
  });
  it('edits the same held bar after a distant material-frame change', () => {
    const f = nativeEditableBar(true);
    const source = rebaseBody(
      { ...f.document, holds: [{ bodyId: f.body.id, from: f.a, to: f.b, length: 10 }] },
      f.body.id,
      { x: 1e4, y: 0, angle: 0.3 }
    );
    const a = new BodyDocumentAuthority(source);
    const result = a.commit(
      {
        id: 'far-frame',
        operations: [{ kind: 'move-point', attachmentId: f.b, target: { x: 6, y: 8 } }],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(point(a.document, f.b).x).toBeCloseTo(6, 8);
    expect(point(a.document, f.b).y).toBeCloseTo(8, 8);
    expect(point(a.document, f.witness).x).toBeCloseTo(0.2, 8);
    expect(point(a.document, f.witness).y).toBeCloseTo(3.6, 8);
  });
  it('resizes a translated ram without making fixed or unrelated locks numerical unknowns', () => {
    const f = nativeAxialCarriage(),
      shifted = translateNativeDrawing(f.document, 300, 200);
    const factory = new BodyFactory(shifted);
    const locks = [
      f.guide.frameA.attachmentId,
      factory.attachment(WORLD, { x: 1e8 + 0.3, y: -1e8 + 0.7 }),
      factory.attachment(WORLD, { x: -1e8, y: 1e8 }),
    ];
    const source = { ...factory.document, locks },
      a = new BodyDocumentAuthority(source);
    const result = a.commit(
      {
        id: 'resize',
        operations: [
          {
            kind: 'cylinder-dimensions',
            assemblyId: f.assembly.id,
            dimensions: {
              barrelLength: 4,
              rodLength: 2.5,
              bore: 0.5,
              rodDiameter: 0.25,
              stroke: 2,
            },
          },
        ],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    for (const id of locks) expect(point(a.document, id)).toEqual(point(source, id));
    expect(point(a.document, f.assembly.rodMount).x).toBeCloseTo(
      301 + 4.4 * Math.cos(f.origin.angle),
      9
    );
    expect(point(a.document, f.assembly.rodMount).y).toBeCloseTo(
      198 + 4.4 * Math.sin(f.origin.angle),
      9
    );
  });
  it('deletes guide artwork without deleting the joint, drive, limits or changing its mark', () => {
    for (const kind of ['prismatic', 'pin-in-slot'] as const)
      for (const onB of kind === 'prismatic' ? [false, true] : [false]) {
        const f = nativeGuideWitness(kind, onB),
          before = mark(f.document, f.guide),
          a = new BodyDocumentAuthority(f.document);
        const result = a.commit(
          {
            id: 'delete-witness',
            operations: [{ kind: 'delete', targets: [{ kind: 'attachment', id: f.witness }] }],
          },
          state
        );
        if (!result.ok) throw new Error(JSON.stringify(result));
        expect(a.document.joints.length).toBe(1);
        expect(a.document.drivers).toEqual(f.document.drivers);
        expect(a.document.limits).toEqual(f.document.limits);
        const joint = a.document.joints[0] as GuidedJoint;
        if (!joint) throw new Error('Physical joint was deleted with its artwork');
        expect(joint.frameA).toEqual(f.guide.frameA);
        expect(joint.frameB).toEqual(f.guide.frameB);
        expect(joint.guideDisplay!.bodyId).toBe(f.guide.guideDisplay!.bodyId);
        expect(mark(a.document, joint).x).toBeCloseTo(before.x, 12);
        expect(mark(a.document, joint).y).toBeCloseTo(before.y, 12);
        a.undo(state);
        expect(a.document).toEqual(f.document);
        a.redo(state);
        expect(a.document.joints.length).toBe(1);
      }
  });
  it('reports underconstraint after correcting a rounded slot pose', () => {
    const f = nativeGuideWitness('pin-in-slot');
    const source = {
      ...f.document,
      bodies: f.document.bodies.map((b) =>
        b.id === f.body ? { ...b, pose: { ...b.pose, y: b.pose.y + 1e-10 } } : b
      ),
    };
    const compiled = compileBodyDocument(source);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    expect(admitBodyPartition(compiled.system, compiled.system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'underconstrained',
      mobility: { dof: 2 },
    });
  });
  it('asks where the revolute connection belongs when the former P anchors are separated', () => {
    const f = nativeGuideWitness();
    const source = {
      ...f.document,
      bodies: f.document.bodies.map((b) =>
        b.id === f.body
          ? {
              ...b,
              pose: { ...b.pose, x: b.pose.x + Math.cos(f.angle), y: b.pose.y + Math.sin(f.angle) },
            }
          : b
      ),
      drivers: [],
      limits: [],
    };
    const a = new BodyDocumentAuthority(source);
    expect(
      a.commit(
        {
          id: 'convert',
          operations: [{ kind: 'joint-kind', jointId: f.guide.id, jointKind: 'revolute' }],
        },
        state
      )
    ).toMatchObject({ ok: false, code: 'connection-point' });
    expect(a.document).toEqual(source);
    expect(a.undoDepth).toBe(0);
  });
  it('keeps roundoff local and still rejects a contradictory small row', () => {
    const c = (n: number) => editConstant(n, 1);
    const rows = (values: readonly number[]) => [
      editSubtract(editSubtract(editAdd(c(1e8), editVariable(values[0], 1, 0)), c(1e8)), c(0.1)),
    ];
    const solved = relaxBodyEdit([0], rows, []);
    expect(solved).toBeDefined();
    expect(solved![0]).toBeCloseTo(0.1, 7);
    expect(relaxBodyEdit([0], (v) => [...rows(v), c(1e-8)], [])).toBeUndefined();
  });
  it('still refuses a resize that would displace a locked rod mount', () => {
    const f = nativeAxialCarriage();
    const source = { ...f.document, locks: [f.assembly.rodMount] },
      a = new BodyDocumentAuthority(source);
    const result = a.commit(
      {
        id: 'locked-resize',
        operations: [
          {
            kind: 'cylinder-dimensions',
            assemblyId: f.assembly.id,
            dimensions: {
              barrelLength: 4,
              rodLength: 2.5,
              bore: 0.5,
              rodDiameter: 0.25,
              stroke: 2,
            },
          },
        ],
      },
      state
    );
    expect(result.ok).toBe(false);
    expect(a.document).toEqual(source);
    expect(a.undoDepth).toBe(0);
  });
  it('rotates a deliberately offset artwork heading by its own requested delta', () => {
    const f = nativeGuideWitness(),
      a = new BodyDocumentAuthority(f.document);
    const result = a.commit(
      {
        id: 'display-axis',
        operations: [{ kind: 'guide-axis', jointId: f.guide.id, worldAxis: 1.1 }],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const j = a.document.joints[0] as GuidedJoint;
    expect(j.guideDisplay!.frame.angle).toBeCloseTo(1.1, 12);
    expect(j.frameA.angle).toBeCloseTo(0.8, 12);
    expect(a.document.attachments).toEqual(f.document.attachments);
  });
  it('keeps a WORLD hub and another ram’s driven pair through deletion and explicit kind changes', () => {
    for (const order of [
      [0, 1, 2],
      [2, 0, 1],
    ]) {
      const f = nativeThreeCylinders(order, true);
      const joint = f.document.joints.find(
        (j) =>
          f.pin.joints.includes(j.id) &&
          (j.bodyA === f.cylinders[2].barrel || j.bodyB === f.cylinders[2].barrel)
      )!;
      const driver = {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: joint.id, coordinate: 'angle' as const },
        profile: { kind: 'constant-speed' as const, initial: 0, speed: 0.1 },
      };
      const source = { ...f.document, drivers: [driver] },
        a = new BodyDocumentAuthority(source);
      const removed = a.commit(
        {
          id: 'remove-ram',
          operations: [{ kind: 'delete', targets: [{ kind: 'assembly', id: f.cylinders[0].id }] }],
        },
        state
      );
      if (!removed.ok) throw new Error(JSON.stringify(removed));
      expect(a.document.drivers).toEqual([driver]);
      expect(a.document.joints.find((j) => j.id === joint.id)).toEqual(joint);
      expect(a.document.junctions[0].hub).toBe(f.pin.hub);
      const convert = {
        kind: 'joint-kind' as const,
        jointId: joint.id,
        jointKind: 'prismatic' as const,
      };
      expect(a.commit({ id: 'keep-drive', operations: [convert] }, state)).toMatchObject({
        ok: false,
        code: 'coordinate-in-use',
      });
      expect(
        a.commit(
          { id: 'remove-drive', operations: [{ ...convert, removeCoordinates: true }] },
          state
        ).ok
      ).toBe(true);
      expect(a.document.drivers).toEqual([]);
      expect(a.document.assemblies.length).toBe(2);
      expect(a.document.limits.length).toBe(2);
    }
  });
  it('matches the displayed assembly, not the close opposite branch, when recovering a clock', () => {
    const lengths = { ground: 4, crank: 1, coupler: 3, rocker: 2.00001 },
      angle = Math.PI - 0.02,
      command = 0.02;
    const f = nativeFourBar(lengths, angle),
      compiled = compileBodyDocument(f.document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const displayed = (branch: 1 | -1) => {
      const hand = nativeFourBar(lengths, angle + command, branch);
      return {
        ...f.document,
        bodies: f.document.bodies.map((b) =>
          b.kind === 'world'
            ? b
            : {
                ...b,
                pose: hand.document.bodies.find(
                  (h) => h.kind === 'material' && h.label === b.label
                )!.pose,
              }
        ),
      };
    };
    expect(
      bodyAnchorClock(admitted, compiled.system, displayed(1), command, 1, 1, 'cycle')
    ).toBeDefined();
    expect(
      bodyAnchorClock(admitted, compiled.system, displayed(-1), command, 1, 1, 'cycle')
    ).toBeUndefined();
  });
});
