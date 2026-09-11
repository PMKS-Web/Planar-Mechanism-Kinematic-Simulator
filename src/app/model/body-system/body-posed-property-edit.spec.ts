import { BodyDocumentAuthority } from './body-document-authority';
import { BodyFactory } from './body-factory';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView, SimulationView } from './simulation-view';
import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyEditOperation } from './body-edit-types';
import { bodyForceEnds } from './body-force-edit';
import { withBodyEditFrame } from './body-edit-frame';
import { WORLD } from './body-id';
import { BodyUnits, SI_UNITS, unitFactors } from './body-units';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const state = { ...NATIVE_EDIT_CONTEXT.state, atStart: false, mode: 'analysis' as const };
function fixture(units: BodyUnits = SI_UNITS) {
  const rod = nativeLoadedRod(units, 'body'),
    carriage = nativeLinearCarriage(0.3, units);
  const length = unitFactors(units).length;
  const f = new BodyFactory({
    ...rod.document,
    bodies: [
      ...rod.document.bodies,
      ...carriage.document.bodies.filter((body) => body.id !== WORLD),
    ],
    attachments: [...rod.document.attachments, ...carriage.document.attachments],
    joints: [...rod.document.joints, ...carriage.document.joints],
    drivers: [rod.driver, carriage.driver],
  });
  const tracer = f.attachment(rod.body, { x: 1 / length, y: 0.2 / length });
  const other = f.attachment(rod.body, { x: 2 / length, y: 0.2 / length });
  const authority = new BodyDocumentAuthority(f.document);
  authority.setLocalState({
    ...authority.local,
    clocks: authority.local.clocks.map((clock) => ({ ...clock, synced: false })),
  });
  const result = buildSimulationSnapshot(authority.document, authority.revision, {
    mode: 'static',
    gravity: { x: 0, y: 0 },
    path: { duration: 0.4, commandStep: 0.3 },
  });
  if (!result.ok) throw new Error(result.reason);
  const indices = new Map(
    [...result.snapshot.partitions].map(([key, part]) => {
      if (!part.ok) throw new Error(part.reason);
      return [key, part.frame.partition.materialIds.includes(rod.body) ? 2 : 1];
    })
  );
  const selected = selectSimulationView(result.snapshot, { revision: authority.revision, indices });
  if (!selected.ok) throw new Error(selected.reason);
  expect(authority.setSimulationView(selected.value)).toBe(true);
  const edit = (...operations: BodyEditOperation[]) =>
    authority.commit({ id: 'posed', operations }, state);
  return { rod, carriage, tracer, other, authority, edit, view: selected.value, length };
}

