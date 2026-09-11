import { NativeBodyDocumentService } from './native-body-document.service';
import { captureNativeClipboard } from './native-body-clipboard';
import { nativeUnitFixture } from '../../test-utils/verification/native-unit-fixture';
import { nativeAxialCarriage } from '../../test-utils/verification/native-cylinder-fixtures';
import {
  nativeThreeCylinders,
  NATIVE_EDIT_CONTEXT,
} from '../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocument } from '../model/body-system/body-document';
import { localToWorld } from '../model/body-system/body-frame';
import { BodyFactory } from '../model/body-system/body-factory';
import { MaterialBody } from '../model/body-system/material-body';
import { WORLD } from '../model/body-system/body-id';
import { compileWeldGroups } from '../model/body-system/weld-groups';
import { buildSimulationSnapshot } from '../model/body-system/build-simulation-snapshot';
import { selectSimulationView } from '../model/body-system/simulation-view';
import { canonicalBodyDocument } from './transcoding/body-document-canonical';
import { decodeBodyDocument, encodeBodyDocument } from './transcoding/body-document-codec';

const state = NATIVE_EDIT_CONTEXT.state;
const zero = { x: 0, y: 0 };
function open(document: BodyDocument) {
  const service = new NativeBodyDocumentService();
  const { version, units, settings, synthesis, view, ...records } = document;
  const result = service.commit(
    {
      id: 'fixture-open',
      operations: [
        { kind: 'convert-units', units },
        { kind: 'project', settings, synthesis, view },
        {
          kind: 'insert',
          records: { ...records, bodies: records.bodies.filter((body) => body.id !== WORLD) },
        },
      ],
    },
    state
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return service;
}
function read(payload: string) {
  const decoded = decodeBodyDocument(payload);
  if (!decoded.ok) throw new Error(JSON.stringify(decoded));
  return decoded.document;
}
function write(document: BodyDocument) {
  const encoded = encodeBodyDocument(document);
  if (!encoded.ok) throw new Error(JSON.stringify(encoded));
  return encoded.payload;
}
describe('native clipboard service integration', () => {
  it('captures only selected material without history, project data or later references to its source', () => {
    const f = nativeUnitFixture(),
      source = open(f.document);
    const events: unknown[] = [];
    source.changes.subscribe((event) => events.push(event));
    const revision = source.revision,
      depth = source.undoDepth;
    const copied = source.copy([f.body, f.bracket], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    expect(source.revision).toBe(revision);
    expect(source.undoDepth).toBe(depth);
    expect(events.length).toBe(0);
    const clip = read(copied.payload);
    expect(clip.bodies.length).toBe(3);
    expect(clip.synthesis).toBeUndefined();
    expect(clip.view).toBeUndefined();
    expect(clip.settings.objectScale).not.toBe(f.document.settings.objectScale);
    expect(copied.payload).not.toContain(f.disk);
    expect(
      clip.bodies.some((body) => body.kind === 'material' && body.label === 'Density disk')
    ).toBe(false);
    expect(
      source.commit(
        {
          id: 'delete-source',
          operations: [
            { kind: 'delete', targets: [{ kind: 'group', members: [f.body, f.bracket] }] },
          ],
        },
        state
      ).ok
    ).toBe(true);
    expect(source.clipboard).toBe(copied.payload);
    const destination = new NativeBodyDocumentService();
    expect(destination.paste({ x: 7, y: -4 }, state, copied.payload).ok).toBe(true);
    expect(destination.document.forces.length).toBe(1);
    expect(destination.document.groups.find((group) => group.mass)!.mass!.mass).toBe(7);
    expect(destination.undoDepth).toBe(1);
    expect(source.document.forces.length).toBe(0);
    expect(canonicalBodyDocument(read(write(destination.document)))).toBe(
      canonicalBodyDocument(destination.document)
    );
  });
  it('converts source mass, independent inertia, force and geometry into destination units while retaining destination settings', () => {
    const f = nativeUnitFixture(),
      source = open(f.document);
    const cm = { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' } as const;
    expect(
      source.commit(
        { id: 'source-units', operations: [{ kind: 'convert-units', units: cm }] },
        state
      ).ok
    ).toBe(true);
    const copied = source.copy([f.body, f.bracket], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const destination = new NativeBodyDocumentService();
    const english = { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' } as const;
    expect(
      destination.commit(
        { id: 'destination-units', operations: [{ kind: 'convert-units', units: english }] },
        state
      ).ok
    ).toBe(true);
    const settings = destination.document.settings;
    expect(destination.paste({ x: 10, y: -5 }, state, copied.payload).ok).toBe(true);
    expect(destination.document.units).toEqual(english);
    expect(destination.document.settings).toEqual(settings);
    const rod = destination.document.bodies.find(
      (body) => body.kind === 'material' && body.label === 'loaded rod'
    )! as MaterialBody;
    const originalRod = f.document.bodies.find((body) => body.id === f.body)! as MaterialBody;
    expect(rod.pose.x).toBeCloseTo(originalRod.pose.x / 0.0254 + 10, 10);
    expect(rod.pose.y).toBeCloseTo(originalRod.pose.y / 0.0254 - 5, 10);
    const bracket = destination.document.bodies.find(
      (body) => body.kind === 'material' && body.label === 'welded bracket'
    )! as MaterialBody;
    if (bracket.mass.inertia.mode !== 'explicit') throw new Error('Expected explicit inertia');
    expect(bracket.mass.inertia.value * 0.45359237 * 0.0254 ** 2).toBeCloseTo(5, 10);
    expect(destination.document.forces[0].vector.y * 4.4482216152605).toBeCloseTo(-10, 10);
    expect(destination.document.forces[0].couple * 4.4482216152605 * 0.0254).toBeCloseTo(3, 10);
    const groups = compileWeldGroups(destination.document);
    if (!groups.ok) throw new Error(groups.code);
    const group = groups.groups.find((item) => item.members.has(bracket.id))!;
    expect(group.mass.mass).toBeCloseTo(7, 10);
    expect(group.mass.inertia).toBeCloseTo(8, 10);
  });
  it('pastes repeatedly with disjoint IDs and one event/history entry per paste, and restores exact selections', () => {
    const f = nativeThreeCylinders(),
      source = open(f.document);
    const copied = source.copy(
      f.cylinders.map((c) => c.rod),
      false,
      state
    );
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const destination = new NativeBodyDocumentService(),
      events: unknown[] = [];
    destination.changes.subscribe((event) => events.push(event));
    const preview = destination.previewPaste(zero, state, copied.payload);
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(events.length).toBe(0);
    expect(destination.commit(preview, state).ok).toBe(true);
    const first = destination.document,
      selection = destination.local.selection;
    expect(destination.paste({ x: 10, y: 0 }, state, copied.payload).ok).toBe(true);
    expect(events.length).toBe(2);
    expect(destination.document.assemblies.length).toBe(6);
    expect(destination.document.junctions.length).toBe(2);
    const selected = destination.local.selection;
    expect(
      selected.some((ref) => selection.some((old) => JSON.stringify(ref) === JSON.stringify(old)))
    ).toBe(false);
    const final = destination.document;
    expect(destination.undo(state).ok).toBe(true);
    expect(destination.document).toEqual(first);
    expect(destination.local.selection).toEqual(selection);
    expect(destination.redo(state).ok).toBe(true);
    expect(destination.document).toEqual(final);
    expect(destination.local.selection).toEqual(selected);
    expect(events.length).toBe(4);
  });
  it('keeps the previous clipboard and destination intact on corrupt input, invalid selection or a refused paste', () => {
    const f = nativeAxialCarriage(),
      service = open(f.document);
    const good = service.copy([f.assembly.rod], true, state);
    if (!good.ok) throw new Error(JSON.stringify(good));
    expect(service.copy([WORLD], true, state).ok).toBe(false);
    expect(service.clipboard).toBe(good.payload);
    const before = service.document,
      depth = service.undoDepth,
      local = service.local;
    expect(service.paste(zero, state, good.payload.slice(0, -1)).ok).toBe(false);
    expect(service.paste(zero, { ...state, playing: true }, good.payload).ok).toBe(false);
    expect(service.paste({ x: NaN, y: 0 }, state, good.payload).ok).toBe(false);
    expect(service.document).toEqual(before);
    expect(service.undoDepth).toBe(depth);
    expect(service.local).toEqual(local);
    expect(service.clipboard).toBe(good.payload);
  });
  it('captures a returning cylinder display as an immutable new start, not its authored start or a later seek', () => {
    const f = nativeAxialCarriage('weld'),
      source = open(f.document);
    const built = buildSimulationSnapshot(source.document, source.revision, {
      mode: 'static',
      gravity: zero,
      path: { commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.carriage)!,
      part = built.snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    const index = part.inputs.findIndex(
      (input) => input.sample.direction === -1 && !input.reversal
    );
    const view = selectSimulationView(built.snapshot, {
      revision: source.revision,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(source.setSimulationView(view.value)).toBe(true);
    const clocks = source.local.clocks;
    const copied = source.copy([f.assembly.barrel, f.carriage], true, { ...state, atStart: false });
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const captured = read(copied.payload);
    expect(captured.drivers[0].profile.initial).toBeCloseTo(part.inputs[index].sample.command, 10);
    expect(source.local.clocks).toEqual(clocks);
    expect(source.document.drivers[0].profile.initial).toBe(0.4);
    const destination = new NativeBodyDocumentService();
    expect(destination.paste(zero, state, copied.payload).ok).toBe(true);
    expect(destination.local.clocks[0].time).toBe(0);
    expect(destination.local.clocks[0].anchor).toBeCloseTo(part.inputs[index].sample.command, 10);
    const noFrame = captureNativeClipboard(f.document, 0, [f.assembly.rod], true, {
      ...state,
      atStart: false,
    });
    expect(noFrame.ok).toBe(false);
    if (!noFrame.ok) expect(noFrame.code).toBe('stale-pose');
  });
  it('preserves a complete grounded aggregate in an empty destination and refuses ambiguous merger into another fixed body', () => {
    const f = new BodyFactory();
    const body = f.body('Base', { x: 2, y: 1, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    f.joint('weld', f.attachment(WORLD, zero), f.attachment(body, zero));
    const source = open({
      ...f.document,
      groups: [
        {
          members: [WORLD, body],
          frameBody: WORLD,
          label: 'Measured foundation',
          presentation: { fill: '#123456', hidden: false, showCenter: true },
          mass: { mass: 9, inertia: 5, center: { point: { x: 2.5, y: 1.2 }, editAnchor: 'grid' } },
        },
      ],
    });
    const copied = source.copy([body], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const destination = new NativeBodyDocumentService();
    expect(destination.paste({ x: 4, y: -3 }, state, copied.payload).ok).toBe(true);
    expect(destination.document.groups[0].label).toBe('Measured foundation');
    expect(destination.document.groups[0].mass!.center!.point).toEqual({ x: 6.5, y: -1.8 });
    const before = destination.document,
      depth = destination.undoDepth;
    const refused = destination.paste({ x: 8, y: 0 }, state, copied.payload);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('aggregate-properties');
    expect(destination.document).toEqual(before);
    expect(destination.undoDepth).toBe(depth);
  });
  it('replans a stale paste in the destination units without rereading a changed source clipboard', () => {
    const f = nativeAxialCarriage(),
      source = open(f.document),
      destination = new NativeBodyDocumentService();
    const copied = source.copy([f.assembly.rod], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const preview = destination.previewPaste({ x: 10, y: 0 }, state, copied.payload);
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(source.copy([f.carriage], false, state).ok).toBe(true);
    expect(
      destination.commit(
        {
          id: 'cm',
          operations: [
            {
              kind: 'convert-units',
              units: { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' },
            },
          ],
        },
        state
      ).ok
    ).toBe(true);
    expect(destination.commit(preview, state).ok).toBe(true);
    expect(destination.document.assemblies.length).toBe(1);
    const assembly = destination.document.assemblies[0];
    expect(assembly.dimensions.barrelLength).toBe(300);
    const barrel = destination.document.bodies.find((body) => body.id === assembly.barrel)!;
    expect(barrel.pose.x).toBeCloseTo(110, 10);
    expect(barrel.pose.y).toBeCloseTo(-200, 10);
    expect(destination.document.drivers[0].profile.initial).toBeCloseTo(40, 10);
    expect(destination.local.clocks[0].anchor).toBeCloseTo(40, 10);
  });
  it('preserves a paused destination clock and authored pose when an independent grounded ram is pasted', () => {
    const f = nativeAxialCarriage('weld'),
      destination = open(f.document);
    const source = open(f.document);
    const copied = source.copy([f.assembly.barrel, f.carriage], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const built = buildSimulationSnapshot(destination.document, destination.revision, {
      mode: 'static',
      gravity: zero,
      path: { commandStep: 0.1 },
    });
    if (!built.ok) throw new Error(built.reason);
    const key = built.snapshot.bodyPartition.get(f.carriage)!,
      part = built.snapshot.partitions.get(key)!;
    if (!part.ok) throw new Error(part.reason);
    const index = part.inputs.findIndex(
      (input) => input.sample.direction === -1 && !input.reversal
    );
    const view = selectSimulationView(built.snapshot, {
      revision: destination.revision,
      indices: new Map([[key, index]]),
    });
    if (!view.ok) throw new Error(view.reason);
    expect(destination.setSimulationView(view.value)).toBe(true);
    const before = destination.document,
      local = destination.local,
      frame = destination.display;
    expect(
      destination.paste({ x: 10, y: 0 }, { ...state, atStart: false }, copied.payload).ok
    ).toBe(true);
    expect(destination.local.clocks.find((clock) => clock.driverId === f.driver.id)).toEqual(
      local.clocks[0]
    );
    for (const body of before.bodies)
      expect(destination.document.bodies.find((item) => item.id === body.id)).toEqual(body);
    expect(destination.undo({ ...state, atStart: false }).ok).toBe(true);
    expect(destination.document).toEqual(before);
    expect(destination.local).toEqual(local);
    expect(destination.display!.poses).toEqual(frame!.poses);
  });
  it('refuses a structurally valid clipboard whose drive disagrees with its pose, without changing the destination', () => {
    const f = nativeAxialCarriage(),
      source = open(f.document);
    const copied = source.copy([f.assembly.rod], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    const clip = read(copied.payload);
    const invalid = {
      ...clip,
      drivers: clip.drivers.map((driver) => ({
        ...driver,
        profile: { ...driver.profile, initial: 0.9 },
      })),
    };
    const payload = write(invalid);
    const destination = new NativeBodyDocumentService(),
      before = destination.document;
    const result = destination.paste(zero, state, payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid-document');
    expect(destination.document).toEqual(before);
    expect(destination.undoDepth).toBe(0);
  });
  it('preserves an incoming aggregate through a zero-inertia frame addition but refuses a real inertia addition', () => {
    const f = new BodyFactory();
    const incoming = f.body('Measured base', { x: 2, y: 1, angle: 0.4 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    f.joint('weld', f.attachment(WORLD, zero), f.attachment(incoming, zero));
    const source = open({
      ...f.document,
      groups: [
        {
          members: [WORLD, incoming],
          frameBody: WORLD,
          mass: { mass: 9, inertia: 5, center: { point: { x: 2.5, y: 1.2 }, editAnchor: 'grid' } },
        },
      ],
    });
    const copied = source.copy([incoming], true, state);
    if (!copied.ok) throw new Error(JSON.stringify(copied));
    for (const inertia of [0, 0.5]) {
      const factory = new BodyFactory();
      const base = factory.body('Existing support', { x: -2, y: 0, angle: 0.2 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]);
      factory.joint('weld', factory.attachment(WORLD, zero), factory.attachment(base, zero));
      const destination = open({
        ...factory.document,
        bodies: factory.document.bodies.map((body) =>
          body.kind === 'world'
            ? body
            : {
                ...body,
                mass: {
                  ...body.mass,
                  mass: { mode: 'explicit', value: 0 },
                  inertia: { mode: 'explicit', value: inertia },
                },
              }
        ),
        groups: [
          {
            members: [WORLD, base],
            frameBody: base,
            label: 'Destination foundation',
            presentation: { fill: '#abcdef', hidden: false, showCenter: true },
          },
        ],
      });
      const before = destination.document;
      const result = destination.paste(zero, state, copied.payload);
      if (inertia === 0) {
        if (!result.ok) throw new Error(JSON.stringify(result));
        expect(destination.document.groups.length).toBe(1);
        expect(destination.document.groups[0].label).toBe('Destination foundation');
        const annotation = destination.document.groups[0];
        expect(annotation.mass!.mass).toBe(9);
        expect(annotation.mass!.inertia).toBe(5);
        const frame = destination.document.bodies.find(
          (body) => body.id === annotation.frameBody
        )!.pose;
        const center = localToWorld(frame, annotation.mass!.center!.point);
        expect(center.x).toBeCloseTo(2.5, 10);
        expect(center.y).toBeCloseTo(1.2, 10);
        expect(destination.document.groups[0].members).toContain(base);
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('aggregate-properties');
        expect(destination.document).toEqual(before);
      }
    }
  });
});
