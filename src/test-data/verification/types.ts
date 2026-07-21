/**
 * Reference kinematics/force traces exported from the MATLAB solvers in
 * https://github.com/PMKS-Web/PMKS_Verification.
 *
 * Every series is indexed by "row", where row r is the mechanism with its
 * input crank rotated r degrees from the initial position (1-degree steps,
 * reversing direction at toggle points for non-full-rotation linkages).
 * This matches PMKS+'s own timestep discretization in
 * Mechanism.findFullMovementPos, though toggle points may be detected a step
 * or two apart — align rows by crank angle + direction, not by index.
 *
 * Joint keys are single letters matching the PMKS+ joint IDs the fixtures
 * create; link keys are the MATLAB link names (concatenated joint letters,
 * which equal PMKS+ link IDs when the fixture uses the same joint sets).
 */
export interface VerificationDataset {
  source: {
    repository: string;
    commit: string;
    caseId: string;
    casePath: string;
    sourceContentSha256: string;
    comparisonStatus: 'pass';
    pmks: {
      repository: string;
      commit: string;
      upstreamRepository: string;
      upstreamCommit: string;
      sourceContentSha256: string;
      patchSha256: string;
    };
  };
  trust: VerificationTrust;
  capabilities: VerificationCapabilities;
  tolerances: Record<KinematicsQuantity, VerificationTolerance>;
  exclusions: VerificationExclusion[];
  name: string;
  rpm: number;
  inputSpeedRadS: number;
  samples: VerificationSample[];
  /** [x, y] per row, per joint (includes tracer points). */
  jointPos: Record<string, number[][]>;
  jointVel: Record<string, number[][]>;
  jointAcc: Record<string, number[][]>;
  /** [x, y] per row of each link's center of mass, as defined by the MATLAB model. */
  linkCoMPos: Record<string, number[][]>;
  linkCoMVel: Record<string, number[][]>;
  linkCoMAcc: Record<string, number[][]>;
  /** rad/s per row (z component). */
  linkAngVel: Record<string, number[]>;
  /** rad/s^2 per row (z component). */
  linkAngAcc: Record<string, number[]>;
  /** Dynamic (Newton) force analysis, no friction. */
  dynamics?: {
    grav: DynamicsData;
    noGrav?: DynamicsData;
  };
}

export type VerificationTrustLevel =
  | 'matlab-pmks-fork'
  | 'matlab-pmks-fork-motiongen'
  | 'newton-euler-consistency'
  | 'diagnostic-only'
  | 'not-applicable';

export interface VerificationTrust {
  kinematics: VerificationTrustLevel;
  com: VerificationTrustLevel;
  dynamics: VerificationTrustLevel;
  motiongen: VerificationTrustLevel;
}

export interface VerificationCapabilities {
  joints: boolean;
  points: boolean;
  com: boolean;
  links: boolean;
  prismatic: boolean;
  dynamics: boolean;
  motiongen: boolean;
}

export type KinematicsQuantity =
  | 'jointPos'
  | 'jointVel'
  | 'jointAcc'
  | 'linkCoMPos'
  | 'linkCoMVel'
  | 'linkCoMAcc'
  | 'linkAngVel'
  | 'linkAngAcc';

export interface VerificationTolerance {
  abs: number;
  rel: number;
}

export interface VerificationExclusion {
  source: string;
  series: string;
  sampleId: string;
  inputAngleRad: number;
  reason: string;
}

export interface VerificationSample {
  sampleId: string;
  sweepId: string;
  sweepIndex: number;
  inputAngleRad: number;
  inputDirection: 1 | -1;
  timeS: number;
  jacobianCondition: number;
  eligibility: 'eligible' | 'singular';
}

export interface DynamicsData {
  /**
   * [Fx, Fy] per row. Sign convention: the force the joint exerts on the link
   * closer to the input crank in the MATLAB free-body chain (the fixtures
   * order each joint's `links` array so PMKS+ uses the same convention).
   */
  jointForce: Record<string, number[][]>;
  /** Input torque per row (z component, N*m). */
  torque: number[];
}
