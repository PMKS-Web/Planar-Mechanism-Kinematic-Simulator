import { nativeCosineCarriage } from '../../../test-utils/verification/native-cosine-carriage-fixture';
import {
  nativeFourBar,
  nativeParallelogram,
} from '../../../test-utils/verification/native-body-fixtures';
import { BodyDocument } from './body-document';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';
import { newRecordId } from './body-id';
import { bodyRowValue } from './body-constraint-rows';
import { bodyCoordinateMotion } from './body-coordinate-rates';
import { solveBodyRates, BodyMotion } from './body-rates';

function prepare(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const model = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
  if (!model.ok) throw new Error(model.reason);
  return { model, start: initialBodyContinuation(model) };
}

describe('native continuous command intervals', () => {
  it('finds a passive stop crossed and reentered between safe endpoints in either direction', () => {
    for (const direction of [1, -1])
      for (const radius of [1e-8, 1, 1e8]) {
        const fixture = nativeCosineCarriage(-direction * 0.12, 0.999, radius),
          { model, start } = prepare(fixture.document),
          target = direction * 0.24;
        const before = JSON.stringify({
          poses: [...start.poses],
          tangent: start.tangent,
          command: start.command,
        });
        const endpoint = advanceBodyCommand(model, start, target);
        expect(endpoint.ok).toBe(true);
        const result = inspectBodyInterval(model, start, target);
        if (!result.ok) throw new Error(result.reason);
        expect(result.stop?.kind).toBe('coordinate');
        expect(result.state.command + fixture.initialAngle).toBeCloseTo(
          -direction * Math.acos(0.999),
          8
        );
        if (result.stop?.kind !== 'coordinate') throw new Error('missing coordinate stop');
        expect(result.stop.contacts.map((contact) => contact.limitId)).toEqual([fixture.limit.id]);
        expect(Math.abs(result.stop.contacts[0].residual) / radius).toBeLessThan(1e-9);
        expect(
          bodyRowValue(model.frame.partition.limits[0].row, result.state.poses)
        ).toBeLessThanOrEqual(fixture.limit.upper + 1e-9 * radius);
        expect(
          JSON.stringify({
            poses: [...start.poses],
            tangent: start.tangent,
            command: start.command,
          })
        ).toBe(before);
      }
  });

  it('finds a narrow off-center excursion and lets a stationary touch return inside', () => {
    for (const initialAngle of [-0.23, -0.013]) {
      const fixture = nativeCosineCarriage(initialAngle, 1 - 1e-7),
        { model, start } = prepare(fixture.document);
      const result = inspectBodyInterval(model, start, 0.4);
      if (!result.ok) throw new Error(result.reason);
      expect(result.stop?.kind).toBe('coordinate');
      expect(result.state.command + initialAngle).toBeCloseTo(-Math.acos(1 - 1e-7), 8);
      const touching = prepare(nativeCosineCarriage(initialAngle, 1).document);
      const clear = inspectBodyInterval(touching.model, touching.start, 0.4);
      if (!clear.ok) throw new Error(clear.reason);
      expect(clear.stop).toBeUndefined();
      expect(clear.state.command).toBe(0.4);
    }
  });

  it('orders passive and driven stops by first crossing, with coincident IDs independent of enumeration', () => {
    const fixture = nativeCosineCarriage();
    const duplicate = { ...fixture.limit, id: newRecordId<'limit'>() };
    const driven = {
      id: newRecordId<'limit'>(),
      coordinate: fixture.driver.coordinate,
      lower: -0.5,
      upper: 0.3,
    };
    for (const limits of [
      [fixture.limit, duplicate, driven],
      [driven, duplicate, fixture.limit],
    ]) {
      const { model, start } = prepare({ ...fixture.document, limits });
      const result = inspectBodyInterval(model, start, 0.4);
      if (!result.ok || result.stop?.kind !== 'coordinate') throw new Error(JSON.stringify(result));
      expect(new Set(result.stop.contacts.map((contact) => contact.limitId))).toEqual(
        new Set([fixture.limit.id, duplicate.id])
      );
      expect(result.state.command).toBeCloseTo(0.2 - Math.acos(0.999), 8);
    }
    const first = prepare({
      ...fixture.document,
      limits: [{ ...driven, upper: 0.1 }, fixture.limit],
    });
    const result = inspectBodyInterval(first.model, first.start, 0.4);
    if (!result.ok || result.stop?.kind !== 'coordinate') throw new Error(JSON.stringify(result));
    expect(result.stop.contacts.map((contact) => contact.limitId)).toEqual([driven.id]);
    expect(result.state.command).toBeCloseTo(0.1, 9);
  });

  it('distinguishes moving outward from moving inward at an initial stop', () => {
    const fixture = nativeCosineCarriage(-Math.acos(0.999)),
      { model, start } = prepare(fixture.document);
    const outward = inspectBodyInterval(model, start, 0.01);
    if (!outward.ok) throw new Error(outward.reason);
    expect(outward.stop?.kind).toBe('coordinate');
    expect(Math.abs(outward.state.command)).toBeLessThan(1e-9);
    const inward = inspectBodyInterval(model, start, -0.01);
    if (!inward.ok) throw new Error(inward.reason);
    expect(inward.stop).toBeUndefined();
    expect(inward.state.command).toBe(-0.01);
  });

  it('keeps an exhausted search unavailable and permits a fresh search from unchanged continuation', () => {
    const fixture = nativeCosineCarriage(),
      { model, start } = prepare(fixture.document);
    expect(inspectBodyInterval(model, start, 0.4, { maxProbes: 1 })).toMatchObject({
      ok: false,
      reason: 'unsolved',
    });
    expect(inspectBodyInterval(model, start, 0.4, { maxDepth: 0 })).toMatchObject({
      ok: false,
      reason: 'unsolved',
    });
    expect(start.command).toBe(0);
    expect(inspectBodyInterval(model, start, -0.01)).toMatchObject({
      ok: true,
      state: { command: -0.01 },
    });
  });

  it('retains the existing geometric fold proof when there are no coordinate stops', () => {
    const fixture = nativeFourBar({ ground: 4, crank: 3, coupler: 2, rocker: 2 }, 0.5),
      { model, start } = prepare(fixture.document);
    const result = inspectBodyInterval(model, start, 0.8);
    if (!result.ok) throw new Error(result.reason);
    expect(result.stop?.kind).toBe('fold');
    expect(result.state.regular).toBe(false);
    expect(result.state.command + 0.5).toBeCloseTo(Math.acos(9 / 24), 8);
  });

  it('checks passive limits before a fold and retains nonbinding limits at the fold', () => {
    const fixture = nativeFourBar({ ground: 4, crank: 3, coupler: 2, rocker: 2 }, 0.5);
    const rocker = fixture.document.bodies.find(
      (body) => body.kind === 'material' && body.label === 'rocker'
    )!;
    const rockerPin = fixture.document.joints.find((joint) => joint.bodyA === rocker.id)!;
    const driven = {
      id: newRecordId<'limit'>(),
      coordinate: fixture.driver.coordinate,
      lower: -3,
      upper: 3,
    };
    const passive = {
      id: newRecordId<'limit'>(),
      coordinate: { jointId: rockerPin.id, coordinate: 'angle' as const },
      lower: -10,
      upper: 10,
    };
    const { model, start } = prepare({ ...fixture.document, limits: [passive, driven] });
    const result = inspectBodyInterval(model, start, 0.8);
    if (!result.ok) throw new Error(`${result.reason}, probes=${result.probes}`);
    expect(result.stop?.kind).toBe('fold');
    expect(result.state.command + 0.5).toBeCloseTo(Math.acos(9 / 24), 8);
    const bounded = prepare({ ...fixture.document, limits: [{ ...passive, lower: -0.1 }, driven] });
    const early = inspectBodyInterval(bounded.model, bounded.start, 0.8);
    if (!early.ok) throw new Error(early.reason);
    expect(early.stop?.kind).toBe('coordinate');
    expect(early.state.command).toBeLessThan(result.state.command);
  });

  it('clears a nonbinding passive limit through an isolated singular sample without inventing rates', () => {
    const fixture = nativeParallelogram();
    const pin = fixture.document.joints.find((joint) => joint.bodyB === fixture.coupler)!;
    const limit = {
      id: newRecordId<'limit'>(),
      coordinate: { jointId: pin.id, coordinate: 'angle' as const },
      lower: -10,
      upper: 10,
    };
    const { model, start } = prepare({ ...fixture.document, limits: [limit] });
    const result = inspectBodyInterval(model, start, Math.PI - 0.7);
    if (!result.ok) throw new Error(`${result.reason}, probes=${result.probes}`);
    expect(result.stop).toBeUndefined();
    expect(result.state.regular).toBe(false);
    const bounded = prepare({
      ...fixture.document,
      limits: [{ ...limit, lower: -(Math.PI - 0.7) + 1e-7 }],
    });
    const early = inspectBodyInterval(bounded.model, bounded.start, Math.PI - 0.7);
    if (!early.ok) throw new Error(early.reason);
    expect(early.stop?.kind).toBe('coordinate');
    expect(early.state.command).toBeCloseTo(Math.PI - 0.7 - 1e-7, 9);
  });

  it('evaluates passive coordinate velocity and acceleration independently of its value', () => {
    const fixture = nativeCosineCarriage(-0.4),
      { model, start } = prepare(fixture.document);
    const part = model.frame.partition;
    const still: BodyMotion = {
      velocity: { vx: 0, vy: 0, omega: 0 },
      acceleration: { ax: 0, ay: 0, alpha: 0 },
    };
    const rates = solveBodyRates(
      part,
      start.poses,
      new Map([[fixture.driver.id, { value: 0, velocity: 3, acceleration: -2 }]]),
      new Map(part.boundary.map((id) => [id, still]))
    );
    if (!rates.ok) throw new Error(rates.reason);
    const motion = bodyCoordinateMotion(part.limits[0].row, start.poses, rates.motions)!;
    expect(motion.value).toBeCloseTo(0, 12);
    expect(motion.velocity).toBeCloseTo(-3 * Math.sin(-0.4), 10);
    expect(motion.acceleration).toBeCloseTo(-9 * Math.cos(-0.4) + 2 * Math.sin(-0.4), 10);
  });
});
