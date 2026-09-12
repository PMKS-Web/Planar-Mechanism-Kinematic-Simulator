// Enter the model through joint.ts, as the production fixture builder does.
import { RevJoint } from '../joint';
import { RealLink } from '../link';
import { Mechanism } from '../mechanism/mechanism';
import { PositionSolver } from '../mechanism/position-solver';
import { speedTurning } from '../drive-direction';
import { FourBarParameters, PathSynthesisResult, ProductionValidation } from './path-types';
import { evaluateFourBar, fourBarPose } from './four-bar';
import { distance } from './path-target';
import { rankCandidates } from './path-candidates';

export interface PathMechanismEntities {
  joints: RevJoint[];
  links: RealLink[];
  driver: RevJoint;
  tracer: RevJoint;
}

/** Ordinary PMKS entities, with the tracer as a third point on BC, never another body. */
export function pathMechanism(
  p: FourBarParameters,
  ids: readonly string[] = ['A', 'B', 'C', 'D', 'E']
): PathMechanismEntities {
  const evaluation = evaluateFourBar(p, 2, false);
  if (!evaluation.valid) throw new Error(`Cannot create four-bar: ${evaluation.reason}`);
  if (ids.length !== 5 || new Set(ids).size !== 5 || ids.some((id) => !/^[A-Z]$/.test(id)))
    throw new Error('Five distinct PMKS joint letters are required.');
  const pose = evaluation.poses[0];
  const [a, b, c, d, tracer] = [p.A, pose.B, pose.C, p.D, pose.P].map(
    (q, i) => new RevJoint(ids[i], q.x, q.y, i === 0, i === 0 || i === 3)
  );
  a.driveSpeed = speedTurning(p.direction === 'clockwise', 10);
  tracer.showCurve = true;
  const links = [
    [a, b],
    [b, c, tracer],
    [c, d],
  ].map((joints) => {
    const link = new RealLink(
      joints
        .map((j) => j.id)
        .sort()
        .join(''),
      joints
    );
    for (const j of joints) {
      j.links.push(link);
      j.connectedJoints.push(...joints.filter((other) => other !== j));
    }
    return link;
  });
  return { joints: [a, b, c, d, tracer], links, driver: a, tracer };
}

/**
 * Production position solving is static. Borrow it synchronously, restoring every data field
 * in finally, including private fields, so validation cannot poison the drawing's next solve.
 * Its reset creates fresh solve containers; no live drawing entities are passed into it.
 */
function isolatedPositions<T>(work: () => T): T {
  const descriptors = Object.getOwnPropertyDescriptors(PositionSolver);
  try {
    PositionSolver.resetStaticVariables();
    PositionSolver.forcePositionMap = new Map();
    PositionSolver.forceMagnitudeMap = new Map();
    return work();
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if ('value' in descriptor && typeof descriptor.value !== 'function' && descriptor.writable)
        Object.defineProperty(PositionSolver, key, descriptor);
    }
  }
}

