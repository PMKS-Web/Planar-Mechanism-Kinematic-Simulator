import { PathSynthesisCandidate, PreparedPath } from './path-types';

/** Relative geometry, including ground placement and local tracer coordinates. No size penalty.
 * Branch/direction are kept distinct; cognate linkages are not claimed to be algebraically deduped. */
export function candidateDistance(
  a: PathSynthesisCandidate,
  b: PathSynthesisCandidate,
  target: PreparedPath
): number {
  if (
    a.parameters.assembly !== b.parameters.assembly ||
    a.parameters.direction !== b.parameters.direction
  )
    return Infinity;
  const vector = (c: PathSynthesisCandidate) => {
    const p = c.parameters,
      L = target.dimension;
    return [
      (p.A.x - target.centroid.x) / L,
      (p.A.y - target.centroid.y) / L,
      (p.D.x - target.centroid.x) / L,
      (p.D.y - target.centroid.y) / L,
      p.crank / L,
      p.coupler / L,
      p.rocker / L,
      p.u / L,
      p.v / L,
      Math.cos(p.theta0),
      Math.sin(p.theta0),
      p.sweep / (2 * Math.PI),
    ];
  };
  const av = vector(a),
    bv = vector(b);
  return Math.sqrt(av.reduce((sum, v, i) => sum + (v - bv[i]) ** 2, 0) / av.length);
}

export function rankCandidates(
  candidates: readonly PathSynthesisCandidate[],
  target: PreparedPath
) {
  const ranked: PathSynthesisCandidate[] = [],
    duplicates: PathSynthesisCandidate[] = [],
    rejected: PathSynthesisCandidate[] = [];
  for (const candidate of [...candidates].sort(
    (a, b) => a.errors.normalizedRms - b.errors.normalizedRms
  )) {
    if (candidate.production.status !== 'passed') rejected.push(candidate);
    else if (ranked.some((other) => candidateDistance(candidate, other, target) < 0.015))
      duplicates.push(candidate);
    else ranked.push(candidate);
  }
  return { ranked, duplicates, rejected };
}
