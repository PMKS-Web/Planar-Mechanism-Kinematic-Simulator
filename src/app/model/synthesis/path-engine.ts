import {
  Assembly,
  DEFAULT_PATH_SETTINGS,
  InputDirection,
  Interval,
  PathSynthesisCandidate,
  PathSynthesisRequest,
  PathSynthesisResult,
  SearchControl,
  SearchProgress,
  SynthesisDiagnostics,
} from './path-types';
import { preparePath } from './path-target';
import { fitFourBar } from './path-objective';
import { boundedSearch, seededRandom } from './bounded-search';

function settingsValid(request: PathSynthesisRequest): boolean {
  const s = request.settings,
    c = request.constraints ?? {};
  const integer = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  const range = (r: Interval | undefined) =>
    !r || (r.length === 2 && r.every(Number.isFinite) && r[0] > 0 && r[1] >= r[0]);
  return (
    request.family === 'four-bar' &&
    ['equal-input-angle', 'monotone-free-timing'].includes(request.correspondence.kind) &&
    ['clockwise', 'counterclockwise', 'either'].includes(request.direction) &&
    integer(s.seed, 0, 4294967295) &&
    integer(s.population, 4, 256) &&
    integer(s.generations, 1, 2000) &&
    integer(s.refinementIterations, 0, 1000) &&
    integer(s.starts, 1, 10) &&
    integer(s.maxEvaluations, 1, 1000000) &&
    Number.isFinite(s.acceptableNormalizedRms) &&
    s.acceptableNormalizedRms > 0 &&
    [c.groundLength, c.linkLength, c.lengthRatio, c.sweep].every(range) &&
    (!c.lengthRatio || (c.lengthRatio[0] >= 0.01 && c.lengthRatio[1] <= 20)) &&
    (!c.sweep ||
      (c.sweep[1] <= 2 * Math.PI &&
        (!request.target.closed || (c.sweep[0] === 2 * Math.PI && c.sweep[1] === 2 * Math.PI)))) &&
    (c.maxCouplerOffset === undefined ||
      (Number.isFinite(c.maxCouplerOffset) && c.maxCouplerOffset > 0)) &&
    (!c.pivotBox ||
      ([c.pivotBox.min.x, c.pivotBox.min.y, c.pivotBox.max.x, c.pivotBox.max.y].every(
        Number.isFinite
      ) &&
        c.pivotBox.min.x <= c.pivotBox.max.x &&
        c.pivotBox.min.y <= c.pivotBox.max.y))
  );
}

/** Pure search. Unchecked finalists are explicitly marked; the PMKS adapter must validate them. */
export function* searchPath(
  request: PathSynthesisRequest,
  control: SearchControl = {}
): Generator<SearchProgress, PathSynthesisResult> {
  const started = Date.now();
  const diagnostics: SynthesisDiagnostics = {
    evaluations: 0,
    validEvaluations: 0,
    iterations: 0,
    starts: 0,
    rejected: {},
    messages: [],
    elapsedMs: 0,
  };
  const result: PathSynthesisResult = {
    status: 'invalid-settings',
    acceptableNormalizedRms: request.settings.acceptableNormalizedRms,
    candidates: [],
    diagnostics,
  };
  const finish = () => {
    diagnostics.elapsedMs = Date.now() - started;
    return result;
  };
  if (!settingsValid(request)) {
    diagnostics.messages.push('The synthesis settings or bounds are invalid.');
    return finish();
  }
  const prepared = preparePath(request.target, request.settings.sampleCount);
  if (!prepared.valid) {
    result.status = prepared.status;
    diagnostics.messages.push(prepared.message);
    return finish();
  }
  const target = (result.target = prepared.path);
  const s = request.settings,
    constraints = request.constraints ?? {};
  const ratio = constraints.lengthRatio ?? [0.08, 4];
  const logRange: Interval = [Math.log(ratio[0]), Math.log(ratio[1])];
  const bounds: Interval[] = [logRange, logRange, logRange, [0, 2 * Math.PI]];
  if (!target.closed) bounds.push(constraints.sweep ?? [Math.PI / 12, 1.9 * Math.PI]);
  const directions: InputDirection[] =
    request.direction === 'either' ? ['counterclockwise', 'clockwise'] : [request.direction];
  const stopped = () => !!control.cancelled?.() || diagnostics.evaluations >= s.maxEvaluations;
  const random = seededRandom(s.seed);
  // Retain the best from each independent run, not a thousand almost-identical iterates.
  for (let start = 0; start < s.starts && !stopped(); start++) {
    for (const direction of directions)
      for (const assembly of [1, -1] as Assembly[]) {
        if (stopped()) break;
        diagnostics.starts++;
        let best: PathSynthesisCandidate | undefined;
        const objective = (point: number[]) => {
          diagnostics.evaluations++;
          const measured = performance.now(),
            profile = { correspondenceMs: 0 };
          const trial = fitFourBar(
            point,
            assembly,
            direction,
            target,
            constraints,
            request.correspondence.kind,
            profile
          );
          const duration = performance.now() - measured;
          diagnostics.objectiveMs = (diagnostics.objectiveMs ?? 0) + duration;
          diagnostics.correspondenceMs =
            (diagnostics.correspondenceMs ?? 0) + profile.correspondenceMs;
          diagnostics.maxObjectiveMs = Math.max(diagnostics.maxObjectiveMs ?? 0, duration);
          if ('reason' in trial)
            diagnostics.rejected[trial.reason] = (diagnostics.rejected[trial.reason] ?? 0) + 1;
          else {
            diagnostics.validEvaluations++;
            if (!best || trial.candidate.errors.normalizedRms < best.errors.normalizedRms)
              best = trial.candidate;
          }
          return trial.score;
        };
        for (const iterationComplete of boundedSearch(objective, {
          bounds,
          population: s.population,
          generations: s.generations,
          refinementIterations: s.refinementIterations,
          random,
          stop: stopped,
        })) {
          if (iterationComplete) diagnostics.iterations++;
          yield {
            evaluations: diagnostics.evaluations,
            bestNormalizedRms: best?.errors.normalizedRms,
          };
        }
        if (best) result.candidates.push(best);
      }
  }
  result.candidates.sort((a, b) => a.errors.normalizedRms - b.errors.normalizedRms);
  result.best = result.candidates[0];
  result.status = control.cancelled?.()
    ? 'cancelled'
    : !result.best
      ? 'no-feasible-mechanism'
      : result.best.errors.normalizedRms <= s.acceptableNormalizedRms
        ? 'converged'
        : diagnostics.evaluations >= s.maxEvaluations
          ? 'evaluation-limit'
          : 'iteration-limit';
  if (diagnostics.evaluations >= s.maxEvaluations)
    diagnostics.messages.push('The evaluation budget was exhausted.');
  diagnostics.messages.push(
    request.correspondence.kind === 'equal-input-angle'
      ? 'Equal input-angle progression is compared with uniform target arc length.'
      : 'Monotone free timing is optimized by ordered assignment and alternating projection; the result is a bounded local fit.'
  );
  return finish();
}

export function searchPathSync(
  request: PathSynthesisRequest,
  control: SearchControl = {}
): PathSynthesisResult {
  const run = searchPath(request, control);
  let step = run.next();
  while (!step.done) step = run.next();
  return step.value;
}

export { DEFAULT_PATH_SETTINGS };
