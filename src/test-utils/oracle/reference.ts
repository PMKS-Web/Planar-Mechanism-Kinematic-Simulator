import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * A reference file as `oracle/pmks_oracle/reference.py` writes it: schema
 * `pmks-oracle-reference/1`. Columnar: `samples.k[i]` is the driver's grid
 * index of the i-th stored state, and every other column is indexed the same.
 * Velocities are for the driver moving toward increasing travel at the
 * problem's speed; accelerations and forces do not depend on the direction.
 */
export const REFERENCE_SCHEMA = 'pmks-oracle-reference/1';

type Vec = [number, number];

export interface OracleLimit {
  kind: 'toggle' | 'slot-end' | 'singular' | 'solver-failure' | 'budget';
  travel: number;
}

export interface OracleForces {
  reactions: Record<string, Record<string, Vec[]>>;
  couples: Record<string, Record<string, number[]>>;
  bodyTotals: Record<string, Vec[]>;
  effort: (number | null)[];
  residual: number[];
  identifiable: Record<string, Record<string, boolean>>;
}

export interface OracleReference {
  schema: typeof REFERENCE_SCHEMA;
  problem: string;
  problemSha256: string;
  generator: { oracle: string; sourceSha256: string; exudyn: string; numpy: string };
  mobility: {
    coordinates: number;
    constraints: number;
    rank: number;
    freedoms: number;
    redundant: number;
    driven_rank: number;
    driven_freedoms: number;
    smallest_singular_values: number[];
    exudyn_freedoms: number | null;
    /** Of `freedoms`, those that survive the second-order test (oracle/pmks_oracle/mobility.py). */
    second_order_freedoms: number;
    /** Of `driven_freedoms`, likewise. */
    second_order_driven_freedoms: number;
  };
  sweep: null | {
    driver: {
      kind: 'rotation' | 'translation';
      joint: string;
      speed: number;
      acceleration: number;
    };
    step: number;
    kMin: number;
    kMax: number;
    closesAfterTurns: number | null;
    high: OracleLimit | null;
    low: OracleLimit | null;
    initialDrift: number;
    /** Grid samples that land on a singular pose: no state is stored for them. */
    singularPoses: number[];
    samples: {
      k: number[];
      driverTravel: number[];
      condition: number[];
      gammaError: number[];
      points: Record<string, { pos: Vec[]; vel: Vec[]; acc: Vec[] }>;
      bodies: Record<
        string,
        {
          angle: number[];
          omega: number[];
          alpha: number[];
          com: Vec[];
          comVel: Vec[];
          comAcc: Vec[];
        }
      >;
      sliders: Record<string, { travel: number[]; rate: number[]; acc: number[] }>;
      forces: { static: OracleForces; dynamic: OracleForces };
    };
  };
}

/**
 * The repository root. `ng test` runs there; `__dirname` is no use in a shared
 * helper, because the test build moves it into a chunk of its own.
 */
export const REPOSITORY_ROOT = process.cwd();

export function readReference(path: string): OracleReference {
  return JSON.parse(readFileSync(path, 'utf8')) as OracleReference;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The oracle's own source hash, computed the way `pmks_oracle/run.py` computes
 * it: every `pmks_oracle/*.py` by name in sorted order, name then bytes, then
 * `uv.lock`. A reference written by an older oracle carries a different hash
 * and is stale, just as one written for an older problem is.
 */
export function oracleSourceSha256(files: { name: string; bytes: Buffer }[], lock: Buffer): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    hash.update(file.name, 'utf8');
    hash.update(file.bytes);
  }
  hash.update(lock);
  return hash.digest('hex');
}
