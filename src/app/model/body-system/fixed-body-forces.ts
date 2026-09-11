import { BodyDocument } from './body-document';
import { CompiledBodySystem } from './compiled-body-system';
import { fixedBodyAdmission } from './body-admission';
import { BodyForceFrame } from './force-frame-result';
import { fixedForceInputs } from './fixed-force-inputs';
import { FixedBodyForces, FixedForceOptions } from './fixed-force-result';
import { fixedForceBalance } from './fixed-force-balance';
import { freezeResult } from './sample-results';
export type { FixedBodyForces, FixedForceContext, FixedForceOptions } from './fixed-force-result';

/** Fixed supports balance their own material plus all selected clocks, without choosing one clock as owner. */
export function solveFixedBodyForces(
  document: BodyDocument,
  system: CompiledBodySystem,
  revision: number,
  samples: readonly BodyForceFrame[],
  options: FixedForceOptions
): FixedBodyForces {
  const fixedIssue = fixedBodyAdmission(system);
  if (fixedIssue) return freezeResult({ ok: false, reason: fixedIssue });
  const inputs = fixedForceInputs(
    document,
    system,
    revision,
    samples,
    options.mode,
    options.gravity
  );
  return inputs.ok
    ? fixedForceBalance(document, system, revision, inputs, options)
    : freezeResult(inputs);
}
