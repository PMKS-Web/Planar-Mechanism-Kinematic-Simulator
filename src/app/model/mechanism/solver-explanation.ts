/** Snapshots of the equations actually assembled, captured only when requested. */
export interface LinearSystemExplanation {
  A: number[][];
  b: number[];
  x: number[];
  unknowns: { label: string; unit: string }[];
  rows: string[];
}

export interface BodyLoad {
  label: string;
  point: [number, number];
  vector: [number, number];
  kind: 'reaction' | 'applied' | 'weight' | 'drive';
  /** A pure couple, in the solver's moment scale; absent for a force. */
  couple?: number;
  /** Reference direction and column, before substituting the solved signed magnitude. */
  column?: number;
  sign?: number;
  direction?: [number, number];
  jointId?: string;
}

export interface BodyExplanation {
  id: string;
  name: string;
  points: { id: string; x: number; y: number }[];
  center: [number, number];
  startRow: number;
  rowCount: number;
  loads: BodyLoad[];
  /** External applied loads and inertia terms, in the original solver scale. */
  known: number[];
  inertia: number[];
}

export interface ForceExplanation {
  system: LinearSystemExplanation;
  bodies: BodyExplanation[];
  fixedBodies: string[];
}

export interface PositionStepExplanation {
  order: number;
  jointId: string;
  method: string;
  knownIds: string[];
  radii: number[];
}

export interface KinematicSnapshot {
  route: 'loops' | 'constraints' | 'rigid-body' | 'unavailable';
  velocity?: LinearSystemExplanation;
  acceleration?: LinearSystemExplanation;
  jointVelocity: Map<string, [number, number]>;
  jointAcceleration: Map<string, [number, number]>;
  bodyVelocity: Map<string, [number, number]>;
  bodyAcceleration: Map<string, [number, number]>;
  omega: Map<string, number>;
  alpha: Map<string, number>;
}
