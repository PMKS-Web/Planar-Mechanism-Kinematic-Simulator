import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import { nativeWeldedLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { BodyFactory } from './body-factory';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { BodyForceInput, solveBodyForceFrame } from './body-force-frame';
import { driverForceValue, jointBodyWrench } from './force-frame-result';
import { BodyMotion, solveBodyRates } from './body-rates';
import { BodyId, newRecordId, WORLD } from './body-id';
import { BodyDocument } from './body-document';
import { SampleIdentity } from './sample-results';

const ZERO = { x: 0, y: 0 };
const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
function sampleOf(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system,
    admitted = admitBodyPartition(system, system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  const initial = admitted.frame.partition.drivers[0].initial;
  const rates = solveBodyRates(
    admitted.frame.partition,
    admitted.poses,
    new Map([
      [admitted.frame.partition.drivers[0].id, { value: initial, velocity: 3, acceleration: -0.5 }],
    ]),
    new Map([[WORLD, STILL]])
  );
  if (!rates.ok) throw new Error(rates.reason);
  const stamp: SampleIdentity = {
    revision: 4,
    partitionKey: admitted.frame.partition.key,
    index: 0,
    time: 0,
    command: initial,
    direction: 1,
  };
  const input: BodyForceInput = {
    sample: stamp,
    pose: { ok: true, poses: admitted.poses, commands: admitted.commands },
    rates,
  };
  const run = (
    mode: 'static' | 'dynamic' = 'dynamic',
    changed = input,
    supportPolicy: 'unique' | 'evenest' = 'unique'
  ) =>
    solveBodyForceFrame(document, system, admitted.frame, changed, {
      mode,
      gravity: ZERO,
      supportPolicy,
    });
  return { system, admitted, input, run };
}

describe('native force sample publication', () => {
  it('publishes driver effort, material-pair wrenches and power with the sample identity', () => {
    const fixture = nativeWeldedLoadedRod(),
      f = sampleOf(fixture.document);
    for (const mode of ['static', 'dynamic'] as const) {
      const frame = f.run(mode);
      if (!frame.ok) throw new Error(frame.reason);
      expect(frame.sample).toEqual(f.input.sample);
      expect(frame.externalNullity).toBe(0);
      const effort = driverForceValue(frame, fixture.driver.id);
      if (!effort.ok) throw new Error(effort.reason);
      expect(effort.value.unit).toBe('N*m');
      // Total pin inertia: rod 8/3 plus bracket 1/4 + 3 |(1,1)+R(.3)(.5,0)|².
      const cx = 1 + 0.5 * Math.cos(0.3),
        cy = 1 + 0.5 * Math.sin(0.3);
      const inertia = 8 / 3 + 0.25 + 3 * (cx * cx + cy * cy);
      const expectedTorque =
        20 * Math.cos(fixture.angle) - 3 + (mode === 'dynamic' ? -0.5 * inertia : 0);
      expect(effort.value.value).toBeCloseTo(expectedTorque, 8);
      const weld = jointBodyWrench(frame, fixture.weld.id, fixture.bracket);
      if (!weld.ok) throw new Error(weld.reason);
      expect(weld.value.force.y).not.toBeNaN();
      expect(jointBodyWrench(frame, fixture.weld.id, WORLD)).toEqual({
        ok: false,
        reason: 'wrong-body',
      });
      expect(driverForceValue(frame, newRecordId<'driver'>())).toEqual({
        ok: false,
        reason: 'outside-sample',
      });
      expect(frame.power.ok).toBe(true);
      if (frame.power.ok) {
        expect(frame.power.value.driver).toBeCloseTo(expectedTorque * 3, 8);
        expect(frame.power.value.boundary).toBeCloseTo(0, 12);
        expect(frame.power.value.kineticEnergyRate).toBeCloseTo(-1.5 * inertia, 8);
        expect(frame.power.value.residual).toBeCloseTo(0, 8);
      }
    }
  });

  it('reports cylinder effort in newtons for the two moving material masses and refuses a settled pose past its stop', () => {
    const fixture = nativeAxialCarriage('weld');
    const document = {
      ...fixture.document,
      bodies: fixture.document.bodies.map((body) =>
        body.kind === 'world'
          ? body
          : {
              ...body,
              mass: {
                ...body.mass,
                mass: {
                  mode: 'explicit' as const,
                  value:
                    body.id === fixture.assembly.rod ? 2 : body.id === fixture.carriage ? 3 : 7,
                },
              },
            }
      ),
    };
    const f = sampleOf(document),
      frame = f.run();
    if (!frame.ok) throw new Error(frame.reason);
    const effort = driverForceValue(frame, fixture.driver.id);
    if (!effort.ok) throw new Error(effort.reason);
    expect(effort.value.unit).toBe('N');
    expect(effort.value.value).toBeCloseTo(-2.5, 9);
    if (!frame.power.ok) throw new Error(frame.power.reason);
    expect(frame.power.value.driver).toBeCloseTo(-7.5, 8);
    expect(frame.power.value.kineticEnergyRate).toBeCloseTo(-7.5, 8);
    const target = 1.6,
      delta = target - fixture.driver.profile.initial;
    const poses = new Map(f.admitted.poses);
    for (const id of f.admitted.frame.partition.unknowns) {
      const pose = poses.get(id)!;
      poses.set(id, {
        ...pose,
        x: pose.x + delta * Math.cos(fixture.origin.angle),
        y: pose.y + delta * Math.sin(fixture.origin.angle),
      });
    }
    const stopped = f.run('static', {
      ...f.input,
      sample: { ...f.input.sample, command: target },
      pose: { ok: true, poses, commands: new Map([[fixture.driver.id, target]]) },
    });
    expect(stopped.ok).toBe(false);
    expect(driverForceValue(stopped, fixture.driver.id)).toEqual({ ok: false, reason: 'travel' });
  });

  it('does not carry force maps across a refused pose, unavailable rates or a reversal', () => {
    const fixture = nativeWeldedLoadedRod(),
      f = sampleOf(fixture.document);
    expect(f.run().ok).toBe(true);
    for (const [changed, reason] of [
      [{ ...f.input, pose: { ok: false as const, reason: 'branch' as const } }, 'pose'],
      [{ ...f.input, rates: { ok: false as const, reason: 'rank' as const } }, 'missing-rates'],
      [{ ...f.input, reversal: true }, 'reversal'],
    ] as const) {
      const frame = f.run('dynamic', changed);
      expect(frame.ok).toBe(false);
      expect('joints' in frame).toBe(false);
      expect(driverForceValue(frame, fixture.driver.id)).toEqual({ ok: false, reason });
      expect(jointBodyWrench(frame, fixture.weld.id, fixture.body)).toEqual({ ok: false, reason });
      expect(f.run().ok).toBe(true);
    }
    const statics = f.run('static', { ...f.input, reversal: true });
    if (!statics.ok) throw new Error(statics.reason);
    expect(statics.power).toEqual({ ok: false, reason: 'missing-rates' });
    expect(statics.joints.get(fixture.weld.id)?.ok).toBe(true);
  });

  it('preserves valid external efforts when an aggregate override hides internal material reactions', () => {
    const fixture = nativeWeldedLoadedRod();
    const document = {
      ...fixture.document,
      groups: [
        {
          members: [fixture.body, fixture.bracket],
          frameBody: fixture.body,
          mass: { mass: 7, inertia: 3 },
        },
      ],
    };
    const f = sampleOf(document),
      frame = f.run();
    if (!frame.ok) throw new Error(frame.reason);
    expect(driverForceValue(frame, fixture.driver.id).ok).toBe(true);
    expect(frame.joints.get(fixture.weld.id)).toEqual({
      ok: false,
      reason: 'aggregate-properties',
    });
    expect(frame.power.ok).toBe(true);
  });

  it('keeps all shared-support reactions conditional on the selected cycle policy', () => {
    const fixture = nativeWeldedLoadedRod(),
      factory = new BodyFactory(fixture.document);
    factory.joint(
      'revolute',
      factory.attachment(WORLD, ZERO),
      factory.attachment(fixture.body, ZERO)
    );
    const f = sampleOf(factory.document),
      unique = f.run();
    if (!unique.ok) throw new Error(unique.reason);
    expect(unique.externalNullity).toBe(2);
    expect(unique.joints.get(fixture.weld.id)).toEqual({ ok: false, reason: 'external-reaction' });
    expect(driverForceValue(unique, fixture.driver.id).ok).toBe(true);
    const split = f.run('dynamic', f.input, 'evenest');
    if (!split.ok) throw new Error(split.reason);
    for (const reaction of split.joints.values()) {
      if (!reaction.ok) throw new Error(reaction.reason);
      expect(reaction.value.basis).toBe('evenest');
    }
    expect(split.power.ok).toBe(true);
    if (split.power.ok) expect(split.power.value.residual).toBeCloseTo(0, 8);
  });

  it('publishes immutable maps and records without freezing the producer’s input', () => {
    const fixture = nativeWeldedLoadedRod(),
      f = sampleOf(fixture.document),
      frame = f.run();
    if (!frame.ok) throw new Error(frame.reason);
    expect((frame.joints as Map<unknown, unknown>).set).toBeUndefined();
    frame.joints.forEach((value, key, map) => expect(map).toBe(frame.joints));
    expect(() => {
      (frame.sample as { time: number }).time = 3;
    }).toThrow();
    const result = jointBodyWrench(frame, fixture.weld.id, fixture.bracket);
    if (!result.ok) throw new Error(result.reason);
    expect(() => {
      (result.value.force as { x: number }).x = 100;
    }).toThrow();
    expect(Object.isFrozen(f.input.sample)).toBe(false);
    (f.input.sample as { time: number }).time = 3;
    expect(frame.sample.time).toBe(0);
    const id = f.admitted.frame.partition.unknowns[0];
    (f.admitted.poses as Map<BodyId, { x: number; y: number; angle: number }>).set(id, {
      x: 10,
      y: 20,
      angle: 0,
    });
    expect(frame.joints.get(fixture.weld.id)?.ok).toBe(true);
    const refused = f.run();
    expect(refused.ok).toBe(false);
  });
});
