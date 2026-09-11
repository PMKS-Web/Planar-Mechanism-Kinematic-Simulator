import { nativeAxialCarriage } from '../../../test-utils/verification/native-cylinder-fixtures';
import {
  nativeFourBar,
  nativeParallelogram,
} from '../../../test-utils/verification/native-body-fixtures';
import { nativeTwinCranksOnPinnedFrame } from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { BodyDocument } from './body-document';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { buildBodyCycle } from './body-cycle';
import { bodyCycleInputs } from './body-cycle-inputs';
import { newRecordId } from './body-id';
import { bodyRowValue } from './body-constraint-rows';
import { solveBodyForceSeries } from './body-force-series';

function prepare(document: BodyDocument, index = 0) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system,
    model = admitBodyPartition(system, system.partitions[index]);
  if (!model.ok) throw new Error(model.reason);
  return { system, model };
}

describe('native cycle publication', () => {
  it('retraces a ram between tighter passive stops with exact reused geometry and signed clocks', () => {
    for (const speed of [0.2, -0.2]) {
      const fixture = nativeAxialCarriage('weld');
      const passive = {
        id: newRecordId<'limit'>(),
        coordinate: { jointId: fixture.guide.id, coordinate: 'travel' as const },
        lower: -0.2,
        upper: 0.5,
      };
      const document = {
        ...fixture.document,
        drivers: [{ ...fixture.driver, profile: { ...fixture.driver.profile, speed } }],
        limits: [...fixture.document.limits, passive],
      };
      const { model, system } = prepare(document),
        before = JSON.stringify([...model.poses]);
      const cycle = buildBodyCycle(model, { commandStep: 0.08 });
      if (!cycle.ok) throw new Error(cycle.reason);
      expect(cycle.kind).toBe('retrace');
      expect(cycle.duration).toBeCloseTo(7, 8);
      const stops = cycle.samples.filter((sample) => sample.stop);
      expect(stops.length).toBe(2);
      expect(stops.map((sample) => sample.state.command).sort()).toEqual([
        expect.closeTo(0.2, 8),
        expect.closeTo(0.9, 8),
      ]);
      for (const sample of cycle.samples) {
        for (const limit of model.frame.partition.limits) {
          const value = bodyRowValue(limit.row, sample.state.poses);
          expect(value).toBeGreaterThanOrEqual(limit.lower - 1e-8);
          expect(value).toBeLessThanOrEqual(limit.upper + 1e-8);
        }
        if (!sample.stop) {
          const partners = cycle.samples.filter(
            (other) => other !== sample && other.state.command === sample.state.command
          );
          expect(partners.length).toBeGreaterThan(0);
          expect([...partners[0].state.poses]).toEqual([...sample.state.poses]);
        }
      }
      expect(Object.isFrozen(cycle.samples)).toBe(true);
      expect('set' in cycle.samples[0].state.poses).toBe(false);
      expect(JSON.stringify([...model.poses])).toBe(before);
      const inputs = bodyCycleInputs(model, cycle, 7);
      if (!inputs.ok) throw new Error(inputs.reason);
      const forces = solveBodyForceSeries(document, system, model.frame, inputs.inputs, {
        mode: 'dynamic',
        gravity: { x: 0, y: 0 },
      });
      if (!forces.ok) throw new Error(forces.reason);
      const statics = solveBodyForceSeries(document, system, model.frame, inputs.inputs, {
        mode: 'static',
        gravity: { x: 0, y: 0 },
      });
      if (!statics.ok) throw new Error(statics.reason);
      for (const [index, input] of inputs.inputs.entries()) {
        expect(input.sample.index).toBe(index);
        if (input.reversal) {
          expect(input.rates).toEqual({ ok: false, reason: 'reversal' });
          expect(forces.frames[index]).toMatchObject({ ok: false, reason: 'reversal' });
          expect(statics.frames[index].ok).toBe(true);
        } else {
          expect(input.rates?.ok).toBe(true);
          expect(forces.frames[index].ok).toBe(true);
          const rate = input.rates;
          if (rate?.ok) {
            const carriage = rate.motions.get(system.groupOf.get(fixture.carriage)!)!;
            expect(carriage.velocity.vx).toBeCloseTo(
              input.sample.direction * 0.2 * Math.cos(fixture.origin.angle),
              9
            );
            expect(carriage.velocity.vy).toBeCloseTo(
              input.sample.direction * 0.2 * Math.sin(fixture.origin.angle),
              9
            );
          }
        }
      }
    }
  });

  it('handles either initial direction at a stop without zero-duration duplicate samples', () => {
    for (const speed of [0.2, -0.2]) {
      const fixture = nativeAxialCarriage();
      const document = {
        ...fixture.document,
        drivers: [{ ...fixture.driver, profile: { ...fixture.driver.profile, speed } }],
        limits: fixture.document.limits.map((limit) => ({
          ...limit,
          lower: fixture.driver.profile.initial,
        })),
      };
      const { model } = prepare(document);
      const cycle = buildBodyCycle(model, { commandStep: 0.1 });
      if (!cycle.ok) throw new Error(cycle.reason);
      expect(cycle.duration).toBeCloseTo(11, 8);
      expect(cycle.samples[0].stop?.kind).toBe('coordinate');
      expect(cycle.samples[cycle.samples.length - 1].stop?.kind).toBe('coordinate');
      for (let i = 1; i < cycle.samples.length; i++)
        expect(cycle.samples[i].time).toBeGreaterThan(cycle.samples[i - 1].time);
    }
  });

  it('keeps a full-turn branch through an isolated singular sample without inventing rates there', () => {
    const fixture = nativeParallelogram();
    const pin = fixture.document.joints.find((joint) => joint.bodyB === fixture.coupler)!;
    const limit = {
      id: newRecordId<'limit'>(),
      coordinate: { jointId: pin.id, coordinate: 'angle' as const },
      lower: -10,
      upper: 10,
    };
    for (const document of [fixture.document, { ...fixture.document, limits: [limit] }]) {
      const { model } = prepare(document);
      const cycle = buildBodyCycle(model, { commandStep: Math.PI - 0.7 });
      if (!cycle.ok) throw new Error(cycle.reason);
      expect(cycle.kind).toBe('rotation');
      expect(cycle.duration).toBeCloseTo(2 * Math.PI, 10);
      expect(cycle.samples.some((sample) => !sample.state.regular)).toBe(true);
      expect(cycle.samples.some((sample) => sample.stop)).toBe(false);
      const inputs = bodyCycleInputs(model, cycle, 0);
      if (!inputs.ok) throw new Error(inputs.reason);
      expect(inputs.inputs[1].rates).toMatchObject({ ok: false, reason: 'rank' });
      expect(inputs.inputs.at(-1)!.rates?.ok).toBe(true);
    }
  });

  it('uses both proved input folds and reuses their return geometry', () => {
    const fixture = nativeFourBar({ ground: 4, crank: 3, coupler: 2, rocker: 2 }, 0.5),
      { model } = prepare(fixture.document);
    const cycle = buildBodyCycle(model, { commandStep: 0.1 });
    if (!cycle.ok) throw new Error(cycle.reason);
    expect(cycle.duration).toBeCloseTo(4 * Math.acos(9 / 24), 8);
    expect(cycle.samples.filter((sample) => sample.stop?.kind === 'fold').length).toBe(2);
    for (const point of cycle.samples.filter((sample) => !sample.stop)) {
      const same = cycle.samples.filter((sample) => sample.state.command === point.state.command);
      expect(same.length).toBeGreaterThan(1);
      expect([...same[0].state.poses]).toEqual([...same[1].state.poses]);
    }
  });

  it('keeps separate clocks and does not publish truncated cycles when a budget expires', () => {
    const fixture = nativeTwinCranksOnPinnedFrame();
    const durations = [0, 1]
      .map((index) => {
        const { model } = prepare(fixture.document, index);
        expect(buildBodyCycle(model, { maxSamples: 2 })).toMatchObject({
          ok: false,
          reason: 'unsolved',
        });
        const cycle = buildBodyCycle(model, { commandStep: 0.2 });
        if (!cycle.ok) throw new Error(cycle.reason);
        expect(cycle.samples[0].direction).toBe(Math.sign(model.frame.partition.drivers[0].speed));
        const wrong = prepare(fixture.document, 1 - index).model;
        expect(bodyCycleInputs(wrong, cycle, 1)).toEqual({ ok: false, reason: 'invalid' });
        return cycle.duration;
      })
      .sort((a, b) => a - b);
    expect(durations[0]).toBeCloseTo(Math.PI, 10);
    expect(durations[1]).toBeCloseTo(2 * Math.PI, 10);
    const { model } = prepare(nativeAxialCarriage().document);
    expect(buildBodyCycle(model, { maxIntervalProbes: 1 })).toMatchObject({
      ok: false,
      reason: 'unsolved',
    });
    expect(buildBodyCycle(model, { commandStep: 0.1 }).ok).toBe(true);
  });
});
