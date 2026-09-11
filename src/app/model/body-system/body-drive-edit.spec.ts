import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyEditOperation } from './body-edit-types';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { newRecordId, WORLD } from './body-id';
import {
  encodeBodyDocument,
  decodeBodyDocument,
} from '../../services/transcoding/body-document-codec';
import { menuRefusal } from '../edit-permission';

const state = NATIVE_EDIT_CONTEXT.state,
  posed = { ...state, atStart: false };
function commit(a: BodyDocumentAuthority, operations: readonly BodyEditOperation[]) {
  const result = a.commit({ id: `drive-edit-${a.revision}`, operations }, state);
  if (!result.ok) throw new Error(result.message);
  return result;
}
function returningCylinder() {
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
  return { f, a };
}

describe('native coordinate drive and limit commands', () => {
  it('starts a stopped input in its newly selected direction while another machine remains displaced', () => {
    for (const speed of [3, -3]) {
      const f = nativeLoadedRod(),
        other = nativeLinearCarriage();
      const document = {
        ...f.document,
        bodies: [
          ...f.document.bodies,
          ...other.document.bodies.filter((body) => body.id !== WORLD),
        ],
        attachments: [...f.document.attachments, ...other.document.attachments],
        joints: [...f.document.joints, ...other.document.joints],
        drivers: [{ ...f.driver, profile: { ...f.driver.profile, speed: 0 } }, other.driver],
      };
      const a = new BodyDocumentAuthority(document);
      const built = buildSimulationSnapshot(a.document, 0, {
        mode: 'static',
        gravity: { x: 0, y: 0 },
        path: { duration: 1, commandStep: 0.1 },
      });
      if (!built.ok) throw new Error(built.reason);
      const rodKey = built.snapshot.bodyPartition.get(f.body)!;
      const view = selectSimulationView(built.snapshot, {
        revision: 0,
        indices: new Map(
          [...built.snapshot.partitions.keys()].map((key) => [key, key === rodKey ? 0 : 1])
        ),
      });
      if (!view.ok) throw new Error(view.reason);
      expect(a.setSimulationView(view.value)).toBe(true);
      const otherClock = a.local.clocks[1];
      const result = a.commit(
        {
          id: 'start-stopped-drive',
          operations: [{ kind: 'driver-speed', driverId: f.driver.id, speed }],
        },
        posed
      );
      if (!result.ok) throw new Error(result.message);
      expect(a.local.clocks[0].time).toBe(0);
      expect(a.local.clocks[0].direction).toBe(speed > 0 ? 1 : -1);
      expect(a.local.clocks[1]).toEqual(otherClock);
    }
  });
  it('adds a driver at the current coordinate, keeps its identity on speed edits, and removes it with one history entry each', () => {
    const f = nativeLoadedRod(),
      a = new BodyDocumentAuthority({ ...f.document, drivers: [] });
    const command = {
      id: 'new-drive',
      operations: [{ kind: 'add-driver' as const, coordinate: f.driver.coordinate, speed: -2 }],
    };
    const preview = a.preview(command, state);
    if (!preview.ok) throw new Error(preview.message);
    expect(a.preview(command, state)).toEqual(preview);
    expect(a.commit(preview, state).ok).toBe(true);
    const driver = a.document.drivers[0];
    expect(driver.coordinate).toEqual(f.driver.coordinate);
    expect(driver.profile).toEqual({ kind: 'constant-speed', initial: 0, speed: -2 });
    const before = a.document.bodies;
    commit(a, [{ kind: 'driver-speed', driverId: driver.id, speed: 3 }]);
    expect(a.document.drivers[0].id).toBe(driver.id);
    expect(a.document.drivers[0].profile.initial).toBe(0);
    expect(a.document.bodies).toEqual(before);
    commit(a, [{ kind: 'remove-driver', driverId: driver.id }]);
    expect(a.document.drivers).toEqual([]);
    expect(a.local.clocks).toEqual([]);
    expect(a.undoDepth).toBe(3);
    a.undo(state);
    expect(a.document.drivers[0].id).toBe(driver.id);
    expect(a.document.drivers[0].profile.speed).toBe(3);
  });
  it('refuses a duplicate coordinate drive or an unavailable coordinate without applying an earlier property edit', () => {
    const f = nativeLoadedRod(),
      a = new BodyDocumentAuthority(f.document);
    for (const coordinate of [
      f.driver.coordinate,
      { ...f.driver.coordinate, coordinate: 'travel' as const },
    ]) {
      const before = a.document;
      const result = a.commit(
        {
          id: 'bad-drive',
          operations: [
            { kind: 'body-properties', bodyId: f.body, change: { label: 'Should not stick' } },
            { kind: 'add-driver', coordinate, speed: 1 },
          ],
        },
        state
      );
      expect(result.ok).toBe(false);
      expect(a.document).toBe(before);
      expect(a.undoDepth).toBe(0);
    }
  });
  it('updates a named limit among two on the same coordinate independently of record order', () => {
    const f = nativeLinearCarriage();
    const first = {
      id: newRecordId<'limit'>(),
      coordinate: f.driver.coordinate,
      lower: -1,
      upper: 2,
    };
    const second = {
      id: newRecordId<'limit'>(),
      coordinate: f.driver.coordinate,
      lower: -0.5,
      upper: 0.5,
    };
    for (const limits of [
      [first, second],
      [second, first],
    ]) {
      const a = new BodyDocumentAuthority({ ...f.document, limits });
      commit(a, [{ kind: 'limit-bounds', limitId: second.id, lower: -0.25, upper: 0.6 }]);
      expect(a.document.limits.find((item) => item.id === first.id)).toEqual(first);
      expect(a.document.limits.find((item) => item.id === second.id)).toEqual({
        ...second,
        lower: -0.25,
        upper: 0.6,
      });
      commit(a, [{ kind: 'remove-limit', limitId: second.id }]);
      expect(a.document.limits).toEqual([first]);
    }
  });
  it('protects the cylinder stroke record while permitting a separate working limit and its drive', () => {
    const f = nativeAxialCarriage('weld'),
      a = new BodyDocumentAuthority(f.document);
    for (const operation of [
      { kind: 'remove-limit' as const, limitId: f.assembly.strokeLimit },
      { kind: 'limit-bounds' as const, limitId: f.assembly.strokeLimit, lower: 0, upper: 1 },
    ]) {
      const result = a.commit({ id: 'stroke-protected', operations: [operation] }, state);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('assembly-interior');
    }
    commit(a, [
      { kind: 'add-limit', coordinate: f.driver.coordinate, lower: 0.2, upper: 1 },
      { kind: 'driver-speed', driverId: f.driver.id, speed: -0.3 },
    ]);
    expect(a.document.limits.find((limit) => limit.id === f.assembly.strokeLimit)).toEqual(
      f.document.limits.find((limit) => limit.id === f.assembly.strokeLimit)
    );
    expect(a.document.drivers[0].profile.speed).toBe(-0.3);
  });
  it('retimes a returning cylinder and reverses the selected direction when the speed sign changes', () => {
    for (const speed of [0.4, -0.4]) {
      const { f, a } = returningCylinder(),
        display = a.display!,
        before = a.document;
      const result = a.commit(
        { id: 'retime', operations: [{ kind: 'driver-speed', driverId: f.driver.id, speed }] },
        posed
      );
      if (!result.ok) throw new Error(result.message);
      expect(result.event!.plan!.anchors![0].status).toBe('retained');
      expect(a.local.clocks[0].anchor).toBeCloseTo(0.4, 9);
      expect(a.local.clocks[0].command).toBeCloseTo(1.3, 9);
      expect(a.local.clocks[0].direction).toBe(speed > 0 ? -1 : 1);
      expect(a.local.clocks[0].time).toBeCloseTo(
        speed > 0 ? (1.5 - 0.4 + 1.5 - 1.3) / 0.4 : (0.4 + 1.3) / 0.4,
        8
      );
      expect(a.display!.poses).toEqual(display.poses);
      expect(a.document.drivers[0].id).toBe(f.driver.id);
      const encoded = encodeBodyDocument(a.document);
      if (!encoded.ok) throw new Error(encoded.reason);
      const decoded = decodeBodyDocument(encoded.payload);
      if (!decoded.ok) throw new Error(decoded.reason);
      expect(decoded.document.drivers).toEqual(a.document.drivers);
      const reopened = new BodyDocumentAuthority(decoded.document);
      expect(reopened.local.clocks[0].time).toBe(0);
      expect(reopened.local.clocks[0].command).toBeCloseTo(0.4, 9);
      a.undo(posed);
      expect(a.document).toEqual(before);
      expect(a.display!.poses).toEqual(display.poses);
    }
  });
  it('quotes the shared paused/analysis boundary and refuses invalid values atomically', () => {
    const { f, a } = returningCylinder();
    const speed = { kind: 'driver-speed' as const, driverId: f.driver.id, speed: 0.4 };
    const before = a.document;
    const playing = a.commit({ id: 'playing', operations: [speed] }, { ...posed, playing: true });
    expect(playing.ok).toBe(false);
    if (!playing.ok)
      expect(playing.permission).toEqual(menuRefusal({ ...posed, playing: true }, 'attachment'));
    const limit = {
      kind: 'add-limit' as const,
      coordinate: f.driver.coordinate,
      lower: 0.2,
      upper: 1.4,
    };
    const analysis = { ...posed, mode: 'analysis' as const };
    const refused = a.commit({ id: 'analysis-limit', operations: [limit] }, analysis);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.permission).toEqual(menuRefusal(analysis, 'start'));
    for (const operations of [
      [{ ...speed, speed: NaN }],
      [{ ...speed, driverId: newRecordId<'driver'>() }],
      [{ ...limit, lower: 2, upper: 1 }],
      [{ ...limit, upper: Infinity }],
    ])
      expect(a.commit({ id: 'invalid', operations }, posed).ok).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(0);
    expect(a.commit({ id: 'analysis-speed', operations: [speed] }, analysis).ok).toBe(true);
    const absentFrame = new BodyDocumentAuthority(f.document);
    const withoutPose = absentFrame.commit({ id: 'missing-frame', operations: [speed] }, posed);
    expect(withoutPose.ok).toBe(false);
    if (!withoutPose.ok) expect(withoutPose.permission).toEqual(menuRefusal(posed, 'start'));
  });
  it('resets a positively excluded anchor but refuses a limit that excludes the current displayed pose', () => {
    const { f, a } = returningCylinder(),
      before = a.document;
    const refused = a.commit(
      {
        id: 'exclude-display',
        operations: [{ kind: 'add-limit', coordinate: f.driver.coordinate, lower: 0, upper: 1 }],
      },
      posed
    );
    expect(refused.ok).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(0);
    const accepted = a.commit(
      {
        id: 'exclude-anchor',
        operations: [
          { kind: 'add-limit', coordinate: f.driver.coordinate, lower: 0.6, upper: 1.4 },
        ],
      },
      posed
    );
    if (!accepted.ok) throw new Error(accepted.message);
    expect(accepted.event!.plan!.anchors![0].status).toBe('unreachable');
    expect(a.local.clocks[0].anchor).toBeCloseTo(1.3, 9);
    expect(a.local.clocks[0].time).toBe(0);
    expect(a.document.drivers[0].profile.initial).toBeCloseTo(1.3, 9);
  });
});
