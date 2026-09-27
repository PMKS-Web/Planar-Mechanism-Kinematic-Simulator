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
  const frame = coordinateFrame(joints, links, assignment);
  if (!frame) return undefined;
  const { constraints, rows, reach, width } = frame;
  const free = nullSpace(rows, width);
  if (free.length === 0) return 0;

  const oneByOne = free.filter((direction) =>
    survivesSecondOrder(direction, constraints, rows, reach, width)
  ).length;
  // Never fewer than the basis vectors that survive on their own, which is
  // what the one-at-a-time question answers where it answers at all; the
  // subspace question is what finds a motion the elimination happened to
  // hand back mixed with a tangency.
  return Math.max(oneByOne, survivingSubspace(free, constraints, rows, reach, width));
}

/** The drawing written as coordinates, rows and a size: everything below reads it. */
interface CoordinateFrame {
  constraints: Constraint[];
  rows: number[][];
  width: number;
  reach: number;
  bodyAt: (body: string) => Body;
  assignment: BodyAssignment;
}

/**
 * The drawing as a vector of body coordinates, with the rows its joints write.
 *
 * Split out because two questions are asked of the same arithmetic: how many
 * freedoms there are, and -- for `heldCylinderSeals` -- which of them a
 * particular slide moves in. Building it twice would be two chances for the two
 * answers to be about different drawings.
 */
function coordinateFrame(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment
): CoordinateFrame | undefined {
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

  return {
    constraints,
    rows: constraints.flatMap((one) => rowsFor(one, width)),
    width,
    reach: reachOf(links),
    bodyAt,
    assignment,
  };
}

/**
 * What a drawing's freedoms are, and what a given slide does in each of them.
 *
 * The same Jacobian mobility is counted from, opened up for the one other
 * question anybody asks of it: with the input held still, can this slide still
 * move? That is a null-space question and nothing else -- a row is added for
 * the driven coordinate, the remaining freedoms are taken, and each slide's
 * travel is read off them. Deciding it any other way would be a second opinion
 * about the same geometry (decision S28).
 */
export interface FreedomFrame {
  /** How far the drawing reaches, which every tolerance here is a fraction of. */
  readonly reach: number;
  /** A basis for the motions the rows allow, each scaled to a step of that size. */
  freedoms(extraRows?: readonly number[][]): number[][];
  /** The row that holds this slide's travel still, or nothing if it has no slot. */
  slideRow(joint: PrisJoint): number[] | undefined;
  /** The row that holds a body's turn still, measured against another body. */
  turnRow(driven: string, reference?: string): number[] | undefined;
  /** How far this slide's rider travels along its slot under a displacement. */
  slideAlong(row: readonly number[], displacement: readonly number[]): number;
}

/** The drawing's freedoms, ready to be asked what each of them moves. */
export function freedomFrameOf(
  joints: Joint[],
  links: Link[],
  assignment: BodyAssignment
): FreedomFrame | undefined {
  const frame = coordinateFrame(joints, links, assignment);
  if (!frame) return undefined;
  const { rows, width, reach, bodyAt, constraints } = frame;
  const blank = () => new Array<number>(width).fill(0);

  return {
    reach,
    freedoms(extraRows: readonly number[][] = []): number[][] {
      return nullSpace([...rows, ...extraRows], width)
        .map((direction) => scaledStep(direction, constraints, reach))
        .filter((step): step is number[] => step !== undefined);
    },
    slideRow(joint: PrisJoint): number[] | undefined {
      const pair = slidePair(joint, frame.assignment, bodyAt);
      if (!pair) return undefined;
      // The same row the slot's own constraint writes, turned a quarter turn:
      // that one forbids leaving the slot, this one measures going along it.
      const alongX = Math.cos(pair.angle);
      const alongY = Math.sin(pair.angle);
      const row = blank();
      for (const [body, sign] of [
        [pair.rider, 1],
        [pair.carrier, -1],
      ] as const) {
        if (body.at === undefined) continue;
        const rx = joint.x - body.pivot.x;
        const ry = joint.y - body.pivot.y;
        row[body.at] += sign * alongX;
        row[body.at + 1] += sign * alongY;
        row[body.at + 2] += sign * (alongY * rx - alongX * ry);
      }
      return row;
    },
    turnRow(driven: string, reference?: string): number[] | undefined {
      const on = bodyAt(driven);
      const against = reference === undefined ? undefined : bodyAt(reference);
      // A drive against the world holds the one body's turn; a drive between
      // two moving bodies holds the difference, which is what it prescribes.
      if (on.at === undefined && against?.at === undefined) return undefined;
      const row = blank();
      if (on.at !== undefined) row[on.at + 2] += 1;
      if (against?.at !== undefined) row[against.at + 2] -= 1;
      return row;
    },
    slideAlong(row: readonly number[], displacement: readonly number[]): number {
      return row.reduce((total, value, index) => total + value * displacement[index], 0);
    },
  };
}

