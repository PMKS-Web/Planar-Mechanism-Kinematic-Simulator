import { SI_UNITS } from './body-units';
import { rebaseBody } from './rebase-body';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { BodyDocument } from './body-document';
import { BodyDocumentAuthority } from './body-document-authority';
import { emptyBodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { createBodyCylinder } from './cylinder-factory';
import { localToWorld } from './body-frame';
import { newRecordId, WORLD } from './body-id';
import { jointCoordinate } from './joint-coordinate';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
const state = NATIVE_EDIT_CONTEXT.state;
const original = { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 };
const dimensions = { barrelLength: 4, rodLength: 2.5, bore: 0.5, rodDiameter: 0.25, stroke: 2 };

describe('native cylinder dimension transactions', () => {
  it('keeps outer material attachments and carries a welded bracket at the preserved extension', () => {
    for (const anchor of ['barrel', 'rod'] as const) {
      const origin = { x: 1, y: -2, angle: 0.6 };
      const c = createBodyCylinder(emptyBodyDocument(), origin, original, 0.4);
      const f = new BodyFactory(c.document);
      const oldRod = f.document.bodies.find((b) => b.id === c.assembly.rod)!;
      const bracket = f.body('Bracket', oldRod.pose, [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ]);
      f.joint('weld', c.assembly.rodMount, f.attachment(bracket, { x: 2, y: 0 }));
      const witness = f.attachment(bracket, { x: 0.5, y: 0.7 });
      const driver = {
        id: newRecordId<'driver'>(),
        coordinate: { jointId: c.assembly.internalJoint, coordinate: 'travel' as const },
        profile: { kind: 'constant-speed' as const, initial: 0.4, speed: 0.2 },
      };
      const source = { ...f.document, drivers: [driver] },
        a = new BodyDocumentAuthority(source);
      const result = a.commit(
        {
          id: 'resize',
          operations: [
            { kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions, anchor },
          ],
        },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      const poses = new Map(a.document.bodies.map((b) => [b.id, b.pose]));
      const points = new Map(a.document.attachments.map((p) => [p.id, p]));
      const barrel = localToWorld(
        poses.get(c.assembly.barrel)!,
        points.get(c.assembly.barrelMount)!.point
      );
      const rod = localToWorld(poses.get(c.assembly.rod)!, points.get(c.assembly.rodMount)!.point);
      const shift = anchor === 'barrel' ? 0 : -1;
      expect(barrel.x).toBeCloseTo(1 + shift * Math.cos(0.6), 10);
      expect(barrel.y).toBeCloseTo(-2 + shift * Math.sin(0.6), 10);
      expect(rod.x).toBeCloseTo(1 + (4.4 + shift) * Math.cos(0.6), 10);
      expect(rod.y).toBeCloseTo(-2 + (4.4 + shift) * Math.sin(0.6), 10);
      const w = localToWorld(poses.get(bracket)!, points.get(witness)!.point);
      const oldW = localToWorld(oldRod.pose, { x: 0.5, y: 0.7 });
      expect(w.x).toBeCloseTo(oldW.x + (1 + shift) * Math.cos(0.6), 10);
      expect(w.y).toBeCloseTo(oldW.y + (1 + shift) * Math.sin(0.6), 10);
      expect(a.document.joints.filter((j) => j.kind === 'weld')).toEqual(
        source.joints.filter((j) => j.kind === 'weld')
      );
      expect(a.document.drivers).toEqual(source.drivers);
      expect(jointCoordinate(a.document.joints[0], 'travel', poses, points)).toBeCloseTo(0.4, 10);
      for (const id of [c.assembly.barrelMount, c.assembly.rodMount])
        expect(points.get(id)).toEqual(source.attachments.find((p) => p.id === id));
      expect(a.undoDepth).toBe(1);
      a.undo(state);
      expect(a.document).toEqual(source);
    }
  });
  it('turns about its anchored barrel attachment when a vertical external slot requires it', () => {
    const origin = { x: 0, y: 0, angle: 0.6 };
    const c = createBodyCylinder(emptyBodyDocument(), origin, original, 0.4);
    const f = new BodyFactory(c.document);
    f.joint('revolute', f.attachment(WORLD, { x: 0, y: 0 }), c.assembly.barrelMount);
    const x = 3.4 * Math.cos(0.6);
    f.joint('pin-in-slot', f.attachment(WORLD, { x, y: 0 }), c.assembly.rodMount, Math.PI / 2);
    const a = new BodyDocumentAuthority(f.document);
    const result = a.commit(
      {
        id: 'connected-resize',
        operations: [{ kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions }],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const pose = a.document.bodies.find((b) => b.id === c.assembly.rod)!.pose;
    const mount = a.document.attachments.find((p) => p.id === c.assembly.rodMount)!;
    const world = localToWorld(pose, mount.point);
    expect(world.x).toBeCloseTo(x, 10);
    expect(world.y).toBeCloseTo(Math.sqrt(4.4 ** 2 - x ** 2), 10);
    expect(pose.angle).toBeCloseTo(Math.acos(x / 4.4), 10);
    expect(a.document.drivers.length).toBe(0);
  });
  it('refuses a locked material resize or an extension outside the new stroke atomically', () => {
    const c = createBodyCylinder(emptyBodyDocument(), { x: 0, y: 0, angle: 0.6 }, original, 0.4);
    for (const locked of [true, false]) {
      const source = {
        ...c.document,
        bodies: c.document.bodies.map((b) =>
          b.id === c.assembly.barrel && locked ? { ...b, locked: true } : b
        ),
      };
      const a = new BodyDocumentAuthority(source);
      const result = a.commit(
        {
          id: 'refused',
          operations: [
            {
              kind: 'label',
              target: { kind: 'assembly', id: c.assembly.id },
              label: 'Must not persist',
            },
            {
              kind: 'cylinder-dimensions',
              assemblyId: c.assembly.id,
              dimensions: locked ? dimensions : { ...original, stroke: 0.2 },
            },
          ],
        },
        state
      );
      expect(result.ok).toBe(false);
      expect(a.document).toEqual(source);
      expect(a.undoDepth).toBe(0);
    }
  });
  it('preserves material, bound vertex identities, loads and custom centers through frame and enumeration changes', () => {
    for (const rebase of [false, true]) {
      const origin = { x: 1, y: -2, angle: 0.6 };
      const c = createBodyCylinder(emptyBodyDocument(), origin, original, 0.4);
      const f = new BodyFactory(c.document);
      const barrel = f.document.bodies.find((b) => b.id === c.assembly.barrel)!;
      if (barrel.kind !== 'material' || barrel.geometry.kind !== 'bar')
        throw new Error('Expected bar');
      const mouth = f.vertexAttachment(barrel.id, barrel.geometry.vertices[1].id);
      const force = {
        id: newRecordId<'force'>(),
        bodyId: c.assembly.rod,
        point: { x: 0.4, y: 0.2 },
        label: 'Load',
        frame: 'body' as const,
        vector: { x: 2, y: 3 },
        couple: 0.8,
      };
      let source: BodyDocument = {
        ...f.document,
        forces: [force],
        bodies: f.document.bodies.map((b) =>
          b.id !== barrel.id || b.kind !== 'material'
            ? b
            : {
                ...b,
                label: 'Fabricated barrel',
                presentation: { ...b.presentation, fill: '#ac1234' },
                mass: {
                  ...b.mass,
                  center: { mode: 'explicit', point: { x: 1.2, y: 0.3 }, editAnchor: 'body' },
                },
              }
        ),
      };
      if (rebase) {
        source = rebaseBody(
          rebaseBody(source, c.assembly.barrel, { x: -2, y: 0.7, angle: 0.9 }),
          c.assembly.rod,
          { x: 1, y: -0.4, angle: -0.3 }
        );
        source = {
          ...source,
          bodies: [...source.bodies].reverse().map((b) =>
            b.kind === 'material' && b.geometry.kind === 'bar'
              ? {
                  ...b,
                  geometry: {
                    ...b.geometry,
                    vertices: [b.geometry.vertices[1], b.geometry.vertices[0]],
                  },
                }
              : b
          ),
          attachments: [...source.attachments].reverse(),
        };
      }
      const a = new BodyDocumentAuthority(source);
      const result = a.commit(
        {
          id: 'resize-properties',
          operations: [{ kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions }],
        },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(a.document.forces).toEqual(source.forces);
      const b = a.document.bodies.find((b) => b.id === barrel.id)!;
      if (b.kind !== 'material' || b.mass.center.mode !== 'explicit')
        throw new Error('Expected center');
      expect(b.label).toBe('Fabricated barrel');
      expect(b.presentation.fill).toBe('#ac1234');
      const center = localToWorld(b.pose, b.mass.center.point);
      expect(center.x).toBeCloseTo(1 + 1.7 * Math.cos(0.6) - 0.3 * Math.sin(0.6), 10);
      expect(center.y).toBeCloseTo(-2 + 1.7 * Math.sin(0.6) + 0.3 * Math.cos(0.6), 10);
      const point = a.document.attachments.find((p) => p.id === mouth)!;
      const world = localToWorld(b.pose, point.point);
      expect(world.x).toBeCloseTo(1 + 4 * Math.cos(0.6), 10);
      expect(world.y).toBeCloseTo(-2 + 4 * Math.sin(0.6), 10);
      expect(point.vertexId).toBe(source.attachments.find((p) => p.id === mouth)!.vertexId);
      const encoded = encodeBodyDocument(a.document);
      if (!encoded.ok) throw new Error(encoded.reason);
      const decoded = decodeBodyDocument(encoded.payload);
      if (!decoded.ok) throw new Error(decoded.reason);
      expect(encodeBodyDocument(decoded.document)).toEqual(encoded);
    }
  });
  it('keeps the original driven extension anchor while resizing at a paused displayed pose', () => {
    const c = createBodyCylinder(emptyBodyDocument(), { x: 0, y: 0, angle: 0.6 }, original, 0.4);
    const f = new BodyFactory(c.document);
    f.joint('weld', f.attachment(WORLD, { x: 0, y: 0 }), c.assembly.barrelMount);
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: c.assembly.internalJoint, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0.4, speed: 0.2 },
    };
    const a = new BodyDocumentAuthority({ ...f.document, drivers: [driver] });
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { duration: 1, commandStep: 0.05 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(c.assembly.rod)!;
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, 2]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const before = a.document,
      clock = a.local.clocks[0],
      display = a.display!;
    const result = a.commit(
      {
        id: 'posed-resize',
        operations: [{ kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions }],
      },
      { ...state, atStart: false }
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    expect(a.local.clocks[0].anchor).toBeCloseTo(0.4, 10);
    expect(a.local.clocks[0].command).toBeCloseTo(clock.command, 10);
    expect(a.local.clocks[0].time).toBeCloseTo(clock.time, 10);
    expect(a.document.drivers[0].profile.initial).toBe(0.4);
    const mount = a.document.attachments.find((p) => p.id === c.assembly.rodMount)!;
    const world = localToWorld(a.display!.poses.get(c.assembly.rod)!, mount.point);
    expect(world.x).toBeCloseTo((4 + clock.command) * Math.cos(0.6), 10);
    expect(world.y).toBeCloseTo((4 + clock.command) * Math.sin(0.6), 10);
    a.undo({ ...state, atStart: false });
    expect(a.document).toEqual(before);
    expect(a.display!.poses).toEqual(display.poses);
  });

  it('uses destination units for dimensions in a mixed batch and refuses malformed values without history', () => {
    const c = createBodyCylinder(emptyBodyDocument(), { x: 0, y: 0, angle: 0.6 }, original, 0.4);
    const scaled = { barrelLength: 400, rodLength: 250, bore: 50, rodDiameter: 25, stroke: 200 };
    for (const reverse of [false, true]) {
      const a = new BodyDocumentAuthority(c.document);
      const operations = [
        { kind: 'convert-units' as const, units: { ...SI_UNITS, length: 'cm' as const } },
        { kind: 'cylinder-dimensions' as const, assemblyId: c.assembly.id, dimensions: scaled },
      ];
      const result = a.commit(
        { id: 'units-and-size', operations: reverse ? operations.reverse() : operations },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      const rod = a.document.bodies.find((b) => b.id === c.assembly.rod)!;
      const mount = a.document.attachments.find((p) => p.id === c.assembly.rodMount)!;
      const p = localToWorld(rod.pose, mount.point);
      expect(p.x).toBeCloseTo(440 * Math.cos(0.6), 9);
      expect(p.y).toBeCloseTo(440 * Math.sin(0.6), 9);
      const joint = a.document.joints.find((j) => j.id === c.assembly.internalJoint)!;
      if (joint.kind !== 'prismatic') throw new Error('Expected P');
      expect(joint.guideDisplay!.station).toBe(250);
      expect(a.document.limits[0].upper).toBe(200);
      a.undo(state);
      expect(a.document).toEqual(c.document);
    }
    const a = new BodyDocumentAuthority(c.document);
    expect(
      a.commit(
        {
          id: 'same',
          operations: [
            { kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions: original },
          ],
        },
        state
      )
    ).toMatchObject({ ok: true, changed: false });
    for (const bad of [
      { ...dimensions, stroke: 3 },
      { ...dimensions, bore: NaN },
      { ...dimensions, rodLength: 5 },
      { ...dimensions, rodDiameter: 0.5 },
    ])
      expect(
        a.commit(
          {
            id: 'bad',
            operations: [
              { kind: 'cylinder-dimensions', assemblyId: c.assembly.id, dimensions: bad },
            ],
          },
          state
        )
      ).toMatchObject({ ok: false, code: 'invalid-command' });
    expect(a.undoDepth).toBe(0);
  });
});
