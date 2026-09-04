import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { BodyAssignment, WORLD } from './bodies';

/**
 * How many freedoms the drawing actually has, asked of its geometry.
 *
 * Gruebler's equation counts bodies and joints. It cannot see that two
 * constraints say the same thing, so it subtracts for both -- and a linkage
 * whose redundancy is *geometric* rather than topological comes out one or more
 * too low. The case is drawn all the time here: a parallelogram with a third
 * parallel crank counts as zero and turns perfectly well, because the third
 * crank repeats what the first two already said.
 *
 * The first thing to ask the geometry is the rank of the constraint Jacobian:
 *
 *     freedoms at this instant = (coordinates of the moving bodies) - rank(J)
 *
 * Each moving body carries three coordinates and each joint writes two rows
 * saying what it forbids. Where two rows say the same thing the rank does not
 * rise, which is the arithmetic Gruebler cannot do.
 *
 * **That answer alone is not enough, and believing it is the trap.** A rank
 * deficiency means the linkage can move *at this instant*; it does not mean it
 * can go anywhere. A slider-crank whose coupler is welded to its block, drawn
 * with the crank square to the slot, is the example: the block's line and the
 * crank pin's circle touch there, so first order says they agree and the second
 * order says they part company immediately. The thing is rigid, and reporting
 * one freedom would set a solver tearing it apart.
 *
 * So every freedom the rank finds is put to a second question -- step along it
 * and see whether the constraints can be brought back together -- and only the
 * ones that survive are counted. A redundancy that holds along a whole motion,
 * like the parallelogram's, survives; a tangency does not.
 */
export function mobilityFromGeometry(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment
): number | undefined {
  const bodies = [...assignment.movingBodies];
  if (bodies.length === 0) return undefined;
  const column = new Map(bodies.map((body, index) => [body, index * 3]));
  const width = bodies.length * 3;

  // Each body turns about its own joints' average rather than about the origin.
  // A body's turn column is its joints' offsets from that point, so a drawing
  // sitting far from the origin would otherwise have turn columns hundreds of
  // times the size of its translation columns and the rank test would be
  // reading rounding noise.
  const pivot = pivotsOf(links, assignment);
  const bodyAt = (body: string): Body => ({
    at: column.get(body),
    pivot: pivot.get(body) ?? { x: 0, y: 0 },
  });

  const constraints = constraintsOf(joints, assignment, bodyAt);
  if (constraints.length === 0) return undefined;

  const rows = constraints.flatMap((one) => rowsFor(one, width));
  const free = nullSpace(rows, width);
  if (free.length === 0) return 0;

  const reach = reachOf(links);
  return free.filter((direction) => survivesSecondOrder(direction, constraints, rows, reach, width))
    .length;
}

/** A body's place in the coordinate vector; `at` undefined is the world, which is fixed. */
interface Body {
  at: number | undefined;
  pivot: { x: number; y: number };
}

type Constraint =
  | { kind: 'pin'; at: { x: number; y: number }; a: Body; b: Body }
  | { kind: 'slide'; at: { x: number; y: number }; block: Body; carrier: Body; angle: number };

/** The point each body turns about: the average of the joints on it. */
function pivotsOf(
  links: Link[],
  assignment: BodyAssignment
): Map<string, { x: number; y: number }> {
  const sums = new Map<string, { x: number; y: number; n: number }>();
  for (const link of links) {
    const body = assignment.bodyOf(link);
    if (body === WORLD) continue;
    const at = sums.get(body) ?? { x: 0, y: 0, n: 0 };
    for (const joint of link.joints) {
      at.x += joint.x;
      at.y += joint.y;
      at.n += 1;
    }
    sums.set(body, at);
  }
  return new Map(
    [...sums].map(([body, at]) => [
      body,
      at.n > 0 ? { x: at.x / at.n, y: at.y / at.n } : { x: 0, y: 0 },
    ])
  );
}

/** How far the drawing reaches, for a step size that means the same at any scale. */
function reachOf(links: Link[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const link of links) {
    for (const joint of link.joints) {
      minX = Math.min(minX, joint.x);
      maxX = Math.max(maxX, joint.x);
      minY = Math.min(minY, joint.y);
      maxY = Math.max(maxY, joint.y);
    }
  }
  const span = Math.hypot(maxX - minX, maxY - minY);
  return Number.isFinite(span) && span > 0 ? span : 1;
}

/**
 * What every joint forbids.
 *
 * A pin says two bodies' copies of one point move together. A slider says the
 * block may not turn in its slot and may not leave it, and says nothing about
 * sliding along it. Both are one-freedom joints in the plane, so both cost two,
 * which is what Gruebler charges them as well.
 */