/** Validate normal mobility/cycle computation AND the exact requested monotone input interval. */
export function validatePathMechanism(
  p: FourBarParameters,
  dimension: number
): ProductionValidation {
  const tolerance = Math.max(0.003, dimension * 2e-5);
  let samples = 0,
    playbackSamples = 0,
    maximumDifference = 0;
  const failed = (reason: string): ProductionValidation => ({
    status: 'failed',
    reason,
    samples,
    playbackSamples,
    maximumDifference,
    tolerance,
  });
  if (!(dimension > 0) || !Number.isFinite(dimension))
    return failed('Invalid reference dimension.');
  try {
    return isolatedPositions(() => {
      const entities = pathMechanism(p);
      const mechanism = new Mechanism(
        entities.joints,
        entities.links,
        [],
        [],
        false,
        'cm',
        speedTurning(p.direction === 'clockwise', 1)
      );
      if (!mechanism.isMechanismValid())
        return failed(`PMKS mechanism: ${mechanism.failure ?? 'unsolved'}.`);
      // Normal animation may use a different step size from the verifier below. Verify its
      // actual frames too: a branch jump at that spacing must not hide behind a finer walk.
      let prior = p.theta0,
        progress = 0;
      for (const frame of mechanism.joints) {
        const [a, b, c, , tracer] = frame;
        const theta = Math.atan2(b.y - a.y, b.x - a.x);
        const advance =
          Math.atan2(Math.sin(theta - prior), Math.cos(theta - prior)) *
          (p.direction === 'clockwise' ? -1 : 1);
        progress += advance;
        prior = theta;
        if (progress > p.sweep + 1e-6) break;
        if (advance < -1e-6)
          return failed('Normal PMKS animation reverses before the requested sweep ends.');
        const expected = fourBarPose(p, theta);
        if (typeof expected === 'string')
          return failed(`Normal PMKS animation reaches ${expected}.`);
        const error = Math.max(distance(c, expected.C), distance(tracer, expected.P));
        playbackSamples++;
        maximumDifference = Math.max(maximumDifference, error);
        if (!Number.isFinite(error) || error > tolerance)
          return failed(`Normal PMKS animation disagrees at frame ${playbackSamples}.`);
        if (progress >= p.sweep - 1e-6) break;
      }
      const count = Math.ceil(p.sweep / (Math.PI / 360));
      PositionSolver.resetStaticVariables();
      PositionSolver.determineJointOrder(entities.joints, entities.links);
      PositionSolver.setUpInitialJointLocations(entities.joints);
      PositionSolver.revoluteSampleStep = p.sweep / count;
      for (let i = 1; i <= count; i++) {
        if (
          !PositionSolver.determinePositionAnalysis(
            entities.joints,
            entities.links,
            [],
            p.direction === 'counterclockwise'
          )
        )
          return failed(`PMKS input sweep stopped at sample ${i}.`);
        for (const joint of entities.joints) {
          const point = PositionSolver.jointMapPositions.get(joint.id);
          if (point) {
            joint.x = point[0];
            joint.y = point[1];
          }
        }
        const theta = p.theta0 + ((p.direction === 'clockwise' ? -1 : 1) * p.sweep * i) / count;
        const expected = fourBarPose(p, theta);
        if (typeof expected === 'string') return failed(`Analytic evaluator: ${expected}.`);
        const [, b, c, , tracer] = entities.joints;
        const error = Math.max(
          distance(b, expected.B),
          distance(c, expected.C),
          distance(tracer, expected.P)
        );
        samples++;
        maximumDifference = Math.max(maximumDifference, error);
        if (!Number.isFinite(error) || error > tolerance)
          return failed(`PMKS and analytic trajectories disagree at sample ${i}.`);
      }
      return { status: 'passed', samples, playbackSamples, maximumDifference, tolerance };
    });
  } catch (error) {
    return failed(error instanceof Error ? error.message : 'PMKS validation failed.');
  }
}

/** Rank only production-verified finalists as usable results. Unverified output is never insertable. */
export function validatePathResult(result: PathSynthesisResult): PathSynthesisResult {
  if (!result.target || result.status === 'cancelled') return result;
  const start = Date.now();
  for (const candidate of result.candidates) {
    candidate.production = validatePathMechanism(candidate.parameters, result.target.dimension);
    if (candidate.production.status !== 'passed') {
      result.diagnostics.rejected['production-validation'] =
        (result.diagnostics.rejected['production-validation'] ?? 0) + 1;
      result.diagnostics.messages.push(
        candidate.production.reason ?? 'Production validation failed.'
      );
    }
  }
  const ranked = rankCandidates(result.candidates, result.target);
  result.rankedCandidates = ranked.ranked;
  result.rejectedFinalists = ranked.rejected;
  result.duplicateFinalists = ranked.duplicates;
  result.best = ranked.ranked[0];
  if (!result.best && result.candidates.length) result.status = 'production-validation-failed';
  else if (
    result.best &&
    result.status === 'converged' &&
    result.best.errors.normalizedRms > result.acceptableNormalizedRms
  )
    result.status = 'iteration-limit';
  result.diagnostics.elapsedMs += Date.now() - start;
  return result;
}
