/**
 * Where the joints go when some bars hold their length or their angle.
 *
 * A hold is an edit-time constraint, the way a dimension in a CAD sketch is:
 * a bar that holds its length may still turn about either end, and one that
 * holds its angle may still stretch along its line. An edit asks for one or
 * more joints to be somewhere, and the question is where everything on the
 * held bars ends up so that every hold is still true.
 *
 * The answer is the CAD one. The asked-for joints reach what was asked when
 * the holds allow it, and land on the nearest allowed place when they do not
 * -- dragging the free end of a held bar whose other end is grounded slides it
 * on the arc. Every other joint on a held bar moves as little as it has to:
 * dragging the end of a held bar whose other end is free tows that end along.
 * Grounded and locked joints are fixed and never move; nothing the edit did
 * not ask for is moved unless a hold requires it.
 *
 * Solved by weighted projection (the position-based method): each hold is
 * satisfied in turn by moving its two joints in proportion to their weights,
 * and the sweep is repeated until nothing moves. A fixed joint has no weight;
 * an asked-for joint has almost none, so the holds move it last and least;
 * everything else weighs one. Iterated from where the joints are, with the
 * asked-for ones starting at their targets, so an edit that arrives in small
 * steps -- a drag -- follows the one allowed branch continuously rather than
 * jumping to the mirror assembly.
 *
 * Pure: model points in, model points out, so it is tested against known
 * geometry and never against the canvas.
 */

/** A joint the solver may be asked about. `fixed` joints never move. */
export interface HoldJoint {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

/** A two-joint bar with a hold, and the value it is holding. */
export interface HoldBar {
  id: string;
  a: string;
  b: string;
  hold: 'length' | 'angle';
  /** The held length, in model units, when `hold` is 'length'. */
  length: number;
  /** The held direction from `a` to `b`, in radians, when `hold` is 'angle'. */
  angle: number;
}

/** Where an edit asks a joint to be. */
export interface HoldGoal {
  id: string;
  x: number;
  y: number;
}

export interface HoldSolution {
  /** Every joint the holds reached, where it ends up. Unlisted joints did not move. */
  positions: Map<string, { x: number; y: number }>;
  /** Whether every hold is true at the solution. False means the asks conflict. */
  satisfied: boolean;
  /** How far the asked-for joints landed from what was asked, at the furthest. */
  shortfall: number;
  /**
   * Goals that no motion of the mechanism can satisfy in any direction: the
   * joint is fully determined by the holds and fixed joints around it.
   */
  immovable: string[];
}

const SWEEPS = 400;
const REST = 1e-9;
/** How true a hold must be for the solution to count as one. */
const HOLD_TOLERANCE = 1e-6;
/** The weight of an asked-for joint: last to move, but not never. */
const GOAL_WEIGHT = 1e-4;

/**
 * The bars and joints an edit can reach: the connected component of the goal
 * joints along held bars. Anything outside it is untouched by the holds.
 */
export function reachedByHolds(
  goals: readonly string[],
  bars: readonly HoldBar[]
): { joints: Set<string>; bars: HoldBar[] } {
  const joints = new Set(goals);
  const reached: HoldBar[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const bar of bars) {
      if (reached.includes(bar)) continue;
      if (!joints.has(bar.a) && !joints.has(bar.b)) continue;
      reached.push(bar);
      if (!joints.has(bar.a)) {
        joints.add(bar.a);
        grew = true;
      }
      if (!joints.has(bar.b)) {
        joints.add(bar.b);
        grew = true;
      }
    }
  }
  return { joints, bars: reached };
}