describe('native properties through the displayed body frame', () => {
  it('captures actual independent samples in document units without changing design or history', () => {
    for (const units of [
      SI_UNITS,
      { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' } as const,
    ]) {
      const f = fixture(units),
        a = f.authority;
      expect(a.undoDepth).toBe(0);
      expect(a.document.bodies.find((body) => body.id === f.rod.body)!.pose.angle).toBe(0.4);
      expect(a.display!.poses.get(f.rod.body)!.angle).toBeCloseTo(1, 12);
      expect(a.local.clocks[0]).toMatchObject({
        anchor: 0,
        command: 0.6,
        synced: false,
        direction: 1,
      });
      expect(a.local.clocks[0].time).toBeCloseTo(0.2, 14);
      expect(a.display!.poses.get(f.carriage.body)!.x * f.length).toBeCloseTo(
        2 + 0.12 * Math.cos(0.4),
        10
      );
    }
  });
  it('switches a locked force between axes at the displayed angle, retaining both handles and all clocks', () => {
    const f = fixture(),
      a = f.authority,
      before = a.document,
      clocks = a.local.clocks;
    expect(
      f.edit({ kind: 'lock', targets: [{ kind: 'force', id: before.forces[0].id }], locked: true })
        .ok
    ).toBe(true);
    const ends = bodyForceEnds(withBodyEditFrame(a.document, a.display!), a.document.forces[0]);
    const result = f.edit({
      kind: 'force-properties',
      forceId: before.forces[0].id,
      change: { frame: 'world' },
    });
    if (!result.ok) throw new Error(result.message);
    expect(a.document.forces[0].vector.x).toBeCloseTo(10 * Math.sin(1), 12);
    expect(a.document.forces[0].vector.y).toBeCloseTo(-10 * Math.cos(1), 12);
    expect(a.document.bodies).toEqual(before.bodies);
    expect(a.local.clocks).toEqual(clocks);
    const after = bodyForceEnds(withBodyEditFrame(a.document, a.display!), a.document.forces[0]);
    ends.forEach((point, i) => {
      expect(after[i].x).toBeCloseTo(point.x, 12);
      expect(after[i].y).toBeCloseTo(point.y, 12);
    });
    a.undo(state);
    expect(a.document.forces[0].frame).toBe('body');
    expect(a.display!.poses.get(f.rod.body)!.angle).toBeCloseTo(1, 12);
    a.redo(state);
    expect(a.document.forces[0].frame).toBe('world');
    expect(a.local.clocks).toEqual(clocks);
  });
  it('preserves the direction of a locked zero-magnitude force when changing axes at a pose', () => {
    const f = fixture(),
      a = f.authority,
      id = a.document.forces[0].id;
    expect(f.edit({ kind: 'lock', targets: [{ kind: 'force', id }], locked: true }).ok).toBe(true);
    expect(
      f.edit({ kind: 'force-properties', forceId: id, change: { vector: { x: 0, y: 0 } } }).ok
    ).toBe(true);
    const result = f.edit({ kind: 'force-properties', forceId: id, change: { frame: 'world' } });
    if (!result.ok) throw new Error(result.message);
    expect(a.document.forces[0].presentation!.zeroAngle).toBeCloseTo(1 - Math.PI / 2, 12);
    expect(a.document.forces[0].vector).toEqual({ x: 0, y: 0 });
    expect(a.document.bodies.find((body) => body.id === f.rod.body)!.pose.angle).toBe(0.4);
  });
  it('assigns a load to a differently moving owner without moving its displayed point or vector', () => {
    const f = fixture(),
      a = f.authority;
    expect(
      f.edit({
        kind: 'lock',
        targets: [{ kind: 'force', id: a.document.forces[0].id }],
        locked: true,
      }).ok
    ).toBe(true);
    const result = f.edit({
      kind: 'force-owner',
      forceId: a.document.forces[0].id,
      bodyId: f.carriage.body,
    });
    if (!result.ok) throw new Error(result.message);
    const force = a.document.forces[0];
    const dx = 2 * Math.cos(1) - (2 + 0.12 * Math.cos(0.4));
    const dy = 2 * Math.sin(1) - (-1 + 0.12 * Math.sin(0.4));
    expect(force.point.x).toBeCloseTo(dx * Math.cos(0.4) + dy * Math.sin(0.4), 11);
    expect(force.point.y).toBeCloseTo(-dx * Math.sin(0.4) + dy * Math.cos(0.4), 11);
    expect(force.vector.x).toBeCloseTo(10 * Math.sin(0.6), 11);
    expect(force.vector.y).toBeCloseTo(-10 * Math.cos(0.6), 11);
    expect(a.document.drivers).toEqual(f.view.snapshot.document.drivers);
  });
  it('maps a free tracer from its displayed world target, preserves anchors and restores the view through history', () => {
    const f = fixture(),
      a = f.authority,
      before = a.document,
      clocks = a.local.clocks;
    const target = {
      x: 1.5 * Math.cos(1) - 0.7 * Math.sin(1),
      y: 1.5 * Math.sin(1) + 0.7 * Math.cos(1),
    };
    const result = f.edit({ kind: 'move-point', attachmentId: f.tracer, target });
    if (!result.ok) throw new Error(result.message);
    const point = a.document.attachments.find((item) => item.id === f.tracer)!.point;
    expect(point.x).toBeCloseTo(1.5, 12);
    expect(point.y).toBeCloseTo(0.7, 12);
    expect(a.document.bodies).toEqual(before.bodies);
    expect(a.document.drivers).toEqual(before.drivers);
    expect(a.local.clocks).toEqual(clocks);
    expect(a.undoDepth).toBe(1);
    const encoded = encodeBodyDocument(a.document);
    if (!encoded.ok) throw new Error(encoded.reason);
    const reopened = decodeBodyDocument(encoded.payload);
    if (!reopened.ok) throw new Error(reopened.reason);
    const fresh = new BodyDocumentAuthority(reopened.document);
    expect(fresh.display).toBeUndefined();
    expect(
      fresh.local.clocks.every((clock) => clock.command === clock.anchor && clock.time === 0)
    ).toBe(true);
    expect(fresh.document.bodies.find((body) => body.id === f.rod.body)!.pose.angle).toBe(0.4);
    a.undo(state);
    expect(a.document).toEqual(before);
    expect(a.local.clocks).toEqual(clocks);
    a.redo(state);
    expect(a.document.attachments.find((item) => item.id === f.tracer)!.point).toEqual(point);
    expect(a.display!.poses.get(f.rod.body)!.angle).toBeCloseTo(1, 12);
  });
  it('captures an angle hold at the displayed pose and persists its authored reference without repeated drift', () => {
    const f = fixture(),
      a = f.authority;
    expect(
      f.edit({ kind: 'hold', bodyId: f.rod.body, from: f.tracer, to: f.other, dimension: 'angle' })
        .ok
    ).toBe(true);
    expect(a.document.holds[0].angle).toBeCloseTo(0.4, 12);
    const held = a.document.holds;
    for (let i = 0; i < 4; i++)
      expect(
        f.edit({ kind: 'attachment-properties', attachmentId: f.tracer, change: { trace: true } })
          .ok
      ).toBe(true);
    expect(a.document.holds).toEqual(held);
    expect(a.undoDepth).toBe(2);
  });
  it('refuses incomplete, foreign and stale samples without disturbing the current view', () => {
    const f = fixture(),
      a = f.authority,
      old = a.display,
      clocks = a.local.clocks;
    const missing = selectSimulationView(f.view.snapshot, { revision: 0, indices: new Map() });
    if (!missing.ok) throw new Error(missing.reason);
    expect(a.setSimulationView(missing.value)).toBe(false);
    const foreign = {
      ...f.view,
      snapshot: { ...f.view.snapshot, document: { ...a.document, forces: [] } },
    } as SimulationView;
    expect(a.setSimulationView(foreign)).toBe(false);
    expect(a.display).toEqual(old);
    expect(a.local.clocks).toEqual(clocks);
    expect(
      f.edit({ kind: 'attachment-properties', attachmentId: f.tracer, change: { trace: true } }).ok
    ).toBe(true);
    expect(a.setSimulationView(f.view)).toBe(false);
    expect(a.display!.revision).toBe(1);
  });
  it('refuses a bulk conversion and locked tracer move without changing either the design or displayed state', () => {
    const f = fixture(),
      a = f.authority;
    expect(
      f.edit({ kind: 'lock', targets: [{ kind: 'attachment', id: f.tracer }], locked: true }).ok
    ).toBe(true);
    const before = a.document,
      local = a.local,
      display = a.display;
    const result = f.edit(
      { kind: 'force-properties', forceId: a.document.forces[0].id, change: { frame: 'world' } },
      { kind: 'move-point', attachmentId: f.tracer, target: { x: 3, y: 5 } }
    );
    expect(result).toMatchObject({ ok: false, code: 'locked-position' });
    expect(a.document).toBe(before);
    expect(a.local).toBe(local);
    expect(a.display).toBe(display);
    expect(a.undoDepth).toBe(1);
  });
  it('invalidates a displayed frame when its clock changes, and keeps permission/refusal atomic', () => {
    const f = fixture(),
      a = f.authority;
    const command = {
      id: 'axes',
      operations: [
        {
          kind: 'force-properties' as const,
          forceId: a.document.forces[0].id,
          change: { frame: 'world' as const },
        },
      ],
    };
    const preview = a.preview(command, state);
    if (!preview.ok) throw new Error(preview.message);
    expect(a.commit(preview, { ...state, playing: true })).toMatchObject({
      ok: false,
      code: 'permission',
    });
    expect(
      a.setLocalState({
        ...a.local,
        clocks: a.local.clocks.map((clock) => ({ ...clock, time: clock.time + 1 })),
      })
    ).toBe(true);
    expect(a.display).toBeUndefined();
    expect(a.commit(preview, state)).toMatchObject({ ok: false, code: 'permission' });
    expect(a.undoDepth).toBe(0);
    expect(a.document.forces[0].frame).toBe('body');
  });
  it('replans a preview after seeking another sample instead of converting against its old angle', () => {
    const f = fixture(),
      a = f.authority;
    const preview = a.preview(
      {
        id: 'axes',
        operations: [
          {
            kind: 'force-properties',
            forceId: a.document.forces[0].id,
            change: { frame: 'world' },
          },
        ],
      },
      state
    );
    if (!preview.ok) throw new Error(preview.message);
    const indices = new Map(
      [...f.view.samples].map(([key, sample]) => {
        if (!sample.ok) throw new Error(sample.reason);
        return [
          key,
          key === f.view.snapshot.bodyPartition.get(f.rod.body)
            ? 3
            : sample.value.input.sample.index,
        ];
      })
    );
    const later = selectSimulationView(f.view.snapshot, { revision: 0, indices });
    if (!later.ok) throw new Error(later.reason);
    expect(a.setSimulationView(later.value)).toBe(true);
    const result = a.commit(preview, state);
    if (!result.ok) throw new Error(result.message);
    expect(a.document.forces[0].vector.x).toBeCloseTo(10 * Math.sin(1.3), 12);
    expect(a.document.forces[0].vector.y).toBeCloseTo(-10 * Math.cos(1.3), 12);
    expect(result.event!.display!.revision).toBe(result.revision);
    const undone = a.undo(state);
    if (!undone.ok) throw new Error(undone.message);
    expect(undone.event!.display!.revision).toBe(undone.revision);
    expect(a.display!.poses.get(f.rod.body)!.angle).toBeCloseTo(1.3, 12);
  });
});
