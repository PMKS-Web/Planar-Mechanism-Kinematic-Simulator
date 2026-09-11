import { nativeCosineCarriage } from '../../../test-utils/verification/native-cosine-carriage-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { newRecordId, WORLD } from './body-id';
import { localToWorld } from './body-frame';
import { BodyCoordinateMove } from './body-coordinate-edit';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { menuRefusal } from '../edit-permission';

const state = NATIVE_EDIT_CONTEXT.state;
function apply(a: BodyDocumentAuthority, operation: BodyCoordinateMove) {
  const result = a.commit({ id: 'coordinate', operations: [operation] }, state);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
function unchangedMaterial(before: BodyDocument, after: BodyDocument) {
  for (const body of before.bodies) {
    const { pose, ...record } = body;
    const { pose: changed, ...next } = after.bodies.find((item) => item.id === body.id)!;
    expect(next).toEqual(record);
  }
  expect(after.attachments).toEqual(before.attachments);
  expect(after.joints).toEqual(before.joints);
  expect(after.assemblies).toEqual(before.assemblies);
  expect(after.forces).toEqual(before.forces);
}

describe('native exact rigid coordinate edits', () => {
  it('carries a welded ram and its off-axis carriage witness without changing material in either enumeration order', () => {
    const f = nativeAxialCarriage('weld');
    for (const reverse of [false, true]) {
      const source = reverse
        ? {
            ...f.document,
            bodies: [...f.document.bodies].reverse(),
            joints: [...f.document.joints].reverse(),
            attachments: [...f.document.attachments].reverse(),
          }
        : f.document;
      const a = new BodyDocumentAuthority(source);
      apply(a, { kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 1.2 });
      unchangedMaterial(source, a.document);
      const carriage = a.document.bodies.find((body) => body.id === f.carriage)!;
      const witness = a.document.attachments.find((point) => point.id === f.witness)!;
      const p = localToWorld(carriage.pose, witness.point);
      expect(p.x).toBeCloseTo(
        1 + 4.2 * Math.cos(0.4) + 0.7 * Math.cos(0.7) - 0.6 * Math.sin(0.7),
        10
      );
      expect(p.y).toBeCloseTo(
        -2 + 4.2 * Math.sin(0.4) + 0.7 * Math.sin(0.7) + 0.6 * Math.cos(0.7),
        10
      );
      expect(a.document.drivers[0]).toEqual({
        ...f.driver,
        profile: { ...f.driver.profile, initial: 1.2 },
      });
      expect(a.undoDepth).toBe(1);
      const encoded = encodeBodyDocument(a.document);
      if (!encoded.ok) throw new Error(encoded.reason);
      const read = decodeBodyDocument(encoded.payload);
      if (!read.ok) throw new Error(read.reason);
      expect(encodeBodyDocument(new BodyDocumentAuthority(read.document).document)).toEqual(
        encoded
      );
      a.undo(state);
      expect(a.document).toEqual(source);
      a.redo(state);
      expect(a.document.drivers[0].profile.initial).toBe(1.2);
    }
  });
  it('rotates an unheld bar by an unwrapped R coordinate instead of shortening it or changing the datum', () => {
    const f = nativeLoadedRod();
    for (const driven of [true, false]) {
      const document = { ...f.document, drivers: driven ? f.document.drivers : [] };
      const a = new BodyDocumentAuthority(document),
        target = 2 * Math.PI + 0.8;
      apply(a, { kind: 'move-coordinate', coordinate: f.driver.coordinate, target });
      unchangedMaterial(document, a.document);
      expect(a.document.bodies.find((body) => body.id === f.body)!.pose.angle).toBeCloseTo(
        0.4 + target,
        11
      );
      expect(a.document.drivers.length).toBe(driven ? 1 : 0);
    }
  });
  it('changes either slot coordinate while retaining the other prescribed coordinate', () => {
    const f = new BodyFactory();
    const b = f.body('Rider', { x: 2, y: -1, angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const slot = f.joint(
      'pin-in-slot',
      f.attachment(WORLD, { x: 2, y: -1 }),
      f.attachment(b, { x: 0, y: 0 }),
      0.3
    );
    const drivers = (['angle', 'travel'] as const).map((coordinate) => ({
      id: newRecordId<'driver'>(),
      coordinate: { jointId: slot.id, coordinate },
      profile: { kind: 'constant-speed' as const, initial: 0, speed: 0 },
    }));
    const a = new BodyDocumentAuthority({ ...f.document, drivers });
    apply(a, { kind: 'move-coordinate', coordinate: drivers[1].coordinate, target: 2 });
    expect(a.document.bodies.find((body) => body.id === b)!.pose).toEqual(
      expect.objectContaining({ angle: 0.7 })
    );
    apply(a, { kind: 'move-coordinate', coordinate: drivers[0].coordinate, target: -0.4 });
    const pose = a.document.bodies.find((body) => body.id === b)!.pose;
    expect(pose.x).toBeCloseTo(2 + 2 * Math.cos(0.3), 12);
    expect(pose.y).toBeCloseTo(-1 + 2 * Math.sin(0.3), 12);
    expect(pose.angle).toBeCloseTo(0.3, 12);
    expect(a.document.drivers[1].profile.initial).toBe(2);
    unchangedMaterial(f.document, a.document);
  });
  it('refuses movement against body, attachment, force and angle holds with no earlier edit leaking', () => {
    const f = nativeLoadedRod();
    const body = f.document.bodies.find((item) => item.id === f.body)!;
    const factory = new BodyFactory(f.document);
    const end = factory.attachment(f.body, { x: 2, y: 0 });
    const origin = factory.attachment(f.body, { x: 0, y: 0 });
    const base = factory.document;
    for (const source of [
      {
        ...base,
        bodies: base.bodies.map((item) => (item.id === f.body ? { ...item, locked: true } : item)),
      },
      { ...base, locks: [end] },
      { ...base, forces: base.forces.map((force) => ({ ...force, locked: true })) },
      { ...base, holds: [{ bodyId: f.body, from: origin, to: end, angle: body.pose.angle }] },
    ]) {
      const a = new BodyDocumentAuthority(source),
        before = a.document;
      const result = a.commit(
        {
          id: 'blocked-coordinate',
          operations: [
            { kind: 'body-properties', bodyId: f.body, change: { label: 'Must not survive' } },
            { kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 0.3 },
          ],
        },
        state
      );
      expect(result.ok).toBe(false);
      expect(a.document).toBe(before);
      expect(a.undoDepth).toBe(0);
    }
  });
  it('keeps WORLD and a separate machine fixed, and refuses over-travel or an unavailable coordinate atomically', () => {
    const f = nativeAxialCarriage('weld'),
      other = nativeLinearCarriage();
    const a = new BodyDocumentAuthority({
      ...f.document,
      bodies: [...f.document.bodies, ...other.document.bodies.filter((b) => b.id !== WORLD)],
      attachments: [...f.document.attachments, ...other.document.attachments],
      joints: [...f.document.joints, ...other.document.joints],
      drivers: [...f.document.drivers, other.driver],
    });
    const prior = a.document;
    apply(a, { kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 1 });
    expect(a.document.bodies.find((b) => b.id === other.body)).toEqual(
      prior.bodies.find((b) => b.id === other.body)
    );
    expect(a.document.bodies.find((b) => b.id === WORLD)).toEqual(
      prior.bodies.find((b) => b.id === WORLD)
    );
    expect(a.local.clocks[1]).toEqual({
      driverId: other.driver.id,
      anchor: 0,
      command: 0,
      time: 0,
      synced: true,
    });
    const before = a.document;
    for (const operation of [
      { kind: 'move-coordinate' as const, coordinate: f.driver.coordinate, target: 1.6 },
      { kind: 'move-coordinate' as const, coordinate: f.driver.coordinate, target: NaN },
      {
        kind: 'move-coordinate' as const,
        coordinate: { ...f.driver.coordinate, coordinate: 'angle' as const },
        target: 0,
      },
    ])
      expect(a.commit({ id: 'bad-coordinate', operations: [operation] }, state).ok).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(1);
  });
  it('moves a paused returning ram to the requested display coordinate and preserves its original start and return leg through history', () => {
    const f = nativeAxialCarriage('weld'),
      a = new BodyDocumentAuthority(f.document);
    const built = buildSimulationSnapshot(a.document, 0, {
      mode: 'static',
      gravity: { x: 0, y: 0 },
      path: { commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.carriage)!,
      part = built.snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    const index = part.inputs.findIndex(
      (input) => input.sample.direction === -1 && Math.abs(input.sample.command - 1.3) < 1e-9
    );
    const view = selectSimulationView(built.snapshot, {
      revision: 0,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(a.setSimulationView(view.value)).toBe(true);
    const before = a.document,
      display = a.display!,
      posed = { ...state, atStart: false };
    const result = a.commit(
      {
        id: 'posed-travel',
        operations: [{ kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 0.8 }],
      },
      posed
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.changed).toBe(true);
    expect(a.local.clocks[0].anchor).toBeCloseTo(0.4, 9);
    expect(a.local.clocks[0].command).toBeCloseTo(0.8, 9);
    expect(a.local.clocks[0].direction).toBe(-1);
    expect(a.local.clocks[0].time).toBeCloseTo((1.5 - 0.4 + 1.5 - 0.8) / 0.2, 8);
    expect(a.document.drivers[0].profile.initial).toBeCloseTo(0.4, 9);
    const pose = a.display!.poses.get(f.carriage)!;
    expect(pose.x).toBeCloseTo(1 + 3.8 * Math.cos(0.4), 9);
    expect(pose.y).toBeCloseTo(-2 + 3.8 * Math.sin(0.4), 9);
    expect(a.undoDepth).toBe(1);
    a.undo(posed);
    expect(a.document).toEqual(before);
    expect(a.display!.poses).toEqual(display.poses);
    expect(a.local.clocks).toEqual(display.clocks);
    a.redo(posed);
    expect(a.local.clocks[0].command).toBeCloseTo(0.8, 9);
  });
  it('refuses a narrow passive travel excursion even when the requested endpoint is back inside its stop', () => {
    const f = nativeCosineCarriage(-0.025, 0.99999),
      a = new BodyDocumentAuthority(f.document);
    expect(Math.cos(-0.025)).toBeLessThan(0.99999);
    expect(Math.cos(0.075)).toBeLessThan(0.99999);
    const before = a.document;
    const result = a.commit(
      {
        id: 'hidden-stop',
        operations: [{ kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 0.1 }],
      },
      state
    );
    expect(result.ok).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(0);
  });
  it('checks an interior passive stop in a loose sketch without refusing its valid nearby motion', () => {
    const f = nativeCosineCarriage(-0.025, 0.99999),
      factory = new BodyFactory(f.document);
    const origin = factory.document.bodies.find((body) => body.id === f.carriage)!.pose;
    const loose = factory.body('free rider', { ...origin, angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    factory.joint(
      'revolute',
      factory.attachment(f.carriage, { x: 0, y: 0 }),
      factory.attachment(loose, { x: 0, y: 0 })
    );
    const a = new BodyDocumentAuthority(factory.document);
    apply(a, { kind: 'move-coordinate', coordinate: f.driver.coordinate, target: -0.01 });
    const before = a.document;
    const result = a.commit(
      {
        id: 'loose-hidden-stop',
        operations: [{ kind: 'move-coordinate', coordinate: f.driver.coordinate, target: 0.1 }],
      },
      state
    );
    expect(result.ok).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(1);
  });
  it('quotes shared permissions and does not create history for an exact no-op', () => {
    const f = nativeLoadedRod(),
      a = new BodyDocumentAuthority(f.document);
    const operation: BodyCoordinateMove = {
      kind: 'move-coordinate',
      coordinate: f.driver.coordinate,
      target: 0,
    };
    expect(apply(a, operation).changed).toBe(false);
    expect(a.undoDepth).toBe(0);
    for (const s of [
      { ...state, playing: true },
      { ...state, atStart: false },
    ]) {
      const result = a.commit({ id: 'permission', operations: [operation] }, s);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.permission).toEqual(menuRefusal(s, 'start'));
    }
  });
});
