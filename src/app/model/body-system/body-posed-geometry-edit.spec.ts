import {
  nativeEditableBar,
  nativeEditableFourBar,
} from '../../../test-utils/verification/native-geometry-fixture';
import { nativeFourBarPoint } from '../../../test-utils/verification/native-body-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { BodyDocument } from './body-document';
import { BodyId, newRecordId, WORLD } from './body-id';
import { compose, localToWorld } from './body-frame';
import { BodyFactory } from './body-factory';
import { withBodyEditFrame } from './body-edit-frame';

const state = { ...NATIVE_EDIT_CONTEXT.state, atStart: false };
function parked(document: BodyDocument, body: BodyId) {
  const authority = new BodyDocumentAuthority(document);
  const built = buildSimulationSnapshot(authority.document, 0, {
    mode: 'static',
    gravity: { x: 0, y: 0 },
    path: { duration: 1, commandStep: 0.2 },
  });
  if (!built.ok) throw new Error(built.reason);
  const key = built.snapshot.bodyPartition.get(body)!;
  const view = selectSimulationView(built.snapshot, {
    revision: 0,
    indices: new Map(
      [...built.snapshot.partitions.keys()].map((part) => [part, part === key ? 3 : 1])
    ),
  });
  if (!view.ok) throw new Error(view.reason);
  expect(authority.setSimulationView(view.value)).toBe(true);
  return authority;
}
describe('native geometry edits returned to their authored input anchors', () => {
  it('extends a posed driven bar without promoting the displayed angle to its start or changing another clock', () => {
    const f = nativeEditableBar(true, 1, { x: 0, y: 0, angle: 0.7 });
    const other = nativeLinearCarriage();
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: f.document.joints[0].id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
    };
    const fixed = nativeEditableBar(true, 1, { x: 30, y: 0, angle: 0 });
    const fixedFactory = new BodyFactory(fixed.document);
    fixedFactory.joint('revolute', fixedFactory.attachment(WORLD, { x: 40, y: 0 }), fixed.b);
    const fixedDriver = {
      id: newRecordId<'driver'>(),
      coordinate: {
        jointId: fixed.document.joints[0].id,
        coordinate: 'angle' as const,
      },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 0 },
    };
    const document = {
      ...f.document,
      bodies: [
        ...f.document.bodies,
        ...other.document.bodies.filter((body) => body.id !== WORLD),
        ...fixedFactory.document.bodies.filter((body) => body.id !== WORLD),
      ],
      attachments: [
        ...f.document.attachments,
        ...other.document.attachments,
        ...fixedFactory.document.attachments,
      ],
      joints: [...f.document.joints, ...other.document.joints, ...fixedFactory.document.joints],
      drivers: [driver, other.driver, fixedDriver],
    };
    const a = parked(document, f.body.id),
      before = a.document,
      oldClocks = a.local.clocks;
    const target = { x: 12 * Math.cos(1.3), y: 12 * Math.sin(1.3) };
    const result = a.commit(
      { id: 'extend', operations: [{ kind: 'move-point', attachmentId: f.b, target }] },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors).toContainEqual({
      driverId: driver.id,
      status: 'retained',
      previous: 0,
      anchor: 0,
    });
    const body = a.document.bodies.find((item) => item.id === f.body.id)!;
    expect(body.pose.angle).toBeCloseTo(0.7, 10);
    const end = a.document.attachments.find((point) => point.id === f.b)!;
    expect(end.point.x).toBeCloseTo(12, 10);
    expect(end.point.y).toBeCloseTo(0, 10);
    expect(a.display!.poses.get(f.body.id)!.angle).toBeCloseTo(1.3, 10);
    expect(a.local.clocks.find((clock) => clock.driverId === other.driver.id)).toEqual(
      oldClocks[1]
    );
    expect(a.local.clocks.find((clock) => clock.driverId === fixedDriver.id)).toEqual(oldClocks[2]);
    expect(result.event!.plan!.anchors).toHaveLength(1);
    expect(a.document.bodies.find((item) => item.id === other.body)).toEqual(
      before.bodies.find((item) => item.id === other.body)
    );
    expect(a.local.clocks[0].command).toBeCloseTo(0.6, 10);
    expect(a.local.clocks[0].time).toBeCloseTo(0.6, 10);
    expect(a.undoDepth).toBe(1);
    a.undo(state);
    expect(a.document).toEqual(before);
    expect(a.local.clocks).toEqual(oldClocks);
    a.redo(state);
    expect(a.document.attachments.find((point) => point.id === f.b)!.point.x).toBeCloseTo(12, 10);
  });
  it('edits a stopped input at its start while another machine is displaced without claiming a lost anchor', () => {
    const f = nativeEditableBar(true),
      other = nativeLinearCarriage();
    const driver = {
      id: newRecordId<'driver'>(),
      coordinate: { jointId: f.document.joints[0].id, coordinate: 'angle' as const },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 0 },
    };
    const document = {
      ...f.document,
      bodies: [...f.document.bodies, ...other.document.bodies.filter((body) => body.id !== WORLD)],
      attachments: [...f.document.attachments, ...other.document.attachments],
      joints: [...f.document.joints, ...other.document.joints],
      drivers: [driver, other.driver],
    };
    const a = parked(document, f.body.id),
      otherClock = a.local.clocks[1];
    const result = a.commit(
      {
        id: 'stopped-input',
        operations: [{ kind: 'move-point', attachmentId: f.b, target: { x: 12, y: 0 } }],
      },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    expect(a.local.clocks[0].anchor).toBe(0);
    expect(a.local.clocks[0].time).toBe(0);
    expect(a.local.clocks[1]).toEqual(otherClock);
    expect(a.document.attachments.find((point) => point.id === f.b)!.point.x).toBeCloseTo(12, 10);
  });
  it('re-solves a changed four-bar at its old crank angle, including an off-axis coupler witness', () => {
    const f = nativeEditableFourBar();
    const crank = f.bJoint.bodyA;
    const a = parked(f.document, crank);
    const theta = 1.3,
      r = 1.1;
    const oldB = { x: Math.cos(theta), y: Math.sin(theta) },
      oldC = nativeFourBarPoint(theta);
    const oldPhi = Math.atan2(oldC.y - oldB.y, oldC.x - oldB.x);
    const target = { x: r * Math.cos(theta), y: r * Math.sin(theta) };
    const q = { x: 0.1 * Math.cos(theta - oldPhi), y: 0.1 * Math.sin(theta - oldPhi) };
    const couplerLength = Math.hypot(oldC.x - target.x, oldC.y - target.y);
    const anchoredB = { x: r * Math.cos(0.7), y: r * Math.sin(0.7) };
    const anchoredC = nativeFourBarPoint(0.7, {
      ground: 4,
      crank: r,
      coupler: couplerLength,
      rocker: 2,
    });
    const phi =
      Math.atan2(anchoredC.y - anchoredB.y, anchoredC.x - anchoredB.x) - Math.atan2(-q.y, 3 - q.x);
    const expectedWitness = {
      x: anchoredB.x + (1.2 - q.x) * Math.cos(phi) - (0.4 - q.y) * Math.sin(phi),
      y: anchoredB.y + (1.2 - q.x) * Math.sin(phi) + (0.4 - q.y) * Math.cos(phi),
    };
    const result = a.commit(
      {
        id: 'stretch-four-bar',
        operations: [{ kind: 'move-point', attachmentId: f.bJoint.frameA.attachmentId, target }],
      },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    const coupler = a.document.bodies.find((body) => body.id === f.coupler)!;
    const endpoint = a.document.attachments.find((point) => point.id === f.witness)!;
    const end = localToWorld(coupler.pose, endpoint.point);
    expect(end.x).toBeCloseTo(anchoredC.x, 8);
    expect(end.y).toBeCloseTo(anchoredC.y, 8);
    const witness = a.document.attachments.find((point) => point.id === f.offAxis)!;
    const placed = localToWorld(coupler.pose, witness.point);
    expect(placed.x).toBeCloseTo(expectedWitness.x, 8);
    expect(placed.y).toBeCloseTo(expectedWitness.y, 8);
    expect(a.document.drivers[0].profile.initial).toBe(0);
    expect(a.display!.poses.get(crank)!.angle).toBeCloseTo(theta, 10);
  });
  it('keeps a ram on its return leg after re-anchoring a changed welded carriage', () => {
    const f = nativeAxialCarriage('weld'),
      a = new BodyDocumentAuthority(f.document);
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
      (input) => input.sample.direction === -1 && Math.abs(input.sample.command - 1.3) < 1e-9
    );
    expect(index).toBeGreaterThan(0);
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const body = a.document.bodies.find((item) => item.id === f.carriage)!;
    if (body.kind === 'world' || body.geometry.kind !== 'bar')
      throw new Error('Expected carriage bar');
    const result = a.commit(
      {
        id: 'wider-carriage',
        operations: [
          { kind: 'body-geometry', bodyId: f.carriage, geometry: { ...body.geometry, width: 0.7 } },
        ],
      },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    expect(a.local.clocks[0].anchor).toBeCloseTo(0.4, 10);
    expect(a.local.clocks[0].command).toBeCloseTo(1.3, 10);
    expect(a.local.clocks[0].direction).toBe(-1);
    expect(a.local.clocks[0].time).toBeCloseTo((1.5 - 0.4 + (1.5 - 1.3)) / 0.2, 8);
    expect(a.document.bodies.find((item) => item.id === f.carriage)!.pose.x).toBeCloseTo(
      1 + 3.4 * Math.cos(0.4),
      9
    );
    expect(a.display!.poses.get(f.carriage)!.x).toBeCloseTo(1 + 4.3 * Math.cos(0.4), 9);
    const retained = a.local.clocks;
    a.undo(state);
    a.redo(state);
    expect(a.local.clocks).toEqual(retained);
  });
  it('reports a proved lost anchor and starts where the edit stands, with one Undo restoring the old start', () => {
    const f = nativeEditableFourBar(),
      a = parked(f.document, f.bJoint.bodyA);
    const before = a.document,
      clocks = a.local.clocks;
    const target = { x: Math.cos(1.3), y: Math.sin(1.3) + 0.3 };
    const coupler = 0.3,
      rocker = Math.hypot(4 - target.x, target.y);
    // At the saved angle the two circles are nested, so no assembly branch can retain that start.
    expect(Math.hypot(4 - Math.cos(0.7), Math.sin(0.7))).toBeLessThan(rocker - coupler);
    const result = a.commit(
      { id: 'lose-start', operations: [{ kind: 'move-point', attachmentId: f.witness, target }] },
      state
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.event!.plan!.anchors![0].status).toBe('unreachable');
    expect(a.local.clocks[0].anchor).toBeCloseTo(0.6, 10);
    expect(a.local.clocks[0].command).toBeCloseTo(0.6, 10);
    expect(a.local.clocks[0].time).toBe(0);
    expect(a.document.bodies.find((body) => body.id === f.bJoint.bodyA)!.pose.angle).toBeCloseTo(
      1.3,
      10
    );
    a.undo(state);
    expect(a.document).toEqual(before);
    expect(a.local.clocks).toEqual(clocks);
  });
  it('captures a new welded leaf in Edit but keeps analysis restructuring refused by the shared permission model', () => {
    const f = nativeEditableFourBar(),
      a = parked(f.document, f.bJoint.bodyA);
    const drawing = withBodyEditFrame(a.document, a.display!);
    const factory = new BodyFactory(drawing);
    const relative = { x: 3, y: 0, angle: 0.2 };
    const leaf = factory.body('New bracket', compose(a.display!.poses.get(f.coupler)!, relative), [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ]);
    const point = factory.attachment(leaf, { x: 0, y: 0 });
    const joint = factory.joint('weld', f.witness, point);
    const command = {
      id: 'weld-at-pose',
      operations: [
        {
          kind: 'insert' as const,
          records: {
            bodies: factory.document.bodies.filter((body) => body.id === leaf),
            attachments: factory.document.attachments.filter(
              (attachment) => attachment.id === point
            ),
            joints: [joint],
          },
        },
      ],
    };
    expect(a.commit(command, { ...state, mode: 'analysis' })).toMatchObject({
      ok: false,
      code: 'permission',
    });
    expect(a.undoDepth).toBe(0);
    const result = a.commit(command, state);
    if (!result.ok) throw new Error(result.message);
    expect(a.document.joints.find((item) => item.id === joint.id)!.kind).toBe('weld');
    expect(result.event!.plan!.anchors![0].status).toBe('retained');
    const expected = compose(
      f.document.bodies.find((body) => body.id === f.coupler)!.pose,
      relative
    );
    const body = a.document.bodies.find((body) => body.id === leaf)!;
    expect(body.pose.x).toBeCloseTo(expected.x, 9);
    expect(body.pose.y).toBeCloseTo(expected.y, 9);
    expect(body.pose.angle).toBeCloseTo(expected.angle, 9);
    expect(a.local.clocks[0].time).toBeCloseTo(0.6, 9);
    expect(a.document.bodies.find((body) => body.id === f.bJoint.bodyA)!.pose.angle).toBeCloseTo(
      0.7,
      10
    );
  });
  it('does not bypass the fixed-drive refusal when a posed weld would immobilize the whole mechanism', () => {
    const f = nativeEditableFourBar(),
      a = parked(f.document, f.bJoint.bodyA);
    const before = a.document,
      clocks = a.local.clocks;
    const joint = f.document.joints.find((item) => item.frameA.attachmentId === f.witness)!;
    const result = a.commit(
      {
        id: 'immobile-weld',
        operations: [{ kind: 'joint-kind', jointId: joint.id, jointKind: 'weld' }],
      },
      state
    );
    expect(result).toMatchObject({ ok: false, code: 'invalid-document' });
    expect(a.document).toBe(before);
    expect(a.local.clocks).toEqual(clocks);
    expect(a.undoDepth).toBe(0);
  });
});