/**
 * How many of the freedoms survive together, when none survives alone.
 *
 * The elimination hands back *a* basis of the freedoms, not the natural one.
 * A parallelogram drawn with its cranks lying along the coupler has two
 * first-order freedoms -- translate the coupler, and turn it -- and only the
 * translation goes anywhere. Handed back as translate-plus-turn and
 * translate-minus-turn, each dies at second order on its own and the count
 * came out zero for a linkage that runs.
 *
 * The second-order gap is a quadratic in the freedom taken, so the part of it
 * no correction can close is a vector-valued quadratic q on the freedoms, and
 * a motion the linkage can take is a direction q vanishes on. Those need not
 * be basis directions, so each pair of basis vectors is searched round its
 * plane for a root; the directions found, with any basis vector that survives
 * alone, are then asked how many of them go together -- the largest subspace
 * the bilinear form of q vanishes on, which is its radical restricted to them.
 * The form is recovered from the gaps by polarization.
 */
function survivingSubspace(
  free: number[][],
  constraints: Constraint[],
  rows: number[][],
  reach: number,
  width: number
): number {
  const steps = free.map((direction) => scaledStep(direction, constraints, reach));
  if (steps.some((step) => step === undefined)) return 0;
  const count = steps.length;
  const gapOf = (d: number[]): number[] =>
    constraints.flatMap((constraint) => residual(constraint, d));
  const leftOver = (d: number[]): number[] => outsideRangeVector(gapOf(d), rows, width);
  const norm = (v: number[]): number => Math.hypot(...v);

  // The rule the one-at-a-time test applies, kept: a leftover under a
  // thousandth of the gap it came from is a closable gap, and one under the
  // arithmetic's own noise is nothing at all.
  let scale = reach * 1e-12;
  const self = steps.map((step) => leftOver(step!));
  const pair: number[][][] = steps.map(() => []);
  for (let i = 0; i < count; i++) {
    scale = Math.max(scale, norm(gapOf(steps[i]!)) * 1e-3);
    pair[i][i] = self[i];
    for (let j = i + 1; j < count; j++) {
      const both = sum(steps[i]!, steps[j]!);
      scale = Math.max(scale, norm(gapOf(both)) * 1e-3);
      const mixed = leftOver(both).map((value, k) => (value - self[i][k] - self[j][k]) / 2);
      pair[i][j] = mixed;
      pair[j][i] = mixed;
    }
  }
  // The form on any two directions, by bilinearity over the basis.
  const form = (a: number[], b: number[]): number[] => {
    const out = new Array<number>(self[0]?.length ?? 0).fill(0);
    for (let i = 0; i < count; i++) {
      if (a[i] === 0) continue;
      for (let j = 0; j < count; j++) {
        if (b[j] === 0) continue;
        const v = pair[i][j];
        for (let k = 0; k < out.length; k++) out[k] += a[i] * b[j] * v[k];
      }
    }
    return out;
  };
  const vanishes = (v: number[]): boolean => norm(v) <= scale;
  // Whether a direction, taken as the displacement it is, actually goes: the
  // one-at-a-time rule applied to it directly, rather than to the polarized
  // form, whose rounding a near-root can hide under.
  const goes = (c: number[]): boolean => {
    const d = new Array<number>(width).fill(0);
    for (let i = 0; i < count; i++) {
      if (c[i] === 0) continue;
      const step = steps[i]!;
      for (let k = 0; k < width; k++) d[k] += c[i] * step[k];
    }
    const size = norm(gapOf(d));
    if (size <= reach * 1e-12) return true;
    return norm(leftOver(d)) <= size * 1e-3;
  };

  // Directions q vanishes on: basis vectors on their own, and roots in each
  // pair's plane, found by scanning the half-turn and refining the best.
  const found: number[][] = [];
  const unit = (i: number): number[] => {
    const c = new Array<number>(count).fill(0);
    c[i] = 1;
    return c;
  };
  for (let i = 0; i < count; i++) if (goes(unit(i))) found.push(unit(i));
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const at = (theta: number): number[] => {
        const c = new Array<number>(count).fill(0);
        c[i] = Math.cos(theta);
        c[j] = Math.sin(theta);
        return c;
      };
      const size = (theta: number): number => norm(form(at(theta), at(theta)));
      let best = 0;
      let bestSize = Infinity;
      let worstSize = 0;
      for (let step = 0; step < 180; step++) {
        const theta = (step * Math.PI) / 180;
        const value = size(theta);
        if (value < bestSize) {
          bestSize = value;
          best = theta;
        }
        worstSize = Math.max(worstSize, value);
      }
      let low = best - Math.PI / 180;
      let high = best + Math.PI / 180;
      for (let pass = 0; pass < 40; pass++) {
        const a = low + (high - low) * 0.382;
        const b = low + (high - low) * 0.618;
        if (size(a) < size(b)) high = b;
        else low = a;
      }
      const root = (low + high) / 2;
      const c = at(root);
      // A root is where the form actually vanishes on this circle -- small
      // against the most it reaches anywhere on it -- and not merely where
      // it is small against the gap: a direction that is nearly all of a
      // genuine motion with a hair of a dying one has a leftover of the
      // hair's square under a gap of the motion's size, and the relative
      // test alone let every such direction through, which counted a jaw
      // held by two rails as free to tilt. A root that is one of the basis
      // directions was already counted; any other has to go as a
      // displacement in its own right as well.
      const vanishesOnCircle = size(root) <= Math.max(scale, worstSize * 1e-3);
      if (vanishesOnCircle && Math.abs(c[i]) > 1e-9 && Math.abs(c[j]) > 1e-9 && goes(c)) {
        found.push(c);
      }
    }
  }
  if (found.length === 0) return 0;

  // How many of the found directions go together: the radical of the form
  // restricted to them. c is in it when Σ_p c_p B(f_p, f_q) = 0 for every q.
  const system: number[][] = [];
  const length = self[0]?.length ?? 0;
  for (let q = 0; q < found.length; q++) {
    const columns = found.map((f) => {
      const v = form(f, found[q]);
      return vanishes(v) ? v.map(() => 0) : v;
    });
    for (let k = 0; k < length; k++) {
      const row = columns.map((v) => v[k]);
      if (row.some((value) => value !== 0)) system.push(row);
    }
  }
  const together = system.length === 0 ? found.length : nullSpace(system, found.length).length;
  return Math.min(count, Math.max(1, together));
}

