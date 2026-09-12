/** Engineering-only export contract. SI throughout; no Angular or PMKS class instances. */
export type AnalysisVector = [number, number];
export interface AnalysisBody {
  id: string;
  name: string;
  joints: string[];
  /** Zero-based coordinate offset: [CoM x, CoM y, rotation from initial pose]. */
  offset: number;
  dof: 2 | 3;
  initialCenter: AnalysisVector;
  initialAngle: number;
  mass: number;
  inertia: number;
}
export interface AnalysisPoint {
  /** Zero-based body index, or -1 for the world frame. */
  body: number;
  xy: AnalysisVector;
}
export interface AnalysisJoint {
  id: string;
  name: string;
  initial: AnalysisVector;
  ground: boolean;
  kind: 'pin' | 'slider';
  tracer: boolean;
  point: AnalysisPoint;
}
export interface AnalysisConstraint {
  joint: number;
  positive: AnalysisPoint;
  negative: AnalysisPoint;
  normal: AnalysisVector;
}
export interface AnalysisLoad {
  id: string;
  body: number;
  point: AnalysisVector;
  force: AnalysisVector;
  local: boolean;
}
export interface AnalysisChannel {
  label: string;
  quantity:
    | 'jointPosition'
    | 'jointVelocity'
    | 'jointAcceleration'
    | 'bodyPosition'
    | 'bodyVelocity'
    | 'bodyAcceleration'
    | 'angle'
    | 'omega'
    | 'alpha'
    | 'reaction'
    | 'torque';
  index: number;
  body: number;
  component: number;
  unit: string;
  period: number;
}
export interface AnalysisExportModel {
  name: string;
  bodies: AnalysisBody[];
  joints: AnalysisJoint[];
  constraints: AnalysisConstraint[];
  loads: AnalysisLoad[];
  initial: number[];
  gravity: AnalysisVector;
  driver: {
    joint: string;
    body: number;
    /** [start time, rotation from initial pose, angular velocity]. Piecewise constant speed. */
    segments: number[][];
  };
  settings: { duration: number; step: number; forceMode: 'none' | 'static' | 'dynamic' };
  channels: AnalysisChannel[];
}
