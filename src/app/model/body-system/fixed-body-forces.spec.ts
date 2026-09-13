import { turnsClockwise } from '../drive-direction';
import { nativeTwinCranksOnPinnedFrame } from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { BodyDocument } from './body-document';
import { BodyFactory } from './body-factory';
import { newRecordId, WORLD } from './body-id';
import { cross, Point } from './body-frame';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation, advanceBodyCommand } from './body-continuation';
import { solveBodyRates } from './body-rates';
import { solveBodyForceFrame } from './body-force-frame';
import { solveFixedBodyForces } from './fixed-body-forces';
import { BodyForceFrame } from './force-frame-result';
import { rebaseBody } from './rebase-body';
import { BodyUnits, SI_UNITS, unitFactors } from './body-units';

const GRAVITY = { x: 0, y: -9.81 };

function prepare(
  document: BodyDocument,
  mode: 'static' | 'dynamic' = 'dynamic',
  gravity: Point = GRAVITY,
  supportPolicy: 'unique' | 'evenest' = 'unique'
) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system;
  const frames = document.drivers.map((driver, i) => {
    const partition = system.partitions.find((part) =>
      part.drivers.some((item) => item.id === driver.id)
    )!;
    const admitted = admitBodyPartition(system, partition);
    if (!admitted.ok) throw new Error(admitted.reason);
    const command = i ? -0.4 : 0.7,
      speed = driver.profile.speed;
    const advanced = advanceBodyCommand(admitted, initialBodyContinuation(admitted), command);
    if (!advanced.ok) throw new Error(advanced.reason);
    const rates = solveBodyRates(
      admitted.frame.partition,
      advanced.state.poses,
      new Map([[driver.id, { value: command, velocity: speed, acceleration: 0 }]]),
      new Map(
        partition.boundary.map((id) => [
          id,
          { velocity: { vx: 0, vy: 0, omega: 0 }, acceleration: { ax: 0, ay: 0, alpha: 0 } },
        ])
      )
    );
    const frame = solveBodyForceFrame(
      document,
      system,
      admitted.frame,
      {
        sample: {
          revision: 3,
          partitionKey: partition.key,
          index: i + 1,
          time: command / speed,
          command,
          direction: turnsClockwise(speed) ? -1 : 1,
        },
        pose: { ok: true, poses: advanced.state.poses, commands: new Map([[driver.id, command]]) },
        rates,
      },
      { mode, gravity, supportPolicy }
    );
    if (!frame.ok) throw new Error(frame.reason);
    return frame;
  });
  return {
    system,
    frames,
    run: (
      values: readonly BodyForceFrame[] = frames,
      supportPolicy: 'unique' | 'evenest' = 'unique'
    ) => solveFixedBodyForces(document, system, 3, values, { mode, gravity, supportPolicy }),
  };
}

function loadedFrame(units: BodyUnits = SI_UNITS) {
  const fixture = nativeTwinCranksOnPinnedFrame(1, 0, units),
    factors = unitFactors(units);
  const document: BodyDocument = {
    ...fixture.document,
    forces: [
      ...fixture.document.forces,
      {
        id: newRecordId<'force'>(),
        bodyId: fixture.frame,
        point: { x: 2 / factors.length, y: 0 },
        vector: { x: 3 / factors.force, y: -7 / factors.force },
        couple: 2 / (factors.force * factors.length),
        frame: 'world',
        label: 'frame load',
      },
    ],
  };
  return { ...fixture, document };
}

/** Hand equilibrium about the first ground pin, including motor reaction and each crank's centripetal force. */
function frameLoad(mode: 'static' | 'dynamic') {
  const u = { x: Math.cos(0.4), y: Math.sin(0.4) };
  let force = { x: 3, y: -7 - 9.81 },
    moment = cross({ x: 2 * u.x, y: 2 * u.y }, force) + 2;
  for (const [i, theta] of [0.4, 0.7].entries()) {
    const f = (i + 1) * 10,
      speed = i ? -2 : 1,
      inertia = mode === 'dynamic' ? 0.5 * speed * speed : 0;
    const reaction = { x: inertia * Math.cos(theta), y: inertia * Math.sin(theta) - f - 9.81 };
    moment +=
      cross({ x: (1 + 2 * i) * u.x, y: (1 + 2 * i) * u.y }, reaction) -
      (f + 0.5 * 9.81) * Math.cos(theta);
    force = { x: force.x + reaction.x, y: force.y + reaction.y };
  }
  return { u, force, moment };
}

