import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument, emptyBodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { createBodyCylinder } from './cylinder-factory';
import { newRecordId, WORLD } from './body-id';
import { localToWorld } from './body-frame';
import { GuidedJoint } from './joint-record';
import { reverseJoint } from './reverse-joint';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { validateBodyDocument } from './body-validation';
import { SI_UNITS } from './body-units';
import { menuRefusal } from '../edit-permission';

const state = NATIVE_EDIT_CONTEXT.state;
function materialUnchanged(before: BodyDocument, after: BodyDocument) {
  for (const { pose, ...body } of before.bodies) {
    const { pose: next, ...changed } = after.bodies.find((item) => item.id === body.id)!;
    expect(changed).toEqual(body);
  }
  expect(after.attachments).toEqual(before.attachments);
  expect(after.assemblies).toEqual(before.assemblies);
  expect(after.forces).toEqual(before.forces);
}
function carriage(reverse: boolean) {
  const f = nativeLinearCarriage();
  const joint = reverse ? reverseJoint(f.guide) : f.guide;
  const driver = reverse
    ? { ...f.driver, profile: { ...f.driver.profile, speed: -f.driver.profile.speed } }
    : f.driver;
  return { ...f, driver, document: { ...f.document, joints: [joint], drivers: [driver] } };
}

