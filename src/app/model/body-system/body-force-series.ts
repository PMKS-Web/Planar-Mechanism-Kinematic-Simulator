import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { BodySolveFrame } from './body-solve-frame';
import { Point } from './body-frame';
import { BodyForceInput, solveBodyForceFrame } from './body-force-frame';
import { BodyForceFrame } from './force-frame-result';
import { freezeResult } from './sample-results';

export type BodyForceSeries =
  | { readonly ok: false; readonly reason: 'sample-order' | 'mixed-revision' | 'partition' }
  | {
      readonly ok: true;
      readonly supportPolicy: 'unique' | 'evenest';
      readonly frames: readonly BodyForceFrame[];
      readonly sharedSupportFrames: number;
    };

/** As in the existing solver, persistent support redundancy selects one policy for the whole series. */
export function solveBodyForceSeries(
  document: BodyDocument,
  system: CompiledBodySystem,
  frame: BodySolveFrame,
  inputs: readonly BodyForceInput[],
  options: { readonly mode: 'static' | 'dynamic'; readonly gravity: Point }
): BodyForceSeries {
  for (const [i, input] of inputs.entries()) {
    if (input.sample.partitionKey !== frame.partition.key)
      return freezeResult({ ok: false, reason: 'partition' });
    if (input.sample.revision !== inputs[0].sample.revision)
      return freezeResult({ ok: false, reason: 'mixed-revision' });
    if (
      i > 0 &&
      (input.sample.index <= inputs[i - 1].sample.index ||
        input.sample.time <= inputs[i - 1].sample.time)
    )
      return freezeResult({ ok: false, reason: 'sample-order' });
  }
  const unique = inputs.map((input) =>
    solveBodyForceFrame(document, system, frame, input, { ...options, supportPolicy: 'unique' })
  );
  // Internal weld ambiguity and isolated rank loss are not redundant external supports.
  const redundant = unique.filter(
    (result) => result.ok && result.externalNullity > 0 && result.freeEquilibriumDirections === 0
  ).length;
  const supportPolicy = redundant * 2 > inputs.length ? ('evenest' as const) : ('unique' as const);
  const frames =
    supportPolicy === 'unique'
      ? unique
      : inputs.map((input) =>
          solveBodyForceFrame(document, system, frame, input, { ...options, supportPolicy })
        );
  return freezeResult({
    ok: true,
    supportPolicy,
    frames,
    sharedSupportFrames:
      supportPolicy === 'evenest' ? frames.filter((result) => result.ok).length : 0,
  });
}