function constraintsOf(
  joints: Joint[],
  assignment: BodyAssignment,
  bodyAt: (body: string) => Body
): Constraint[] {
  const constraints: Constraint[] = [];
  for (const joint of joints) {
    if (!(joint instanceof RealJoint)) continue;
    const meeting = [...assignment.bodiesAt(joint)];
    if (meeting.length < 2) continue;
    const at = { x: joint.x, y: joint.y };

    if (joint instanceof PrisJoint) {
      // The slot belongs to whatever it is cut into: the world for a fixed
      // guide, the carrier for a floating one. The block is what rides it.
      const carrierBody = joint.ground
        ? WORLD
        : joint.carrier
          ? assignment.bodyOf(joint.carrier)
          : undefined;
      const rest = meeting.filter((body) => body !== carrierBody);
      if (carrierBody !== undefined && rest.length > 0) {
        const [block, ...alsoHere] = rest;
        constraints.push({
          kind: 'slide',
          at,
          block: bodyAt(block),
          carrier: bodyAt(carrierBody),
          angle: joint.angle_rad,
        });
        // Anything else meeting the block here is pinned to it, and the count
        // stays the k-1 pairings Gruebler charges for.
        for (const other of alsoHere) {
          constraints.push({ kind: 'pin', at, a: bodyAt(block), b: bodyAt(other) });
        }
        continue;
      }
    }

    const [anchor, ...others] = meeting;
    for (const other of others) {
      constraints.push({ kind: 'pin', at, a: bodyAt(anchor), b: bodyAt(other) });
    }
  }
  return constraints;
}

/** One constraint's two rows: what it forbids, to first order. */
function rowsFor(constraint: Constraint, width: number): number[][] {
  const row = () => new Array<number>(width).fill(0);
  const arm = (body: Body, at: { x: number; y: number }) => ({
    x: at.x - body.pivot.x,
    y: at.y - body.pivot.y,
  });

  if (constraint.kind === 'pin') {
    const inX = row();
    const inY = row();
    for (const [body, sign] of [
      [constraint.a, 1],
      [constraint.b, -1],
    ] as const) {
      if (body.at === undefined) continue;
      const r = arm(body, constraint.at);
      inX[body.at] += sign;
      inX[body.at + 2] += -sign * r.y;
      inY[body.at + 1] += sign;
      inY[body.at + 2] += sign * r.x;
    }
    return [inX, inY];
  }

  const normalX = -Math.sin(constraint.angle);
  const normalY = Math.cos(constraint.angle);
  const across = row();
  const turning = row();
  for (const [body, sign] of [
    [constraint.block, 1],
    [constraint.carrier, -1],
  ] as const) {
    if (body.at === undefined) continue;
    const r = arm(body, constraint.at);
    across[body.at] += sign * normalX;
    across[body.at + 1] += sign * normalY;
    across[body.at + 2] += sign * (normalY * r.x - normalX * r.y);
    turning[body.at + 2] += sign;
  }
  return [across, turning];
}

/** Where a body's copy of a point ends up after a displacement is applied. */
function moved(body: Body, at: { x: number; y: number }, d: number[]): { x: number; y: number } {
  if (body.at === undefined) return at;
  const turn = d[body.at + 2];
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const rx = at.x - body.pivot.x;
  const ry = at.y - body.pivot.y;
  return {
    x: body.pivot.x + d[body.at] + rx * cos - ry * sin,
    y: body.pivot.y + d[body.at + 1] + rx * sin + ry * cos,
  };
}

/** How far apart a constraint's two sides really are, after a displacement. */
function residual(constraint: Constraint, d: number[]): number[] {
  if (constraint.kind === 'pin') {
    const a = moved(constraint.a, constraint.at, d);
    const b = moved(constraint.b, constraint.at, d);
    return [a.x - b.x, a.y - b.y];
  }
  // The slot turns with the body it is cut into, so the direction across it
  // does too -- reading it as fixed is what makes a floating slot look rigid.
  const carrierTurn = constraint.carrier.at === undefined ? 0 : d[constraint.carrier.at + 2];
  const angle = constraint.angle + carrierTurn;
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const block = moved(constraint.block, constraint.at, d);
  const carrier = moved(constraint.carrier, constraint.at, d);
  const blockTurn = constraint.block.at === undefined ? 0 : d[constraint.block.at + 2];
  return [
    normalX * (block.x - carrier.x) + normalY * (block.y - carrier.y),
    blockTurn - carrierTurn,
  ];
}

/**
 * Whether a freedom the rank found is one the linkage can actually take.
 *
 * Step a little way along it and the constraints come apart by an amount that
 * is second order in the step. If some first-order correction can close that
 * gap again, the motion continues and the freedom is real. If the gap has a
 * part no correction can reach -- a part outside the range of the Jacobian --
 * the linkage was touching, not moving, and the freedom dies at the pose it was
 * found in.
 */