function sum(a: number[], b: number[]): number[] {
  return a.map((value, index) => value + b[index]);
}

/**
 * A freedom scaled so the step moves the drawing by a thousandth of its own
 * size, whatever units it is drawn in and however the freedom mixes turning
 * with sliding; undefined for a direction that moves nothing.
 */
function scaledStep(
  direction: number[],
  constraints: Constraint[],
  reach: number
): number[] | undefined {
  let worst = 0;
  for (const constraint of constraints) {
    const bodies =
      constraint.kind === 'pin'
        ? [constraint.a, constraint.b]
        : [constraint.rider, constraint.carrier];
    for (const body of bodies) {
      if (body.at === undefined) continue;
      const armX = constraint.at.x - body.pivot.x;
      const armY = constraint.at.y - body.pivot.y;
      const spin = Math.abs(direction[body.at + 2]) * Math.hypot(armX, armY);
      worst = Math.max(worst, Math.hypot(direction[body.at], direction[body.at + 1]) + spin);
    }
  }
  if (worst === 0) return undefined;
  const step = (reach * 1e-3) / worst;
  return direction.map((value) => value * step);
}

/** A body's place in the coordinate vector; `at` undefined is the world, which is fixed. */
interface Body {
  at: number | undefined;
  pivot: { x: number; y: number };
}

