import { nativeTriangleFoundation } from '../../../test-utils/verification/native-triangle-foundation-fixture';
import { nativeSeparateFoundations } from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { BodyId, newRecordId, WORLD } from './body-id';
import { Point, relativePose } from './body-frame';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { solveBodyForceFrame } from './body-force-frame';
import { BodyForceFrame } from './force-frame-result';
import { fixedForceComponents } from './fixed-force-components';
import {
  fixedJointBodyWrench,
  solveFixedForceComponents,
  FixedForceSnapshot,
} from './fixed-force-snapshot';

const GRAVITY = { x: 0, y: -9.81 };
function prepare(document: BodyDocument, gravity: Point = GRAVITY) {
  const compilation = compileBodyDocument(document);
  if (!compilation.ok) throw new Error(JSON.stringify(compilation.issues));
  const system = compilation.system;
  const frames = document.drivers.map((driver) => {
    const partition = system.partitions.find((part) =>
      part.drivers.some((item) => item.id === driver.id)
    )!;
    const admitted = admitBodyPartition(system, partition);
    if (!admitted.ok) throw new Error(admitted.reason);
    const frame = solveBodyForceFrame(
      document,
      system,
      admitted.frame,
      {
        sample: {
          revision: 5,
          partitionKey: partition.key,
          index: 0,
          time: 0,
          command: driver.profile.initial,
          direction: 1,
        },
        pose: { ok: true, poses: admitted.poses, commands: admitted.commands },
      },
      { mode: 'static', gravity }
    );
    if (!frame.ok) throw new Error(frame.reason);
    return frame;
  });
  const run = (samples: readonly BodyForceFrame[] = frames) =>
    solveFixedForceComponents(document, system, 5, samples, { mode: 'static', gravity });
  return { system, frames, run };
}
function componentResult(snapshot: FixedForceSnapshot, body: BodyId) {
  if (!snapshot.ok) throw new Error(snapshot.reason);
  return snapshot.components.get(snapshot.componentOf.get(body)!)!.result;
}

