import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { advanceBodyCommand, initialBodyContinuation } from './body-continuation';
import { inspectBodyInterval } from './body-interval';

function permutations<T>(values: readonly T[]): T[][] {
  return values.length
    ? values.flatMap((value, i) =>
        permutations(values.filter((_, j) => i !== j)).map((rest) => [value, ...rest])
      )
    : [[]];
}
describe('fold localization independent of compiler enumeration', () => {
  it('reaches the same oblique tangency for every body and joint-row ordering on both roots', () => {
    for (const branch of [1, -1] as const) {
      const fixture = nativeObliqueCylinder(3.2, branch),
        compiled = compileBodyDocument(fixture.document);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
      const base = compiled.system.partitions[0];
      const jointIds = [
        ...new Set(base.rows.filter((row) => !row.commandId).map((row) => row.jointId)),
      ];
      for (const unknowns of permutations(base.unknowns))
        for (const joints of permutations(jointIds)) {
          const rows = [
            ...joints.flatMap((id) =>
              base.rows.filter((row) => row.jointId === id && !row.commandId)
            ),
            ...base.rows.filter((row) => row.commandId),
          ];
          const admitted = admitBodyPartition(compiled.system, { ...base, unknowns, rows });
          if (!admitted.ok) throw new Error(admitted.reason);
          let start = initialBodyContinuation(admitted);
          for (const command of [0.32, 0.24]) {
            const next = advanceBodyCommand(admitted, start, command);
            if (!next.ok) throw new Error(next.reason);
            start = next.state;
          }
          const result = inspectBodyInterval(admitted, start, 0.16);
          if (!result.ok)
            throw new Error(
              JSON.stringify({
                branch,
                bodyOrder: unknowns.map((id) => base.unknowns.indexOf(id)),
                rowOrder: joints.map((id) => jointIds.indexOf(id)),
                ...result,
              })
            );
          expect(result.stop?.kind).toBe('fold');
          expect(result.state.command).toBeCloseTo(0.2, 9);
          expect(result.probes).toBeLessThan(32);
        }
    }
  });
});