type Constraint =
  | { kind: 'pin'; at: { x: number; y: number }; a: Body; b: Body }
  | {
      kind: 'slide';
      at: { x: number; y: number };
      /**
       * The body that rides the slot. It used to be the zero-length block, and
       * is the rider itself now that a slider is one joint -- which is also why
       * it is always a body that exists: the block was a body only because it
       * was a link, and a joint could not carry a rotation column.
       */
      rider: Body;
      carrier: Body;
      angle: number;
      /**
       * Whether the rider may turn against the slot: a Pin-in-slot may, a Slide
       * may not. It decides whether this joint writes one row or two, which is
       * the whole difference between a two-freedom joint and a one-freedom one.
       */
      rotates: boolean;
    };

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
 * A pin says two bodies' copies of one point move together, and says nothing
 * about turning: one freedom, two rows. A slider says its rider may not leave
 * the slot, and -- only if it is a Slide -- may not turn in it either. So a
 * Slide is a one-freedom joint and writes two rows like a pin, while a
 * Pin-in-slot keeps two freedoms and writes one. That is the same split
 * Gruebler's count makes between a full joint and a half one.
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
      const pair = slidePair(joint, assignment, bodyAt);
      if (pair) {
        constraints.push({
          kind: 'slide',
          at,
          rider: pair.rider,
          carrier: pair.carrier,
          angle: pair.angle,
          rotates: joint.rotates,
        });
        // Anything else riding here is pinned to the first rider, and the count
        // stays the k-1 pairings Gruebler charges for.
        for (const other of pair.alsoHere) {
          constraints.push({ kind: 'pin', at, a: pair.rider, b: bodyAt(other) });
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

/**
 * The two sides of a sliding joint, and the direction of the slot between them.
 *
 * The slot belongs to whatever it is cut into: the world for a fixed guide, the
 * carrier for a floating one. Whatever else meets there rides it.
 *
 * The slot's direction is read as it *is*, not from the angle stored on the
 * joint: a floating slot's direction lives in the two joints it is cut between,
 * and the stored angle is only what a grounded guide keeps. Read the stored one
 * and a slanted slot in a lever counts as a horizontal one, which let a pin ride
 * straight through the side of its slot and reported a freedom the drawing does
 * not have.
 */
function slidePair(
  joint: PrisJoint,
  assignment: BodyAssignment,
  bodyAt: (body: string) => Body
): { rider: Body; carrier: Body; angle: number; alsoHere: string[] } | undefined {
  const meeting = [...assignment.bodiesAt(joint)];
  if (meeting.length < 2) return undefined;
  const carrierBody = joint.ground
    ? WORLD
    : joint.carrier
      ? assignment.bodyOf(joint.carrier)
      : undefined;
  if (carrierBody === undefined) return undefined;
  const rest = meeting.filter((body) => body !== carrierBody);
  if (rest.length === 0) return undefined;
  const [rider, ...alsoHere] = rest;
  return {
    rider: bodyAt(rider),
    carrier: bodyAt(carrierBody),
    angle: joint.slotAngle,
    alsoHere,
  };
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
    [constraint.rider, 1],
    [constraint.carrier, -1],
  ] as const) {
    if (body.at === undefined) continue;
    const r = arm(body, constraint.at);
    across[body.at] += sign * normalX;
    across[body.at + 1] += sign * normalY;
    across[body.at + 2] += sign * (normalY * r.x - normalX * r.y);
    turning[body.at + 2] += sign;
  }
  // A Pin-in-slot forbids leaving the slot and nothing else. Writing the
  // turning row for it as well would charge it as a one-freedom joint, which
  // is what the block used to absorb: the block could not turn, and the rider
  // got its freedom back through the pin they shared. With the block gone there
  // is no second joint to give it back, so the row has to go instead.
  return constraint.rotates ? [across] : [across, turning];
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
  const rider = moved(constraint.rider, constraint.at, d);
  const carrier = moved(constraint.carrier, constraint.at, d);
  const riderTurn = constraint.rider.at === undefined ? 0 : d[constraint.rider.at + 2];
  const across = normalX * (rider.x - carrier.x) + normalY * (rider.y - carrier.y);
  // One entry per row `rowsFor` wrote, or the second-order test reads a
  // Pin-in-slot's gap against a Slide's Jacobian and compares vectors of
  // different lengths -- which comes back as a freedom that dies for no reason.
  return constraint.rotates ? [across] : [across, riderTurn - carrierTurn];
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
        : [constraint.rider, constraint.carrier];
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
  return Math.hypot(...outsideRangeVector(gap, rows, width));
}

/** The part of a gap outside the Jacobian's range, as the vector it is. */
function outsideRangeVector(gap: number[], rows: number[][], width: number): number[] {
  const size = Math.hypot(...gap);
  if (size === 0) return gap.map(() => 0);
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
  return rest;
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