export function settleHolds(
  joints: readonly HoldJoint[],
  bars: readonly HoldBar[],
  goals: readonly HoldGoal[]
): HoldSolution {
  const byId = new Map(joints.map((joint) => [joint.id, joint]));
  const reach = reachedByHolds(
    goals.map((goal) => goal.id),
    bars.filter((bar) => byId.has(bar.a) && byId.has(bar.b))
  );
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));

  // A goal the holds leave no freedom is not asked at all: it stays where it
  // is, as a fixed joint would. Asking anyway sent the sweep off from the
  // target toward whichever of the two rigid assemblies lay nearer to it --
  // the mirror one, half the time -- which is a jump, not a refusal.
  const immovable = goals
    .filter((goal) => {
      const joint = byId.get(goal.id);
      return joint && !joint.fixed && !canMove(goal.id, joints, reach.bars);
    })
    .map((goal) => goal.id);

  // Working positions and weights, for the joints the holds reach.
  const pos = new Map<string, { x: number; y: number }>();
  const weight = new Map<string, number>();
  for (const id of reach.joints) {
    const joint = byId.get(id);
    if (!joint) continue;
    const goal = goalById.get(id);
    const still = joint.fixed || immovable.includes(id);
    pos.set(id, still || !goal ? { x: joint.x, y: joint.y } : { x: goal.x, y: goal.y });
    weight.set(id, still ? 0 : goal ? GOAL_WEIGHT : 1);
  }

  sweep(reach.bars, pos, weight);

  // The weighting leaves an asked-for joint a hair short of its ask even when
  // the ask was reachable -- it moved by its small share of every correction.
  // So ask again with the goals pinned: if the holds can all be met with the
  // goals exactly where they were asked, that is the answer.
  const pinned = new Map<string, { x: number; y: number }>();
  const pinnedWeight = new Map(weight);
  for (const [id, at] of pos) pinned.set(id, { ...at });
  for (const goal of goals) {
    if (!pinned.has(goal.id) || weight.get(goal.id) === 0) continue;
    pinned.set(goal.id, { x: goal.x, y: goal.y });
    pinnedWeight.set(goal.id, 0);
  }
  sweep(reach.bars, pinned, pinnedWeight);
  if (worstResidual(reach.bars, pinned) <= HOLD_TOLERANCE) {
    for (const [id, at] of pinned) pos.set(id, at);
  }

  const worst = worstResidual(reach.bars, pos);
  let shortfall = 0;
  for (const goal of goals) {
    const at = pos.get(goal.id);
    if (at) shortfall = Math.max(shortfall, Math.hypot(at.x - goal.x, at.y - goal.y));
  }

  // Report only what moved, so a caller can write back exactly that.
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, at] of pos) {
    const was = byId.get(id)!;
    if (Math.hypot(at.x - was.x, at.y - was.y) > REST) positions.set(id, at);
  }
  return { positions, satisfied: worst <= HOLD_TOLERANCE, shortfall, immovable };
}

function sweep(
  bars: readonly HoldBar[],
  pos: Map<string, { x: number; y: number }>,
  weight: Map<string, number>
): void {
  for (let pass = 0; pass < SWEEPS; pass++) {
    let moved = 0;
    for (const bar of bars) {
      moved = Math.max(moved, project(bar, pos, weight));
    }
    if (moved < REST) break;
  }
}

function worstResidual(
  bars: readonly HoldBar[],
  pos: Map<string, { x: number; y: number }>
): number {
  let worst = 0;
  for (const bar of bars) worst = Math.max(worst, residual(bar, pos));
  return worst;
}

/** Satisfy one hold by moving its joints in proportion to their weights. */
function project(
  bar: HoldBar,
  pos: Map<string, { x: number; y: number }>,
  weight: Map<string, number>
): number {
  const p = pos.get(bar.a)!;
  const q = pos.get(bar.b)!;
  const wp = weight.get(bar.a)!;
  const wq = weight.get(bar.b)!;
  const total = wp + wq;
  if (total === 0) return 0;
  if (bar.hold === 'length') {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    // Two joints on top of each other have no direction to part along; take
    // the held one.
    const ux = d > REST ? dx / d : Math.cos(bar.angle);
    const uy = d > REST ? dy / d : Math.sin(bar.angle);
    const err = d - bar.length;
    const sp = (wp / total) * err;
    const sq = (wq / total) * err;
    p.x += ux * sp;
    p.y += uy * sp;
    q.x -= ux * sq;
    q.y -= uy * sq;
    return Math.abs(err);
  }
  // Angle: the pair must lie along the held direction. Move each joint across
  // that direction until the offset between them is gone.
  const nx = -Math.sin(bar.angle);
  const ny = Math.cos(bar.angle);
  const across = (q.x - p.x) * nx + (q.y - p.y) * ny;
  const sp = (wp / total) * across;
  const sq = (wq / total) * across;
  p.x += nx * sp;
  p.y += ny * sp;
  q.x -= nx * sq;
  q.y -= ny * sq;
  return Math.abs(across);
}