describe('native guide-axis transactions', () => {
  it('turns a grounded guide about its datum and carries the rider at its same travel in both P orders', () => {
    for (const reverse of [false, true]) {
      const f = carriage(reverse),
        a = new BodyDocumentAuthority(f.document);
      expect(
        a.commit(
          {
            id: 'travel',
            operations: [
              {
                kind: 'move-coordinate',
                coordinate: f.driver.coordinate,
                target: reverse ? -0.6 : 0.6,
              },
            ],
          },
          state
        ).ok
      ).toBe(true);
      const before = a.document;
      const result = a.commit(
        { id: 'axis', operations: [{ kind: 'guide-axis', jointId: f.guide.id, worldAxis: 1.1 }] },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      const pose = a.document.bodies.find((body) => body.id === f.body)!.pose;
      expect(pose.x).toBeCloseTo(2 + 0.6 * Math.cos(1.1), 11);
      expect(pose.y).toBeCloseTo(-1 + 0.6 * Math.sin(1.1), 11);
      expect(pose.angle).toBeCloseTo(1.1, 11);
      expect(a.document.drivers).toEqual(before.drivers);
      expect((a.document.joints[0] as GuidedJoint).guideDisplay!.bodyId).toBe(WORLD);
      materialUnchanged(before, a.document);
      const encoded = encodeBodyDocument(a.document);
      if (!encoded.ok) throw new Error(encoded.reason);
      const read = decodeBodyDocument(encoded.payload);
      if (!read.ok) throw new Error(read.reason);
      expect(encodeBodyDocument(new BodyDocumentAuthority(read.document).document)).toEqual(
        encoded
      );
      a.undo(state);
      expect(a.document).toEqual(before);
      a.redo(state);
      expect((a.document.joints[0] as GuidedJoint).guideDisplay!.frame.angle).toBeCloseTo(1.1, 12);
    }
  });
  it('keeps a floating carrier and guide origin fixed, including a freely turning slot rider with a separate angle prescription', () => {
    for (const kind of ['prismatic', 'pin-in-slot'] as const) {
      const f = new BodyFactory(),
        origin = { x: 4, y: -3, angle: 0.6 };
      const carrier = f.body('floating carrier', origin, [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ]);
      const at = { x: 1, y: 0.2 },
        guideOrigin = localToWorld(origin, at);
      const jointPoint = {
        x: guideOrigin.x + 0.7 * Math.cos(0.8),
        y: guideOrigin.y + 0.7 * Math.sin(0.8),
      };
      const local = { x: 0.2, y: 0.3 },
        offset = localToWorld({ x: 0, y: 0, angle: 1 }, local);
      const rider = f.body(
        'rider',
        { x: jointPoint.x - offset.x, y: jointPoint.y - offset.y, angle: 1 },
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]
      );
      const joint = f.joint(kind, f.attachment(carrier, at), f.attachment(rider, local), 0.8);
      const drivers =
        kind === 'pin-in-slot'
          ? [
              {
                id: newRecordId<'driver'>(),
                coordinate: { jointId: joint.id, coordinate: 'angle' as const },
                profile: { kind: 'constant-speed' as const, initial: 0, speed: 0 },
              },
            ]
          : [];
      const a = new BodyDocumentAuthority({ ...f.document, drivers });
      const before = a.document;
      const result = a.commit(
        {
          id: 'floating-axis',
          operations: [{ kind: 'guide-axis', jointId: joint.id, worldAxis: 1.1 }],
        },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(a.document.bodies.find((body) => body.id === carrier)!.pose).toEqual(origin);
      const pose = a.document.bodies.find((body) => body.id === rider)!.pose;
      const point = localToWorld(pose, local);
      expect(point.x).toBeCloseTo(guideOrigin.x + 0.7 * Math.cos(1.1), 11);
      expect(point.y).toBeCloseTo(guideOrigin.y + 0.7 * Math.sin(1.1), 11);
      expect(pose.angle).toBeCloseTo(kind === 'prismatic' ? 1.3 : 1, 11);
      expect(a.document.drivers).toEqual(drivers);
      materialUnchanged(before, a.document);
    }
  });
  it('carries a complete cylinder and welded off-axis bracket when its external barrel guide turns', () => {
    const origin = { x: 1, y: -2, angle: 0.4 };
    const c = createBodyCylinder(
      emptyBodyDocument(),
      origin,
      { barrelLength: 3, rodLength: 2, bore: 0.4, rodDiameter: 0.2, stroke: 1.5 },
      0.4
    );
    const f = new BodyFactory(c.document);
    const guide = f.joint('prismatic', f.attachment(WORLD, origin), c.assembly.barrelMount, 0.4);
    const bracket = f.body('welded bracket', origin, [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
    ]);
    f.joint('weld', c.assembly.barrelMount, f.attachment(bracket, { x: 0, y: 0 }));
    const witness = f.attachment(bracket, { x: 0.5, y: 0.7 });
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: c.assembly.internalJoint, coordinate: 'travel' as const },
      profile: { kind: 'constant-speed' as const, initial: 0.4, speed: 0.2 },
    };
    const before = { ...f.document, drivers: [driver] },
      a = new BodyDocumentAuthority(before);
    const result = a.commit(
      {
        id: 'cylinder-axis',
        operations: [{ kind: 'guide-axis', jointId: guide.id, worldAxis: 1.1 }],
      },
      state
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    materialUnchanged(before, a.document);
    const barrel = a.document.bodies.find((body) => body.id === c.assembly.barrel)!;
    const rod = a.document.bodies.find((body) => body.id === c.assembly.rod)!;
    expect(barrel.pose.x).toBeCloseTo(1, 11);
    expect(barrel.pose.y).toBeCloseTo(-2, 11);
    expect(barrel.pose.angle).toBeCloseTo(1.1, 11);
    expect(rod.pose.x).toBeCloseTo(1 + 1.4 * Math.cos(1.1), 11);
    expect(rod.pose.y).toBeCloseTo(-2 + 1.4 * Math.sin(1.1), 11);
    const p = a.document.attachments.find((point) => point.id === witness)!;
    const world = localToWorld(
      a.document.bodies.find((body) => body.id === bracket)!.pose,
      p.point
    );
    expect(world.x).toBeCloseTo(1 + 0.5 * Math.cos(1.1) - 0.7 * Math.sin(1.1), 11);
    expect(world.y).toBeCloseTo(-2 + 0.5 * Math.sin(1.1) + 0.7 * Math.cos(1.1), 11);
    expect(a.document.joints.find((joint) => joint.id === c.assembly.internalJoint)).toEqual(
      before.joints.find((joint) => joint.id === c.assembly.internalJoint)
    );
    const refused = a.commit(
      {
        id: 'interior-axis',
        operations: [{ kind: 'guide-axis', jointId: c.assembly.internalJoint, worldAxis: 0.9 }],
      },
      state
    );
    expect(refused).toMatchObject({ ok: false, code: 'assembly-interior' });
  });
  it('refuses against a locked rider or an independent ground connection without leaking another property edit', () => {
    for (const lock of [true, false]) {
      const f = nativeLinearCarriage(),
        factory = new BodyFactory(f.document);
      if (!lock) factory.joint('weld', f.guide.frameA.attachmentId, f.guide.frameB.attachmentId);
      const source = {
        ...factory.document,
        drivers: [],
        bodies: factory.document.bodies.map((body) =>
          body.id === f.body && lock ? { ...body, locked: true } : body
        ),
      };
      const a = new BodyDocumentAuthority(source),
        before = a.document;
      const result = a.commit(
        {
          id: 'impossible-axis',
          operations: [
            { kind: 'body-properties', bodyId: f.body, change: { label: 'Must not stick' } },
            { kind: 'guide-axis', jointId: f.guide.id, worldAxis: 1.2 },
          ],
        },
        state
      );
      expect(result.ok).toBe(false);
      expect(a.document).toBe(before);
      expect(a.undoDepth).toBe(0);
    }
  });
  it('keeps the original travel start at a paused pose in either joint order and restores it through history', () => {
    for (const reverse of [false, true]) {
      const f = carriage(reverse),
        a = new BodyDocumentAuthority(f.document);
      const built = buildSimulationSnapshot(a.document, 0, {
        mode: 'static',
        gravity: { x: 0, y: 0 },
        path: { duration: 1, commandStep: 0.03 },
      });
      if (!built.ok) throw new Error(built.reason);
      const key = built.snapshot.bodyPartition.get(f.body)!;
      const view = selectSimulationView(built.snapshot, {
        revision: 0,
        indices: new Map([[key, 2]]),
      });
      if (!view.ok) throw new Error(view.reason);
      expect(a.setSimulationView(view.value)).toBe(true);
      const before = a.document,
        display = a.display!,
        posed = { ...state, atStart: false };
      const result = a.commit(
        {
          id: 'posed-axis',
          operations: reverse
            ? [{ kind: 'guide-axes', axes: [{ jointId: f.guide.id, worldAxis: 1.2 }] }]
            : [{ kind: 'guide-axis', jointId: f.guide.id, worldAxis: 1.2 }],
        },
        posed
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(result.event!.plan!.anchors![0].status).toBe('retained');
      expect(a.local.clocks[0].anchor).toBe(0);
      expect(a.local.clocks[0].command).toBeCloseTo(reverse ? -0.06 : 0.06, 10);
      expect(a.local.clocks[0].time).toBeCloseTo(0.2, 10);
      expect(a.document.drivers[0].profile.initial).toBe(0);
      expect(a.document.bodies.find((body) => body.id === f.body)!.pose.x).toBeCloseTo(2, 10);
      expect(a.display!.poses.get(f.body)!.x).toBeCloseTo(2 + 0.06 * Math.cos(1.2), 10);
      expect(a.display!.poses.get(f.body)!.y).toBeCloseTo(-1 + 0.06 * Math.sin(1.2), 10);
      a.undo(posed);
      expect(a.document).toEqual(before);
      expect(a.local.clocks).toEqual(display.clocks);
      expect(a.display!.poses).toEqual(display.poses);
    }
  });
  it('keeps owner-only and authored-extent guide records valid through conversion while refusing partial extents', () => {
    const f = nativeLinearCarriage();
    expect((f.guide as GuidedJoint).guideDisplay).toEqual({ bodyId: WORLD, frame: f.guide.frameA });
    for (const extents of [{}, { from: -2, to: 5 }]) {
      const guide = {
        ...(f.guide as GuidedJoint),
        guideDisplay: { bodyId: WORLD, frame: f.guide.frameA, ...extents },
      };
      const a = new BodyDocumentAuthority({ ...f.document, joints: [guide] });
      expect(
        a.commit(
          {
            id: 'units',
            operations: [{ kind: 'convert-units', units: { ...SI_UNITS, length: 'cm' } }],
          },
          state
        ).ok
      ).toBe(true);
      const display = (a.document.joints[0] as GuidedJoint).guideDisplay!;
      expect(display.bodyId).toBe(WORLD);
      expect(display.frame).toEqual(guide.guideDisplay.frame);
      expect(display.from).toBe('from' in extents ? -200 : undefined);
      expect(display.to).toBe('to' in extents ? 500 : undefined);
      expect(
        a.commit(
          {
            id: 'guide-after-units',
            operations: [{ kind: 'guide-axis', jointId: guide.id, worldAxis: 0.9 }],
          },
          state
        ).ok
      ).toBe(true);
    }
    expect(
      validateBodyDocument({
        ...f.document,
        joints: [
          {
            ...f.guide,
            guideDisplay: { bodyId: WORLD, frame: f.guide.frameA, from: 1 },
          } as GuidedJoint,
        ],
      }).some((issue) => issue.code === 'invalid-guide')
    ).toBe(true);
    const old = { ...(f.guide as GuidedJoint), guideDisplay: undefined };
    expect((reverseJoint(old) as GuidedJoint).guideDisplay).toEqual({
      bodyId: WORLD,
      frame: f.guide.frameA,
    });
    const encoded = encodeBodyDocument({ ...f.document, joints: [old] });
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(decodeBodyDocument(encoded.payload).ok).toBe(true);
  });
  it('changes coupled guide axes together and keeps independent distant sketches numerically separate', () => {
    const f = nativeLinearCarriage(),
      factory = new BodyFactory(f.document);
    const second = factory.joint(
      'prismatic',
      factory.attachment(WORLD, { x: 2, y: -1 }),
      factory.attachment(f.body, { x: 0, y: 0 }),
      0.4
    );
    const other = nativeLinearCarriage();
    const source = {
      ...factory.document,
      bodies: [
        ...factory.document.bodies,
        ...other.document.bodies
          .filter((body) => body.id !== WORLD)
          .map((body) => ({
            ...body,
            pose: { ...body.pose, x: body.pose.x + 1e9, y: body.pose.y - 1e9 },
          })),
      ],
      attachments: [
        ...factory.document.attachments,
        ...other.document.attachments.map((point) =>
          point.bodyId === WORLD
            ? { ...point, point: { x: point.point.x + 1e9, y: point.point.y - 1e9 } }
            : point
        ),
      ],
      joints: [...factory.document.joints, ...other.document.joints],
      drivers: [...factory.document.drivers, other.driver],
    };
    const axes = [
      { jointId: f.guide.id, worldAxis: 1.1 },
      { jointId: second.id, worldAxis: 1.1 },
      { jointId: other.guide.id, worldAxis: -0.2 },
    ];
    for (const order of [axes, [...axes].reverse()]) {
      const a = new BodyDocumentAuthority(source);
      expect(
        a.commit({ id: 'only-one', operations: [{ kind: 'guide-axis', ...axes[0] }] }, state).ok
      ).toBe(false);
      const result = a.commit(
        { id: 'together', operations: [{ kind: 'guide-axes', axes: order }] },
        state
      );
      if (!result.ok) throw new Error(JSON.stringify(result));
      expect(a.document.bodies.find((body) => body.id === f.body)!.pose.angle).toBeCloseTo(1.1, 11);
      expect(a.document.bodies.find((body) => body.id === other.body)!.pose.angle).toBeCloseTo(
        -0.2,
        11
      );
      expect(a.document.bodies.find((body) => body.id === other.body)!.pose.x).toBe(1e9 + 2);
      materialUnchanged(source, a.document);
      expect(a.undoDepth).toBe(1);
      a.undo(state);
      expect(a.document).toEqual(source);
      const duplicate = a.commit(
        { id: 'duplicate-guide', operations: [{ kind: 'guide-axes', axes: [axes[0], axes[0]] }] },
        state
      );
      expect(duplicate).toMatchObject({ ok: false, code: 'invalid-command' });
      expect(a.undoDepth).toBe(0);
    }
  });
  it('quotes the shared playing and missing-frame restrictions, and treats an exact heading as a no-op', () => {
    const f = nativeLinearCarriage(),
      a = new BodyDocumentAuthority(f.document);
    const op = { kind: 'guide-axis' as const, jointId: f.guide.id, worldAxis: 0.4 };
    expect(a.commit({ id: 'same-axis', operations: [op] }, state)).toMatchObject({
      ok: true,
      changed: false,
    });
    for (const value of [NaN, Infinity])
      expect(
        a.commit({ id: 'bad-axis', operations: [{ ...op, worldAxis: value }] }, state).ok
      ).toBe(false);
    for (const next of [
      { ...state, playing: true },
      { ...state, atStart: false },
    ]) {
      const result = a.commit({ id: 'permission', operations: [op] }, next);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.permission).toEqual(menuRefusal(next, 'start'));
    }
    expect(a.undoDepth).toBe(0);
  });
});