function survivesSecondOrder(
  direction: number[],
  constraints: Constraint[],
  rows: number[][],
  reach: number,
  width: number
): boolean {
  // Scaled so the step moves the drawing by a thousandth of its own size,
  // whatever units it is drawn in and however the freedom mixes turning with
  // sliding.
  let worst = 0;
  for (const constraint of constraints) {
    const bodies =
      constraint.kind === 'pin'
        ? [constraint.a, constraint.b]
        : [constraint.block, constraint.carrier];
    for (const body of bodies) {
      if (body.at === undefined) continue;
      const armX = constraint.at.x - body.pivot.x;
      const armY = constraint.at.y - body.pivot.y;
      const spin = Math.abs(direction[body.at + 2]) * Math.hypot(armX, armY);
      worst = Math.max(worst, Math.hypot(direction[body.at], direction[body.at + 1]) + spin);
    }
  }
  if (worst === 0) return false;
  const step = (reach * 1e-3) / worst;
  const displaced = direction.map((value) => value * step);

  const gap = constraints.flatMap((constraint) => residual(constraint, displaced));
  const size = Math.hypot(...gap);
  // The step closed nothing: the freedom is exact to the precision of the
  // arithmetic, which is what a genuine motion looks like.
  const noise = reach * 1e-12;
  if (size <= noise) return true;

  const leftOver = outsideRange(gap, rows, width);
  return leftOver <= size * 1e-3;
}

/**
 * How much of a gap no first-order correction can close.
 *
 * The columns of the Jacobian span everything a correction can reach, so what
 * is left after projecting the gap onto that span is what the linkage cannot
 * fix. The columns have to be made orthogonal to each other first: subtracting
 * each in turn without that leaves a part of the span behind and reports a
 * genuine motion as a tangency, which is the whole answer inverted.
 */
function outsideRange(gap: number[], rows: number[][], width: number): number {
  const size = Math.hypot(...gap);
  if (size === 0) return 0;
  const basis: number[][] = [];
  for (let col = 0; col < width; col++) {
    const direction = rows.map((row) => row[col]);
    for (const already of basis) {
      const along = already.reduce((total, value, index) => total + value * direction[index], 0);
      for (let index = 0; index < direction.length; index++) {
        direction[index] -= along * already[index];
      }
    }
    const length = Math.hypot(...direction);
    // What is left of a column after the others is either a new direction or
    // rounding dust; the threshold is against the column it came from.
    const raw = Math.hypot(...rows.map((row) => row[col]));
    if (length <= raw * 1e-9) continue;
    basis.push(direction.map((value) => value / length));
  }

  const rest = [...gap];
  for (const already of basis) {
    const along = already.reduce((total, value, index) => total + value * rest[index], 0);
    for (let index = 0; index < rest.length; index++) rest[index] -= along * already[index];
  }
  return Math.hypot(...rest);
}

/**
 * The freedoms these rows leave: a basis for everything they do not forbid.
 *
 * Gaussian elimination with a pivot chosen for size, then one vector per column
 * no pivot landed in. The tolerance is relative to the largest entry seen, so
 * it means the same thing on a drawing measured in meters and one measured in
 * model units.
 */
function nullSpace(rows: number[][], width: number): number[][] {
  const matrix = rows.map((row) => [...row]);
  let largest = 0;
  for (const row of matrix) for (const value of row) largest = Math.max(largest, Math.abs(value));
  if (largest === 0) return identity(width);
  const tolerance = largest * 1e-9;

  const pivotColumn: number[] = [];
  let rank = 0;
  for (let col = 0; col < width && rank < matrix.length; col++) {
    let best = rank;
    for (let candidate = rank + 1; candidate < matrix.length; candidate++) {
      if (Math.abs(matrix[candidate][col]) > Math.abs(matrix[best][col])) best = candidate;
    }
    if (Math.abs(matrix[best][col]) <= tolerance) continue;
    [matrix[rank], matrix[best]] = [matrix[best], matrix[rank]];
    const head = matrix[rank];
    const lead = head[col];
    for (let k = 0; k < width; k++) head[k] /= lead;
    for (let other = 0; other < matrix.length; other++) {
      if (other === rank) continue;
      const factor = matrix[other][col];
      if (factor === 0) continue;
      for (let k = 0; k < width; k++) matrix[other][k] -= factor * head[k];
    }
    pivotColumn.push(col);
    rank++;
  }

  const pinned = new Set(pivotColumn);
  const basis: number[][] = [];
  for (let col = 0; col < width; col++) {
    if (pinned.has(col)) continue;
    const vector = new Array<number>(width).fill(0);
    vector[col] = 1;
    pivotColumn.forEach((pinnedCol, row) => {
      vector[pinnedCol] = -matrix[row][col];
    });
    basis.push(vector);
  }
  return basis;
}

function identity(width: number): number[][] {
  return Array.from({ length: width }, (_, index) => {
    const vector = new Array<number>(width).fill(0);
    vector[index] = 1;
    return vector;
  });
}