describe('complete native fixed-frame force context', () => {
  it('balances two independent clocks and the frame’s own load without inventing unique redundant supports', () => {
    for (const units of [
      SI_UNITS,
      { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' },
    ] as BodyUnits[]) {
      const fixture = loadedFrame(units),
        length = unitFactors(units).length;
      for (const mode of ['static', 'dynamic'] as const)
        for (const rebase of [false, true]) {
          const source = rebase
            ? rebaseBody(fixture.document, fixture.frame, {
                x: 1.2 / length,
                y: -0.7 / length,
                angle: 0.9,
              })
            : fixture.document;
          for (const document of [
            source,
            {
              ...source,
              bodies: [...source.bodies].reverse(),
              joints: [...source.joints].reverse(),
            },
          ]) {
            const f = prepare(document, mode),
              unique = f.run();
            if (!unique.ok) throw new Error(unique.reason);
            for (const support of fixture.supports)
              expect(unique.joints.get(support.id)).toEqual({ ok: false, reason: 'indeterminate' });
            const result = f.run([...f.frames].reverse(), 'evenest');
            if (!result.ok) throw new Error(result.reason);
            expect(result.context.samples.map((sample) => sample.time).sort()).toEqual([0.2, 0.7]);
            const { u, force, moment } = frameLoad(mode),
              n = { x: -u.y, y: u.x };
            const tangent = -(force.x * u.x + force.y * u.y) / 2;
            const normal2 = -moment / 4,
              normals = [-(force.x * n.x + force.y * n.y) - normal2, normal2];
            fixture.supports.forEach((support, i) => {
              const pair = result.joints.get(support.id);
              if (!pair?.ok) throw new Error(pair?.reason ?? 'missing');
              expect(pair.value.basis).toBe('evenest');
              expect(pair.value.b.force.x).toBeCloseTo(tangent * u.x + normals[i] * n.x, 7);
              expect(pair.value.b.force.y).toBeCloseTo(tangent * u.y + normals[i] * n.y, 7);
              const material = document.bodies.find((body) => body.id === fixture.frame)!;
              const supportPoint = {
                x: 4 * i * u.x - material.pose.x * length,
                y: 4 * i * u.y - material.pose.y * length,
              };
              expect(pair.value.b.moment).toBeCloseTo(cross(supportPoint, pair.value.b.force), 7);
            });
            expect(result.joints.size).toBe(2);
            expect((result.joints as Map<unknown, unknown>).clear).toBeUndefined();
            expect(Object.isFrozen(result.context.samples)).toBe(true);
          }
        }
    }
  });

  it('recovers a unique WORLD weld using both machines and keeps sample failure from producing a partial load', () => {
    const fixture = loadedFrame();
    const factory = new BodyFactory({
      ...fixture.document,
      joints: fixture.document.joints.filter(
        (joint) => !fixture.supports.some((support) => support.id === joint.id)
      ),
    });
    const weld = factory.joint(
      'weld',
      factory.attachment(WORLD, { x: 0, y: 0 }),
      factory.attachment(fixture.frame, { x: 0, y: 0 })
    );
    const f = prepare(factory.document),
      result = f.run();
    if (!result.ok) throw new Error(result.reason);
    const pair = result.joints.get(weld.id);
    if (!pair?.ok) throw new Error(pair?.reason ?? 'missing');
    const load = frameLoad('dynamic');
    expect(pair.value.b.force.x).toBeCloseTo(-load.force.x, 9);
    expect(pair.value.b.force.y).toBeCloseTo(-load.force.y, 9);
    expect(pair.value.b.moment).toBeCloseTo(-load.moment, 9);
    expect(pair.value.basis).toBe('unique');
    expect(f.run(f.frames.slice(0, 1))).toEqual({ ok: false, reason: 'missing-sample' });
    const rejected: BodyForceFrame = {
      ok: false,
      reason: 'reversal',
      mode: 'dynamic',
      gravity: GRAVITY,
      sample: f.frames[1].sample,
    };
    expect(f.run([f.frames[0], rejected])).toEqual({ ok: false, reason: 'external-reaction' });
    expect(f.run().ok).toBe(true);
    expect(f.run([...f.frames, f.frames[0]])).toEqual({ ok: false, reason: 'duplicate-sample' });
    expect(
      f.run(f.frames.map((frame) => ({ ...frame, sample: { ...frame.sample, revision: 4 } })))
    ).toEqual({ ok: false, reason: 'mixed-context' });
    expect(f.run(f.frames.map((frame) => ({ ...frame, mode: 'static' })))).toEqual({
      ok: false,
      reason: 'mixed-context',
    });
    expect(f.run(f.frames.map((frame) => ({ ...frame, gravity: { x: 0, y: 0 } })))).toEqual({
      ok: false,
      reason: 'mixed-context',
    });

    const redundant = new BodyFactory(factory.document),
      pin = fixture.cranks[0].pin;
    redundant.joint('revolute', pin.frameA.attachmentId, pin.frameB.attachmentId);
    expect(prepare(redundant.document).run()).toEqual({ ok: false, reason: 'external-reaction' });
    const conditional = prepare(redundant.document, 'dynamic', GRAVITY, 'evenest').run();
    if (!conditional.ok) throw new Error(conditional.reason);
    const conditionalWeld = conditional.joints.get(weld.id);
    if (!conditionalWeld?.ok) throw new Error(conditionalWeld?.reason ?? 'missing');
    expect(conditional.supportPolicy).toBe('unique');
    expect(conditional.conditional).toBe(true);
    expect(conditionalWeld.value.basis).toBe('evenest');
    expect(conditionalWeld.value.b.force.y).toBeCloseTo(-load.force.y, 7);
    expect(conditionalWeld.value.b.moment).toBeCloseTo(-load.moment, 7);
  });

  it('does not demand another clock whose support acts directly on WORLD', () => {
    const fixture = loadedFrame(),
      factory = new BodyFactory(fixture.document);
    const body = factory.body('separate grounded rod', { x: 8, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const pin = factory.joint(
      'revolute',
      factory.attachment(WORLD, { x: 8, y: 0 }),
      factory.attachment(body, { x: 0, y: 0 })
    );
    const document: BodyDocument = {
      ...factory.document,
      drivers: [
        ...factory.document.drivers,
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: pin.id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: -2 },
        },
      ],
    };
    const f = prepare(document),
      result = f.run(f.frames.slice(0, 2), 'evenest');
    if (!result.ok) throw new Error(result.reason);
    expect(result.context.samples.length).toBe(2);
    expect(result.joints.size).toBe(2);
    expect(result.joints.has(pin.id)).toBe(false);
  });

  it('does not let indeterminate reactions on WORLD hide a separate material weld', () => {
    const fixture = loadedFrame(),
      factory = new BodyFactory(fixture.document);
    const body = factory.body('independent fixed bracket', { x: 10, y: 0, angle: 0 }, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const weld = factory.joint(
      'weld',
      factory.attachment(WORLD, { x: 10, y: 0 }),
      factory.attachment(body, { x: 0, y: 0 })
    );
    const document: BodyDocument = {
      ...factory.document,
      forces: [
        ...factory.document.forces,
        {
          id: newRecordId<'force'>(),
          bodyId: body,
          point: { x: 0.5, y: 0 },
          vector: { x: 0, y: -10 },
          couple: 0,
          frame: 'world',
          label: 'bracket load',
        },
      ],
    };
    const result = prepare(document, 'dynamic', { x: 0, y: 0 }).run();
    if (!result.ok) throw new Error(result.reason);
    for (const pin of fixture.supports)
      expect(result.joints.get(pin.id)).toEqual({ ok: false, reason: 'indeterminate' });
    const reaction = result.joints.get(weld.id);
    if (!reaction?.ok) throw new Error(reaction?.reason ?? 'missing');
    expect(reaction.value.b.force.x).toBeCloseTo(0, 9);
    expect(reaction.value.b.force.y).toBeCloseTo(10, 9);
    expect(reaction.value.b.moment).toBeCloseTo(5, 9);
    expect(reaction.value.basis).toBe('unique');
  });

  it('keeps an internal weld cycle indeterminate while recovering the foundation’s unique total support', () => {
    const f = new BodyFactory();
    const ids = [0, 1, 2].map((i) =>
      f.body(`fixed member ${i}`, { x: i, y: i * 0.4, angle: i * 0.2 }, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ])
    );
    const anchors = ids.map((id) => f.attachment(id, { x: 0, y: 0 }));
    const support = f.joint('weld', f.attachment(WORLD, { x: 0, y: 0 }), anchors[0]);
    const cycle = [
      [0, 1],
      [1, 2],
      [2, 0],
    ].map(([a, b]) => f.joint('weld', anchors[a], anchors[b]));
    const document: BodyDocument = {
      ...f.document,
      forces: [
        {
          id: newRecordId<'force'>(),
          bodyId: ids[2],
          point: { x: 0, y: 0 },
          vector: { x: 4, y: -10 },
          couple: 3,
          frame: 'world',
          label: 'fixed material load',
        },
      ],
      groups: [{ members: [WORLD, ...ids], frameBody: ids[0], mass: { inertia: 100 } }],
    };
    for (const source of [document, { ...document, joints: [...document.joints].reverse() }]) {
      const compiled = compileBodyDocument(source);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      for (const supportPolicy of ['unique', 'evenest'] as const) {
        const result = solveFixedBodyForces(source, compiled.system, 3, [], {
          mode: 'dynamic',
          gravity: { x: 0, y: 0 },
          supportPolicy,
        });
        if (!result.ok) throw new Error(result.reason);
        for (const weld of cycle)
          expect(result.joints.get(weld.id)).toEqual({ ok: false, reason: 'indeterminate' });
        const pair = result.joints.get(support.id);
        if (!pair?.ok) throw new Error(pair?.reason ?? 'missing');
        expect(pair.value.b.force.x).toBeCloseTo(-4, 10);
        expect(pair.value.b.force.y).toBeCloseTo(10, 10);
        expect(pair.value.b.moment).toBeCloseTo(20.2, 10);
      }
    }
  });
});