/** How far a hold is from true, in model units. */
function residual(bar: HoldBar, pos: Map<string, { x: number; y: number }>): number {
  const p = pos.get(bar.a)!;
  const q = pos.get(bar.b)!;
  if (bar.hold === 'length') return Math.abs(Math.hypot(q.x - p.x, q.y - p.y) - bar.length);
  return Math.abs((q.x - p.x) * -Math.sin(bar.angle) + (q.y - p.y) * Math.cos(bar.angle));
}

/**
 * Whether the holds leave this joint any freedom at all.
 *
 * The holds are equations in the free joints' coordinates; their Jacobian's
 * null space is every motion the mechanism can still make. The joint can move
 * exactly when some vector of that space moves it. Found by row-reducing the
 * Jacobian at the current pose, which is exact for these few equations and
 * needs no tolerance games beyond a pivot floor.
 */
function canMove(id: string, joints: readonly HoldJoint[], bars: readonly HoldBar[]): boolean {
  const free = joints.filter((joint) => !joint.fixed);
  const column = new Map<string, number>();
  free.forEach((joint, index) => column.set(joint.id, 2 * index));
  const n = 2 * free.length;
  const at = new Map(joints.map((joint) => [joint.id, joint]));
  const rows: number[][] = [];
  for (const bar of bars) {
    const p = at.get(bar.a)!;
    const q = at.get(bar.b)!;
    const row = new Array<number>(n).fill(0);
    let gx: number;
    let gy: number;
    if (bar.hold === 'length') {
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      gx = (q.x - p.x) / d;
      gy = (q.y - p.y) / d;
    } else {
      gx = -Math.sin(bar.angle);
      gy = Math.cos(bar.angle);
    }
    const ca = column.get(bar.a);
    const cb = column.get(bar.b);
    if (cb !== undefined) {
      row[cb] += gx;
      row[cb + 1] += gy;
    }
    if (ca !== undefined) {
      row[ca] -= gx;
      row[ca + 1] -= gy;
    }
    rows.push(row);
  }
  const c = column.get(id);
  if (c === undefined) return false;
  return nullSpaceMoves(rows, n, [c, c + 1]);
}

/** Whether some vector in the null space of `rows` has a nonzero entry among `columns`. */
function nullSpaceMoves(rows: number[][], n: number, columns: number[]): boolean {
  const m = rows.map((row) => row.slice());
  const pivotColumns: number[] = [];
  let r = 0;
  for (let col = 0; col < n && r < m.length; col++) {
    let best = r;
    for (let i = r + 1; i < m.length; i++) {
      if (Math.abs(m[i][col]) > Math.abs(m[best][col])) best = i;
    }
    if (Math.abs(m[best][col]) < 1e-9) continue;
    [m[r], m[best]] = [m[best], m[r]];
    const lead = m[r][col];
    for (let k = 0; k < n; k++) m[r][k] /= lead;
    for (let i = 0; i < m.length; i++) {
      if (i === r) continue;
      const factor = m[i][col];
      if (factor === 0) continue;
      for (let k = 0; k < n; k++) m[i][k] -= factor * m[r][k];
    }
    pivotColumns.push(col);
    r++;
  }
  const isPivot = new Set(pivotColumns);
  // A free column is a null-space direction: it moves itself by one and each
  // pivot column by minus its entry in that row.
  for (let freeCol = 0; freeCol < n; freeCol++) {
    if (isPivot.has(freeCol)) continue;
    if (columns.includes(freeCol)) return true;
    for (let i = 0; i < pivotColumns.length; i++) {
      if (columns.includes(pivotColumns[i]) && Math.abs(m[i][freeCol]) > 1e-9) return true;
    }
  }
  return false;
}
