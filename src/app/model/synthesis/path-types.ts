/** Serializable numerical contracts. Lengths are in the caller's world units; angles are radians. */
export interface PathPoint {
  x: number;
  y: number;
}
export type Interval = readonly [number, number];
export type Assembly = -1 | 1;
export type InputDirection = 'clockwise' | 'counterclockwise';

export interface PathTarget {
  points: readonly PathPoint[];
  closed: boolean;
  interpolation: 'polyline' | 'catmull-rom';
}

export interface PathSynthesisSettings {
  sampleCount: number;
  seed: number;
  population: number;
  generations: number;
  refinementIterations: number;
  /** Independent populations per assembly/direction. */
  starts: number;
  maxEvaluations: number;
  /** A success threshold, not a guarantee of global optimality. */
  acceptableNormalizedRms: number;
}

export interface PathConstraints {
  /** World-unit limits; defaults are relative to the target's bounding-box diagonal. */
  groundLength?: Interval;
  linkLength?: Interval;
  maxCouplerOffset?: number;
  pivotBox?: { min: PathPoint; max: PathPoint };
  /** Crank/coupler/rocker lengths relative to ground; bounds the nonlinear search. */
  lengthRatio?: Interval;
  /** Positive radians. Closed targets require exactly a full revolution. */
  sweep?: Interval;
}

export interface PathSynthesisRequest {
  family: 'four-bar';
  target: PathTarget;
  correspondence: { kind: 'equal-input-angle' };
  direction: InputDirection | 'either';
  settings: PathSynthesisSettings;
  constraints?: PathConstraints;
}

export const DEFAULT_PATH_SETTINGS: PathSynthesisSettings = {
  sampleCount: 64,
  seed: 20260912,
  population: 36,
  generations: 140,
  refinementIterations: 90,
  starts: 2,
  maxEvaluations: 48000,
  acceptableNormalizedRms: 0.025,
};

export interface PreparedPath {
  points: PathPoint[];
  samples: PathPoint[];
  normalized: PathPoint[];
  closed: boolean;
  bounds: { min: PathPoint; max: PathPoint };
  centroid: PathPoint;
  dimension: number;
  cumulativeArcLength: number[];
  totalArcLength: number;
  removedDuplicates: number;
  /** Repeated non-neighbor points may describe crossings and are retained. */
  repeatedPoints: number;
}

export interface FourBarParameters {
  A: PathPoint;
  D: PathPoint;
  crank: number;
  coupler: number;
  rocker: number;
  /** Along B→C, then perpendicular to its left. */
  u: number;
  v: number;
  theta0: number;
  sweep: number;
  direction: InputDirection;
  assembly: Assembly;
}

export interface FourBarPose {
  B: PathPoint;
  C: PathPoint;
  P: PathPoint;
}
export type GeometryFailure =
  | 'invalid-geometry'
  | 'no-intersection'
  | 'singularity'
  | 'near-tangent'
  | 'input-sweep-infeasible'
  | 'branch-discontinuity';
export type TrajectoryEvaluation =
  | { valid: true; poses: FourBarPose[]; angles: number[]; minClearance: number }
  | { valid: false; reason: GeometryFailure };

export interface PathErrors {
  pointErrors: number[];
  rms: number;
  maximum: number;
  normalizedRms: number;
}

export interface ProductionValidation {
  status: 'unchecked' | 'passed' | 'failed';
  reason?: string;
  samples: number;
  playbackSamples?: number;
  maximumDifference?: number;
  tolerance?: number;
}

export interface PathSynthesisCandidate {
  parameters: FourBarParameters;
  trajectory: PathPoint[];
  angles: number[];
  errors: PathErrors;
  valid: true;
  minClearance: number;
  /** Never included in engineering error. Feasible candidates have no penalty. */
  penalty: number;
  production: ProductionValidation;
}

export type SynthesisStatus =
  | 'converged'
  | 'evaluation-limit'
  | 'iteration-limit'
  | 'no-feasible-mechanism'
  | 'insufficient-points'
  | 'degenerate-target'
  | 'invalid-settings'
  | 'cancelled'
  | 'production-validation-failed';

export interface SynthesisDiagnostics {
  evaluations: number;
  validEvaluations: number;
  iterations: number;
  starts: number;
  rejected: Record<string, number>;
  messages: string[];
  elapsedMs: number;
}

export interface PathSynthesisResult {
  status: SynthesisStatus;
  acceptableNormalizedRms: number;
  target?: PreparedPath;
  candidates: PathSynthesisCandidate[];
  best?: PathSynthesisCandidate;
  diagnostics: SynthesisDiagnostics;
}

export interface SearchControl {
  cancelled?: () => boolean;
}
export interface SearchProgress {
  evaluations: number;
  bestNormalizedRms?: number;
}
