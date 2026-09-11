import { nativeLinearCarriage } from '../../../test-utils/verification/native-linear-carriage-fixture';
import { nativeFoldPair } from '../../../test-utils/verification/native-fold-pair-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';

describe('F2: closely spaced physical folds without coordinate bounds', () => {
  it('refuses an exhausted arc search and resolves a shorter interval without changing its start', () => {
    const fixture = nativeLinearCarriage(),
      compiled = compileBodyDocument(fixture.document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    const start = initialBodyContinuation(admitted),
      before = JSON.stringify([...start.poses]);
    expect(inspectBodyInterval(admitted, start, 10, { maxDepth: 0 })).toMatchObject({
      ok: false,
      reason: 'unsolved',
    });
    const result = inspectBodyInterval(admitted, start, 10);
    if (!result.ok) throw new Error(result.reason);
    expect(result.stop).toBeUndefined();
    expect(result.state.command).toBe(10);
    expect(JSON.stringify([...start.poses])).toBe(before);
  });
  it('stops at the first extremum even when a commanded endpoint lies beyond both folds', () => {
    for (const strength of [0.001, 0.0001, 0.00001])
      for (const reversed of [false, true]) {
        const fixture = nativeFoldPair(strength);
        const document = reversed
          ? {
              ...fixture.document,
              bodies: [...fixture.document.bodies].reverse(),
              joints: [...fixture.document.joints].reverse(),
            }
          : fixture.document;
        const compiled = compileBodyDocument(document);
        if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
        expect(fixture.document.limits.length).toBe(0);
        const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
        if (!admitted.ok) throw new Error(admitted.reason);
        const result = inspectBodyInterval(
          admitted,
          initialBodyContinuation(admitted),
          fixture.target
        );
        if (!result.ok) throw new Error(JSON.stringify({ strength, ...result }));
        if (!result.stop)
          throw new Error(
            JSON.stringify({
              strength,
              command: result.state.command,
              expected: fixture.foldCommand,
              angle: result.state.poses.get(compiled.system.groupOf.get(fixture.carrier)!)!.angle,
            })
          );
        expect(result.stop.kind).toBe('fold');
        expect(result.state.command).toBeCloseTo(fixture.foldCommand, 10);
        const carrierGroup = compiled.system.groupOf.get(fixture.carrier)!;
        expect(result.state.poses.get(carrierGroup)!.angle).toBeCloseTo(fixture.foldAngle, 8);
      }
  });
});
