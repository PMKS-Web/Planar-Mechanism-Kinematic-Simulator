import { nativeWeldedLoadedRod } from '../../../test-utils/verification/native-force-fixtures';
import { BodyFactory } from './body-factory';
import { BodyDocument } from './body-document';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { BodyMotion, solveBodyRates } from './body-rates';
import { WORLD } from './body-id';
import { BodyForceInput } from './body-force-frame';
import { solveBodyForceSeries } from './body-force-series';
import { driverForceValue } from './force-frame-result';

const ZERO = { x: 0, y: 0 };
const STILL: BodyMotion = {
  velocity: { vx: 0, vy: 0, omega: 0 },
  acceleration: { ax: 0, ay: 0, alpha: 0 },
};
function prepared(document: BodyDocument) {
  const compiled = compileBodyDocument(document);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
  const system = compiled.system,
    admitted = admitBodyPartition(system, system.partitions[0]);
  if (!admitted.ok) throw new Error(admitted.reason);
  const inputs: BodyForceInput[] = [];
  let state = initialBodyContinuation(admitted);
  for (let i = 0; i < 5; i++) {
    const command = 0.2 * i,
      next = advanceBodyCommand(admitted, state, command);
    if (!next.ok) throw new Error(next.reason);
    state = next.state;
    const rates = solveBodyRates(
      admitted.frame.partition,
      state.poses,
      new Map([[document.drivers[0].id, { value: command, velocity: 3, acceleration: -0.5 }]]),
      new Map([[WORLD, STILL]])
    );
    inputs.push({
      sample: {
        revision: 2,
        partitionKey: admitted.frame.partition.key,
        index: i,
        time: command / 3,
        command,
        direction: 1,
      },
      pose: {
        ok: true,
        poses: state.poses,
        commands: new Map([[document.drivers[0].id, command]]),
      },
      rates,
    });
  }
  const run = (values: readonly BodyForceInput[] = inputs) =>
    solveBodyForceSeries(document, system, admitted.frame, values, {
      mode: 'dynamic',
      gravity: ZERO,
    });
  return { inputs, run };
}

describe('native force series policy', () => {
  it('uses one stated support split across the series while retaining unavailable rate samples', () => {
    const fixture = nativeWeldedLoadedRod(),
      f = new BodyFactory(fixture.document);
    f.joint('revolute', f.attachment(WORLD, ZERO), f.attachment(fixture.body, ZERO));
    const series = prepared(f.document),
      inputs = [...series.inputs];
    inputs[2] = { ...inputs[2], rates: { ok: false, reason: 'rank' } };
    const result = series.run(inputs);
    if (!result.ok) throw new Error(result.reason);
    expect(result.supportPolicy).toBe('evenest');
    expect(result.sharedSupportFrames).toBe(4);
    result.frames.forEach((frame, index) => {
      if (index === 2) {
        expect('joints' in frame).toBe(false);
        expect(driverForceValue(frame, fixture.driver.id)).toEqual({
          ok: false,
          reason: 'missing-rates',
        });
      } else {
        if (!frame.ok) throw new Error(frame.reason);
        expect(frame.supportPolicy).toBe('evenest');
        for (const reaction of frame.joints.values()) {
          if (!reaction.ok) throw new Error(reaction.reason);
          expect(reaction.value.basis).toBe('evenest');
        }
      }
    });
    expect(Object.isFrozen(result.frames)).toBe(true);
    inputs.length = 0;
    expect(result.frames.length).toBe(5);
  });

  it('does not choose a support split for an isolated unavailable sample or an internal weld cycle', () => {
    const fixture = nativeWeldedLoadedRod(),
      simple = prepared(fixture.document);
    const bad = simple.inputs.map((sample, i) =>
      i === 2 ? { ...sample, rates: { ok: false as const, reason: 'rank' as const } } : sample
    );
    const result = simple.run(bad);
    if (!result.ok) throw new Error(result.reason);
    expect(result.supportPolicy).toBe('unique');
    expect(result.frames[2].ok).toBe(false);
    const f = new BodyFactory(fixture.document);
    const redundant = f.joint(
      'weld',
      f.attachment(fixture.body, ZERO),
      f.attachment(fixture.bracket, ZERO)
    );
    const internal = prepared(f.document).run();
    if (!internal.ok) throw new Error(internal.reason);
    expect(internal.supportPolicy).toBe('unique');
    for (const frame of internal.frames) {
      if (!frame.ok) throw new Error(frame.reason);
      expect(frame.externalNullity).toBe(0);
      expect(frame.joints.get(redundant.id)).toEqual({ ok: false, reason: 'indeterminate' });
    }
  });

  it('refuses series assembled from different revisions, clocks or time orders', () => {
    const series = prepared(nativeWeldedLoadedRod().document);
    const changed = (sample: Partial<BodyForceInput['sample']>) =>
      series.inputs.map((input, i) =>
        i === 2 ? { ...input, sample: { ...input.sample, ...sample } } : input
      );
    expect(series.run(changed({ revision: 3 }))).toEqual({ ok: false, reason: 'mixed-revision' });
    expect(series.run(changed({ partitionKey: 'another clock' }))).toEqual({
      ok: false,
      reason: 'partition',
    });
    expect(series.run([...series.inputs].reverse())).toEqual({ ok: false, reason: 'sample-order' });
    expect(series.run().ok).toBe(true);
  });
});
