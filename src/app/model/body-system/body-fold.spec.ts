import { nativeFourBar } from '../../../test-utils/verification/native-body-fixtures';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';

describe('native geometric input folds', () => {
  it('proves a rocker input limit independently of a failed Newton iteration', () => {
    const lengths = { ground: 4, crank: 3, coupler: 2, rocker: 2 },
      initialAngle = 0.5;
    const fixture = nativeFourBar(lengths, initialAngle);
    const compiled = compileBodyDocument(fixture.document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const system = compiled.system,
      model = admitBodyPartition(system, system.partitions[0]);
    if (!model.ok) throw new Error(model.reason);
    const state = initialBodyContinuation(model),
      before = JSON.stringify([...state.poses]);
    const capped = advanceBodyCommand(model, state, 1.3 - initialAngle, { maxAttempts: 1 });
    expect(capped.ok).toBe(false);
    if (!capped.ok) expect(capped.reason).not.toBe('travel');
    const result = advanceBodyCommand(model, state, 1.3 - initialAngle);
    expect(result.ok, JSON.stringify(result)).toBe(false);
    if (result.ok) throw new Error('Expected physical input limit');
    expect(result.reason).toBe('travel');
    expect(result.fold).toBeDefined();
    const maximum = Math.acos(
      (lengths.ground ** 2 + lengths.crank ** 2 - (lengths.coupler + lengths.rocker) ** 2) /
        (2 * lengths.ground * lengths.crank)
    );
    expect(result.fold!.command + initialAngle).toBeCloseTo(maximum, 8);
    expect(result.fold!.curvature).toBeLessThan(0);
    expect(JSON.stringify([...state.poses])).toBe(before);
    const valid = advanceBodyCommand(model, state, maximum - initialAngle - 0.001);
    expect(valid.ok).toBe(true);
    const lower = advanceBodyCommand(model, state, -1.3 - initialAngle);
    expect(lower.ok).toBe(false);
    if (lower.ok) throw new Error('Expected lower input limit');
    expect(lower.reason).toBe('travel');
    expect(lower.fold!.command + initialAngle).toBeCloseTo(-maximum, 8);
    expect(lower.fold!.curvature).toBeGreaterThan(0);
  });
});
