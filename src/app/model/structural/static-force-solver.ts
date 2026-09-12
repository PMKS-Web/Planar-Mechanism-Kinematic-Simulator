import type { StructuralConfiguration } from './configuration';
import { analyzeEquilibrium } from './equilibrium-solver';
import type { LoadCase } from './loads';
import type { StaticForceAnalysisResult } from './results';

export { STRUCTURAL_TOLERANCES } from './equilibrium-solver';

/** Pure static equilibrium; no acceleration is inferred from this pose. */
export function analyzeStatic(
  configuration: StructuralConfiguration,
  loadCase: LoadCase
): StaticForceAnalysisResult {
  const result = analyzeEquilibrium(configuration, loadCase);
  if (result.status !== 'ok') return result;
  return {
    status: result.status,
    diagnostics: result.diagnostics,
    jointReactions: result.jointReactions,
    driverReactions: result.driverReactions,
    linkEquilibrium: result.linkEquilibrium,
  };
}