describe('fixed force availability by material component', () => {
  it('balances a two-body triangle foundation from its independent crank samples', () => {
    const fixture = nativeTriangleFoundation(),
      [left, right] = fixture.foundations;
    // Moments about (0,0) and (4,0), with H acting at (1,2) on the left:
    // Hy - 2Hx = 5 + 10 cos(left); 3Hy + 2Hx = -15 + 10 cos(right).
    const hy = 2.5 * (Math.cos(left.angle) + Math.cos(right.angle) - 1);
    const hx = (hy - 5 - 10 * Math.cos(left.angle)) / 2;
    for (const document of [
      fixture.document,
      {
        ...fixture.document,
        bodies: [...fixture.document.bodies].reverse(),
        joints: [...fixture.document.joints].reverse(),
      },
    ]) {
      const f = prepare(document, { x: 0, y: 0 });
      const snapshot = f.run([...f.frames].reverse());
      expect(componentResult(snapshot, left.body).ok).toBe(true);
      for (const [joint, body, x, y, moment] of [
        [left.support, left.body, -hx, 10 - hy, 0],
        [right.support, right.body, hx, 10 + hy, 0],
        [fixture.apex, left.body, hx, hy, hy - 2 * hx],
        [fixture.apex, right.body, -hx, -hy, 3 * hy + 2 * hx],
      ] as const) {
        const wrench = fixedJointBodyWrench(snapshot, joint.id, body);
        if (!wrench.ok) throw new Error(wrench.reason);
        expect(wrench.value.force.x).toBeCloseTo(x, 9);
        expect(wrench.value.force.y).toBeCloseTo(y, 9);
        expect(wrench.value.moment).toBeCloseTo(moment, 9);
      }
      const missing = f.run(f.frames.slice(0, 1));
      expect(componentResult(missing, left.body)).toMatchObject({
        ok: false,
        reason: 'missing-sample',
      });
      expect(componentResult(missing, right.body)).toMatchObject({
        ok: false,
        reason: 'missing-sample',
      });
    }
  });

  it('keeps a selected shared-support policy on its own foundation', () => {
    const fixture = nativeSeparateFoundations(),
      [first, second] = fixture.foundations;
    const factory = new BodyFactory({
      ...fixture.document,
      joints: fixture.document.joints.filter((joint) => joint.id !== first.support.id),
    });
    const supports = [0, 1].map((x) =>
      factory.joint(
        'revolute',
        factory.attachment(WORLD, { x, y: 0 }),
        factory.attachment(first.body, { x, y: 0 })
      )
    );
    const f = prepare(factory.document);
    const component = fixedForceComponents(factory.document, f.system).find((item) =>
      item.bodies.includes(first.body)
    )!;
    const policies = new Map([[component.key, 'evenest' as const]]);
    const result = solveFixedForceComponents(factory.document, f.system, 5, f.frames, {
      mode: 'static',
      gravity: GRAVITY,
      supportPolicies: policies,
    });
    if (!result.ok) throw new Error(result.reason);
    for (const support of supports) {
      const pair = result.joints.get(support.id);
      if (!pair?.ok) throw new Error(pair?.reason ?? 'missing');
      expect(pair.value.basis).toBe('evenest');
    }
    const other = componentResult(result, second.body);
    if (!other.ok) throw new Error(other.reason);
    expect(other.supportPolicy).toBe('unique');
    expect(other.conditional).toBe(false);
    const weld = result.joints.get(second.support.id);
    if (!weld?.ok) throw new Error(weld?.reason ?? 'missing');
    expect(weld.value.basis).toBe('unique');
    policies.clear();
    expect(componentResult(result, first.body)).toMatchObject({
      ok: true,
      supportPolicy: 'evenest',
    });
  });

  it('keeps the other foundation’s hand-derived support when one clock is missing or refused', () => {
    for (const spacing of [0, 10]) {
      const fixture = nativeSeparateFoundations(spacing),
        [first, second] = fixture.foundations;
      for (const document of [
        fixture.document,
        {
          ...fixture.document,
          bodies: [...fixture.document.bodies].reverse(),
          joints: [...fixture.document.joints].reverse(),
        },
      ]) {
        const before = JSON.stringify(document),
          f = prepare(document);
        expect(fixedForceComponents(document, f.system).length).toBe(2);
        const rejected: BodyForceFrame = {
          ok: false,
          reason: 'pose',
          sample: f.frames[0].sample,
          mode: 'static',
          gravity: GRAVITY,
        };
        for (const [samples, reason] of [
          [[f.frames[1]], 'missing-sample'],
          [[rejected, f.frames[1]], 'external-reaction'],
          [[{ ...f.frames[0], gravity: { x: 0, y: 0 } }, f.frames[1]], 'mixed-context'],
          [
            [{ ...f.frames[0], sample: { ...f.frames[0].sample, revision: 4 } }, f.frames[1]],
            'mixed-context',
          ],
          [[f.frames[0], f.frames[0], f.frames[1]], 'duplicate-sample'],
        ] as const) {
          const result = f.run(samples);
          expect(componentResult(result, first.body)).toEqual({ ok: false, reason });
          expect(fixedJointBodyWrench(result, first.support.id, first.body)).toEqual({
            ok: false,
            reason: 'frame-context',
          });
          const reaction = fixedJointBodyWrench(result, second.support.id, second.body);
          if (!reaction.ok) throw new Error(reaction.reason);
          expect(reaction.value.force.x).toBeCloseTo(0, 9);
          expect(reaction.value.force.y).toBeCloseTo(10 + (second.mass + 1) * 9.81, 9);
          const arm = Math.cos(second.pose.angle),
            tip = Math.cos(second.angle);
          expect(reaction.value.moment).toBeCloseTo(
            10 * (arm + tip) + 9.81 * (second.mass * 0.5 * arm + arm + 0.5 * tip),
            9
          );
          const other = componentResult(result, second.body);
          if (!other.ok) throw new Error(other.reason);
          expect(other.context.samples.map((sample) => sample.partitionKey)).toEqual([
            f.frames[1].sample.partitionKey,
          ]);
        }
        const recovered = f.run();
        expect(fixedJointBodyWrench(recovered, first.support.id, first.body).ok).toBe(true);
        expect(fixedJointBodyWrench(recovered, second.support.id, first.body)).toEqual({
          ok: false,
          reason: 'wrong-body',
        });
        if (!recovered.ok) throw new Error(recovered.reason);
        expect((recovered.joints as Map<unknown, unknown>).set).toBeUndefined();
        expect(
          Object.isFrozen(
            recovered.components.get(recovered.componentOf.get(first.body)!)!.component.bodies
          )
        ).toBe(true);
        expect(JSON.stringify(document)).toBe(before);
      }
    }
  });

  it('requires both clocks when a real joint connects their fixed material', () => {
    for (const kind of ['weld', 'prismatic'] as const) {
      const fixture = nativeSeparateFoundations(),
        factory = new BodyFactory(fixture.document);
      factory.joint(
        kind,
        factory.attachment(fixture.foundations[0].body, { x: 0, y: 0 }),
        factory.attachment(fixture.foundations[1].body, { x: 0, y: 0 }),
        0
      );
      const f = prepare(factory.document);
      expect(fixedForceComponents(factory.document, f.system).length).toBe(1);
      const result = f.run(f.frames.slice(1));
      for (const foundation of fixture.foundations)
        expect(componentResult(result, foundation.body)).toEqual({
          ok: false,
          reason: 'missing-sample',
        });
      expect(componentResult(f.run(), fixture.foundations[0].body).ok).toBe(true);
    }
  });

  it('does not assign a cross-foundation override or imported group load to one selected material', () => {
    const fixture = nativeSeparateFoundations(),
      ids = fixture.foundations.map((item) => item.body);
    const factory = new BodyFactory(fixture.document);
    const carriage = factory.body('independent fixed carriage', { x: 20, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const anchor = factory.attachment(carriage, { x: 0, y: 0 });
    const guide = factory.joint('prismatic', factory.attachment(WORLD, { x: 20, y: 0 }), anchor, 0);
    factory.joint('pin-in-slot', factory.attachment(WORLD, { x: 20, y: 0 }), anchor, Math.PI / 2);
    const grouped: BodyDocument = {
      ...factory.document,
      groups: [{ frameBody: ids[0], members: [WORLD, ...ids], mass: { mass: 100 } }],
    };
    const weighted = prepare(grouped).run();
    for (const id of ids)
      expect(componentResult(weighted, id)).toEqual({ ok: false, reason: 'aggregate-properties' });
    const separate = fixedJointBodyWrench(weighted, guide.id, carriage);
    if (!separate.ok) throw new Error(separate.reason);
    expect(separate.value.force.y).toBeCloseTo(9.81, 9);
    expect(separate.value.moment).toBeCloseTo(4.905, 9);
    const weightless = prepare(grouped, { x: 0, y: 0 }).run();
    for (const foundation of fixture.foundations) {
      const reaction = fixedJointBodyWrench(weightless, foundation.support.id, foundation.body);
      if (!reaction.ok) throw new Error(reaction.reason);
      expect(reaction.value.force.y).toBeCloseTo(10, 9);
    }
    const reference = fixture.foundations[0].pose;
    const imported: BodyDocument = {
      ...factory.document,
      forces: [
        ...factory.document.forces,
        {
          id: newRecordId<'force'>(),
          bodyId: ids[0],
          point: { x: 0, y: 0 },
          vector: { x: 0, y: -10 },
          couple: 0,
          frame: 'world',
          label: 'imported group load',
          legacyGroupScope: {
            members: fixture.foundations.map((item) => ({
              bodyId: item.body,
              poseInReference: relativePose(reference, item.pose),
            })),
          },
        },
      ],
    };
    const ambiguous = prepare(imported).run();
    for (const id of ids)
      expect(componentResult(ambiguous, id)).toEqual({ ok: false, reason: 'load-owner' });
    expect(fixedJointBodyWrench(ambiguous, guide.id, carriage).ok).toBe(true);
  });
});
