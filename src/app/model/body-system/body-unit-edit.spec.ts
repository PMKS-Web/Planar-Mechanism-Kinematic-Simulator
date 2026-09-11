import { nativeUnitFixture } from '../../../test-utils/verification/native-unit-fixture';
import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { nativeLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { NATIVE_EDIT_CONTEXT } from '../../../test-utils/verification/native-lifecycle-fixtures';
import { BodyDocumentAuthority } from './body-document-authority';
import { BodyUnits, SI_UNITS } from './body-units';
import { MaterialBody } from './material-body';
import { resolveMass } from './body-properties';
import { compileWeldGroups } from './weld-groups';
import { BodyFactory } from './body-factory';
import { WORLD } from './body-id';
import { buildSimulationSnapshot } from './build-simulation-snapshot';
import { selectSimulationView } from './simulation-view';
import { simulationBodyPointRates } from './simulation-body-readers';
import { simulationDriverEffort, simulationJointReaction } from './simulation-force-readers';
import { SETTINGS_AT_START_ONLY } from '../edit-permission';
import {
  decodeBodyDocument,
  encodeBodyDocument,
} from '../../services/transcoding/body-document-codec';

const CM: BodyUnits = { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' };
const ENGLISH: BodyUnits = { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' };
const state = NATIVE_EDIT_CONTEXT.state;
function convert(a: BodyDocumentAuthority, units: BodyUnits) {
  const result = a.commit(
    { id: `unit-${a.revision}`, operations: [{ kind: 'convert-units', units }] },
    state
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result;
}
describe('native physical unit conversion', () => {
  it('keeps hand-derived motion, reactions and drive torque through conversion and a solved motion window', () => {
    const f = nativeLoadedRod(),
      a = new BodyDocumentAuthority(f.document);
    for (const units of [CM, ENGLISH, SI_UNITS]) {
      convert(a, units);
      const built = buildSimulationSnapshot(a.document, a.revision, {
        mode: 'dynamic',
        gravity: { x: 0, y: 0 },
        path: { duration: 0.1, commandStep: 0.1 },
      });
      if (!built.ok) throw new Error(built.reason);
      const key = built.snapshot.bodyPartition.get(f.body)!,
        part = built.snapshot.partitions.get(key)!;
      if (!part.ok) throw new Error(part.reason);
      const selected = selectSimulationView(built.snapshot, {
        revision: a.revision,
        indices: new Map([[key, part.inputs.length - 1]]),
      });
      if (!selected.ok) throw new Error(selected.reason);
      const body = a.document.bodies.find((item) => item.id === f.body)!;
      if (body.kind !== 'material' || body.geometry.kind !== 'bar') throw new Error('Expected rod');
      const motion = simulationBodyPointRates(selected.value, f.body, {
        x: body.geometry.vertices[1].x / 2,
        y: 0,
      });
      const effort = simulationDriverEffort(selected.value, f.driver.id);
      const reaction = simulationJointReaction(selected.value, f.driver.coordinate.jointId, f.body);
      if (!motion.ok || !effort.ok || !reaction.ok) throw new Error('Expected physical result');
      const theta = 0.4 + 3 * 0.1;
      expect(motion.value.velocity.x).toBeCloseTo(-3 * Math.sin(theta), 9);
      expect(motion.value.velocity.y).toBeCloseTo(3 * Math.cos(theta), 9);
      expect(motion.value.acceleration.x).toBeCloseTo(-9 * Math.cos(theta), 9);
      expect(motion.value.acceleration.y).toBeCloseTo(-9 * Math.sin(theta), 9);
      expect(effort.value.unit).toBe('N*m');
      expect(effort.value.value).toBeCloseTo(20 * Math.cos(theta) - 3, 9);
      expect(reaction.value.wrench.force.x).toBeCloseTo(-18 * Math.cos(theta), 9);
      expect(reaction.value.wrench.force.y).toBeCloseTo(-18 * Math.sin(theta) + 10, 9);
    }
  });
  it('scales a locked welded fabrication, independent inertia, load scope and all authored view references', () => {
    const f = nativeUnitFixture(),
      a = new BodyDocumentAuthority(f.document),
      before = a.document;
    convert(a, CM);
    const d = a.document,
      bracket = d.bodies.find((body) => body.id === f.bracket)! as MaterialBody;
    expect(bracket.locked).toBe(true);
    expect(bracket.mass.mass.value).toBe(3000);
    expect(bracket.mass.inertia).toEqual({ mode: 'explicit', value: 50000 });
    expect(bracket.mass.center).toEqual({
      ...(before.bodies.find((body) => body.id === f.bracket)! as MaterialBody).mass.center,
      point: { x: 30, y: 20 },
    });
    expect(d.attachments.find((point) => point.id === f.tip)!.point).toEqual({ x: 200, y: 0 });
    expect(d.locks).toEqual([f.tip]);
    expect(d.holds[0]).toEqual({ ...before.holds[0], length: 200 });
    expect(d.forces[0].vector).toEqual({ x: 0, y: -10 });
    expect(d.forces[0].couple).toBe(300);
    expect(d.forces[0].presentation).toEqual({ color: '#456789', length: 120, zeroAngle: 0.7 });
    for (const member of d.forces[0].legacyGroupScope!.members) {
      const original = before.forces[0].legacyGroupScope!.members.find(
        (item) => item.bodyId === member.bodyId
      )!;
      expect(member.poseInReference.x).toBeCloseTo(original.poseInReference.x * 100, 9);
      expect(member.poseInReference.y).toBeCloseTo(original.poseInReference.y * 100, 9);
      expect(member.poseInReference.angle).toBe(original.poseInReference.angle);
    }
    expect(d.groups[0].mass).toEqual({
      mass: 7000,
      inertia: 80000,
      center: { point: { x: 60, y: 20 }, editAnchor: { attachmentId: f.tip } },
    });
    const groups = compileWeldGroups(d);
    if (!groups.ok) throw new Error(groups.code);
    expect(groups.groupOf.get(f.body)!.mass.mass).toBeCloseTo(7, 12);
    expect(groups.groupOf.get(f.body)!.mass.inertia).toBeCloseTo(8, 11);
    expect(d.synthesis!.length).toBe(200);
    expect(d.synthesis!.poses).toEqual([{ x: 100, y: 200, angle: 0.3 }]);
    expect(d.synthesis!.region).toEqual({ x: -100, y: -200, width: 600, height: 500 });
    expect(d.synthesis!.generated.attachments[0].at.x).toBeCloseTo(200 * Math.cos(0.4), 10);
    expect(d.view!.camera).toEqual({ center: { x: 200, y: -100 }, span: 1000 });
    expect(d.view!.backdrop).toEqual({
      ...before.view!.backdrop,
      center: { x: 300, y: 400 },
      width: 800,
    });
    expect(d.settings.forceUnit).toBe('kgf');
    expect(d.settings.objectScale).toBe(80);
    expect(d.settings.objectScale / d.view!.camera!.span).toBeCloseTo(0.08, 12);
    expect(d.settings.defaultDrive).toEqual({ angular: -2, linear: 30 });
    expect(d.drivers).toEqual(before.drivers);
    expect(d.limits).toEqual(before.limits);
    expect(a.undoDepth).toBe(1);
    a.undo(state);
    expect(a.document).toEqual(before);
    a.redo(state);
    expect(a.document).toEqual(d);
  });
  it('preserves independent hand masses and automatic inertias of a disk and triangle across metric and English storage', () => {
    const f = nativeUnitFixture(),
      a = new BodyDocumentAuthority(f.document);
    for (const units of [CM, ENGLISH, SI_UNITS]) {
      convert(a, units);
      const disk = a.document.bodies.find((body) => body.id === f.disk)! as MaterialBody;
      const triangle = a.document.bodies.find((body) => body.id === f.triangle)! as MaterialBody;
      const dm = resolveMass(disk, units),
        tm = resolveMass(triangle, units);
      expect(dm.mass).toBeCloseTo(16 * Math.PI, 10);
      expect(dm.inertia).toBeCloseTo(32 * Math.PI, 9);
      expect(tm.mass).toBeCloseTo(6, 11);
      expect(tm.inertia).toBeCloseTo(13 / 3, 10);
      expect(dm.center!.x).toBeCloseTo(0.5, 12);
      expect(dm.center!.y).toBeCloseTo(-0.2, 12);
      expect(tm.center!.x).toBeCloseTo(1, 12);
      expect(tm.center!.y).toBeCloseTo(2 / 3, 12);
      if (units === ENGLISH) {
        expect(a.document.forces[0].vector.y * 4.4482216152605).toBeCloseTo(-10, 11);
        expect(a.document.forces[0].couple * 4.4482216152605 * 0.0254).toBeCloseTo(3, 11);
        const bracket = a.document.bodies.find((body) => body.id === f.bracket)! as MaterialBody;
        if (bracket.mass.inertia.mode !== 'explicit') throw new Error('Expected explicit inertia');
        expect(bracket.mass.inertia.value * 0.45359237 * 0.0254 ** 2).toBeCloseTo(5, 10);
      }
    }
  });
  it('converts cylinder travel, speed, stroke and dimensions without changing angles or ownership', () => {
    const f = nativeAxialCarriage('weld'),
      a = new BodyDocumentAuthority(f.document);
    convert(a, CM);
    expect(a.document.drivers[0]).toEqual({
      ...f.driver,
      profile: { ...f.driver.profile, initial: 40, speed: 20 },
    });
    expect(a.local.clocks[0].anchor).toBeCloseTo(40, 10);
    const cylinder = a.document.assemblies[0];
    expect(cylinder.id).toBe(f.assembly.id);
    expect(cylinder.barrel).toBe(f.assembly.barrel);
    expect(cylinder.rod).toBe(f.assembly.rod);
    expect(cylinder.dimensions.barrelLength).toBe(f.assembly.dimensions.barrelLength * 100);
    expect(cylinder.dimensions.bore).toBe(f.assembly.dimensions.bore * 100);
    const limit = a.document.limits.find((item) => item.id === f.assembly.strokeLimit)!;
    expect(limit.lower).toBe(0);
    expect(limit.upper).toBe(150);
    const encoded = encodeBodyDocument(a.document);
    if (!encoded.ok) throw new Error(encoded.reason);
    const decoded = decodeBodyDocument(encoded.payload);
    if (!decoded.ok) throw new Error(decoded.reason);
    expect(decoded.document.assemblies).toEqual(a.document.assemblies);
    expect(decoded.document.drivers).toEqual(a.document.drivers);
  });
  it('converts a fixed, nonzero P coordinate clock and material-owned guide display', () => {
    const f = nativeLinearCarriage(),
      factory = new BodyFactory(f.document);
    factory.joint(
      'weld',
      factory.attachment(WORLD, { x: 2, y: -1 }),
      factory.attachment(f.body, { x: 0, y: 0 })
    );
    const document = {
      ...factory.document,
      joints: factory.document.joints.map((joint) =>
        joint.id === f.guide.id && joint.kind === 'prismatic'
          ? {
              ...joint,
              travelZero: -2,
              guideDisplay: { bodyId: WORLD, frame: joint.frameA, from: -2, to: 3 },
            }
          : joint
      ),
      drivers: [{ ...f.driver, profile: { ...f.driver.profile, speed: 0, initial: 2 } }],
    };
    const a = new BodyDocumentAuthority(document);
    convert(a, CM);
    expect(a.document.drivers[0].profile.initial).toBe(200);
    expect(a.local.clocks[0].anchor).toBe(200);
    expect(a.local.clocks[0].command).toBe(200);
    const guide = a.document.joints.find((joint) => joint.id === f.guide.id)!;
    if (guide.kind !== 'prismatic') throw new Error('Expected P');
    expect(guide.travelZero).toBe(-200);
    expect(guide.guideDisplay).toEqual({
      bodyId: WORLD,
      frame: f.guide.frameA,
      from: -200,
      to: 300,
    });
  });
  it('uses destination units for all dimensional operands regardless of unit-operation placement and keeps refusal atomic', () => {
    const f = nativeLinearCarriage();
    const conversion = { kind: 'convert-units' as const, units: CM };
    const loaded = nativeLoadedRod();
    const load = {
      kind: 'force-properties' as const,
      forceId: loaded.document.forces[0].id,
      change: { couple: 4 },
    };
    for (const operations of [
      [conversion, load],
      [load, conversion],
    ]) {
      const a = new BodyDocumentAuthority(loaded.document);
      const result = a.commit({ id: 'mixed-units', operations }, state);
      expect(result.ok).toBe(true);
      expect(a.document.forces[0].couple).toBe(4);
      expect(a.document.forces[0].point.x).toBe(200);
    }
    const move = {
      kind: 'force-properties' as const,
      forceId: 'missing' as never,
      change: { couple: 3 },
    };
    for (const operations of [
      [conversion, move],
      [move, conversion],
    ]) {
      const a = new BodyDocumentAuthority(f.document),
        before = a.document;
      expect(a.commit({ id: 'bad-batch', operations }, state).ok).toBe(false);
      expect(a.document).toBe(before);
      expect(a.undoDepth).toBe(0);
    }
    for (const current of [
      { ...state, playing: true },
      { ...state, atStart: false },
    ]) {
      const a = new BodyDocumentAuthority(f.document);
      const result = a.commit({ id: 'posed-units', operations: [conversion] }, current);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.permission).toEqual(SETTINGS_AT_START_ONLY);
    }
  });
  it('does not add history for a no-op and rejects invalid or ambiguous destinations', () => {
    const f = nativeUnitFixture(),
      a = new BodyDocumentAuthority(f.document),
      before = a.document;
    expect(convert(a, SI_UNITS).changed).toBe(false);
    expect(a.undoDepth).toBe(0);
    for (const units of [
      null,
      { ...SI_UNITS, length: 'yard' },
      { ...SI_UNITS, extra: 'unexpected' },
    ]) {
      expect(
        a.commit(
          { id: 'bad-units', operations: [{ kind: 'convert-units', units: units as BodyUnits }] },
          state
        ).ok
      ).toBe(false);
      expect(a.document).toBe(before);
    }
    expect(
      a.commit(
        {
          id: 'two-destinations',
          operations: [
            { kind: 'convert-units', units: CM },
            { kind: 'convert-units', units: ENGLISH },
          ],
        },
        state
      ).ok
    ).toBe(false);
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(0);
  });
  it('still enforces physical locks and holds on edits combined with conversion', () => {
    const f = nativeUnitFixture(),
      a = new BodyDocumentAuthority(f.document),
      before = a.document;
    const conversion = { kind: 'convert-units' as const, units: CM };
    const force = a.commit(
      {
        id: 'move-locked-load',
        operations: [
          conversion,
          {
            kind: 'force-properties',
            forceId: before.forces[0].id,
            change: { point: { x: 0, y: 0 } },
          },
        ],
      },
      state
    );
    expect(force.ok).toBe(false);
    if (!force.ok) expect(force.code).toBe('locked-position');
    const held = a.commit(
      {
        id: 'stretch-held-bar',
        operations: [
          conversion,
          { kind: 'attachment-position', attachmentId: f.tip, point: { x: 300, y: 0 } },
        ],
      },
      state
    );
    expect(held.ok).toBe(false);
    if (!held.ok) expect(held.code).toBe('held-dimension');
    expect(a.document).toBe(before);
    expect(a.undoDepth).toBe(0);
  });
});
