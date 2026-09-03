import { Joint, PrisJoint, RealJoint } from '../joint';
import { GROUND_BODY, angleReference, resolveActuator } from '../actuator';

/**
 * Where a machine's cycle starts, kept as a bookmark the design owns.
 *
 * The alternative is "the drawing is what you see": pause mid-cycle, nudge a
 * joint, and the pose you happen to be looking at silently becomes t = 0. That
 * is the ratchet the whole mode boundary was built against -- stop playback and
 * you are somewhere new, share the URL and it opens somewhere new, and for a
 * tool whose users hand these links in as homework it reads as the app slowly
 * losing their work.
 *
 * So each machine keeps an anchor, and an edit made at a displaced pose changes
 * the geometry and then re-derives the start pose of the *new* geometry at the
 * anchored input value.
 *
 * Three things make it up, and each earns its place:
 *
 * - **which joint is driven**, so an anchor cannot be read against a different
 *   input than the one it was taken from;
 * - **the driven coordinate**, measured absolutely and *stored*. Re-deriving it
 *   from the samples each time would move the start a fraction of a sample per
 *   edit, and nothing about any single edit would look wrong;
 * - **a branch seed** -- where every owned joint stood at t = 0. At a toggle
 *   point two legs of the cycle share coordinates and differ only in which way
 *   the linkage is folded, so a coordinate alone cannot say which one t = 0 was
 *   on.
 *
 * The seed is a *reference*, never re-applied as coordinates. After a geometry
 * edit the correct pose at the same input value has different coordinates by
 * construction, so writing the old ones back would either erase the edit or
 * bend the links.
 */
export interface MachineAnchor {
  /** The driven joint, by id. */
  readonly jointId: string;
  /**
   * The owned joints, sorted and joined.
   *
   * `partitionKey` is the lowest owned moving-joint id, which survives
   * reordering and deletion but says nothing about lineage: fuse two machines
   * and the union usually inherits one parent's key. A held clock tolerates
   * that -- worst case a wrong resume point -- but an inherited anchor is a
   * corrupted design, so this is the whole set and any change to it invalidates.
   */
  readonly topology: string;
  readonly kind: 'angle' | 'length';
  /** The driven quantity at t = 0: radians for a pin, model units for a slide. */
  readonly coordinate: number;
  /**
   * Which way the coordinate was going at t = 0.
   *
   * A reversing input passes every value in its range twice -- once on the way
   * out and once on the way back -- and at a toggle point the two legs share
   * coordinates outright. Direction separates them before shape has to.
   */
  readonly heading: 1 | -1;
  /**
   * How the coordinate is measured, kept whole.
   *
   * This used to be two of the rule's fields copied out by hand, and the two it
   * copied were the ones a grounded crank needs. Everything a *floating*
   * actuator needs -- the body its freedom is measured against, the carrier a
   * moving slot is cut into -- was dropped on the way in and invented again on
   * the way out, so those machines were read against a different quantity than
   * the one their anchor was taken in and reported their own start unreachable.
   */
  readonly rule: CoordinateRule;
  /** Every owned joint's t = 0 position, for telling one leg from the other. */
  readonly seed: ReadonlyMap<string, { x: number; y: number }>;
}

/** The owned-joint set as one comparable string. */
export function topologyOf(ownJoints: Joint[]): string {
  return ownJoints
    .map((joint) => joint.id)
    .sort()
    .join(',');
}

/**
 * How the driven quantity is measured, decided once from the drawing.
 *
 * Absolutely, in world terms, rather than relative to sample 0 the way
 * `drive-profile` measures it. A profile answers "how far round the track is
 * the handle", which is a question about one cycle; an anchor has to survive
 * the cycle being re-solved from different geometry, so it needs a quantity
 * whose meaning does not come from the samples it was taken in.
 */
export interface CoordinateRule {
  readonly jointId: string;
  readonly kind: 'angle' | 'length';
  /** A joint on the driven body, giving the direction that body points. */
  readonly referenceId?: string;
  /**
   * A joint on the body the freedom is measured *against*, where that body is
   * not the world.
   *
   * A grounded crank's angle can be read straight off the world, and this did
   * exactly that for every actuator at first. A *floating* pin is the case that
   * breaks it: neither body is the world, and what the input prescribes is the
   * angle between them -- so a world bearing there moves when the other body
   * moves, and the anchor names a quantity the drive does not control.
   */
  readonly againstId?: string;
  /** The unit direction the travel is measured along, for a fixed slot. */
  readonly axis?: { readonly x: number; readonly y: number };
  /**
   * Two joints on the carrier a floating slot is cut into.
   *
   * The slot's direction is fixed in the *carrier*, not in the world, so the
   * axis is re-read from the carrier in every pose rather than stored: stored
   * as a world vector it would rotate out from under the anchor the moment the
   * carrier turned.
   */
  readonly carrierIds?: readonly [string, string];
}

/** How to measure this machine's input, or nothing when it has no drivable one. */
export function coordinateRuleFor(joint: Joint): CoordinateRule | undefined {
  const actuator = resolveActuator(joint);
  if (!actuator) return undefined;
  const driven = actuator.joint;
  if (actuator.kind === 'angle') {
    // The driven body's own direction, read from the joint. Ground has no
    // second point to measure to and is never the driven body here, because
    // `incidentBodies` puts it first and `describeActuator` takes the second.
    const reference =
      actuator.drivenBody === GROUND_BODY ? undefined : angleReference(actuator.drivenBody, driven);
    if (!reference) return undefined;
    // And the body it is measured *against*, when that is not the world. An
    // input prescribes a relative freedom between two bodies; against ground
    // the world's own axis stands in for the second, and against a moving
    // carrier nothing does.
    const against =
      actuator.referenceBody === GROUND_BODY
        ? undefined
        : angleReference(actuator.referenceBody, driven);
    return { jointId: driven.id, kind: 'angle', referenceId: reference.id, againstId: against?.id };
  }
  if (!(driven instanceof PrisJoint)) return undefined;
  const carrier = driven.carrier;
  if (carrier) {
    const ends = carrier.joints.filter((member) => member.id !== driven.id);
    if (ends.length >= 2) {
      return { jointId: driven.id, kind: 'length', carrierIds: [ends[0].id, ends[1].id] };
    }
  }
  const axis = slotAxis(driven);
  return axis ? { jointId: driven.id, kind: 'length', axis } : undefined;
}

/** The unit vector a prismatic joint slides along, from its own stored angle. */
function slotAxis(joint: RealJoint): { x: number; y: number } | undefined {
  if (!(joint instanceof PrisJoint)) return undefined;
  const angle = joint.angle_rad;
  if (!Number.isFinite(angle)) return undefined;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/**
 * The driven quantity in one pose, or nothing when the pose does not carry it.
 *
 * `where` is any frame -- the editable joints, or one solved sample -- as a
 * lookup from id to a position. Positions only: a solved frame's joints are
 * copies, and asking them about links and grounds again would be asking a
 * second time a question the rule already answered.
 */
export function coordinateIn(
  rule: CoordinateRule,
  where: (id: string) => { x: number; y: number } | undefined
): number | undefined {
  const at = where(rule.jointId);
  if (!at) return undefined;
  if (rule.kind === 'angle') {
    const reference = rule.referenceId ? where(rule.referenceId) : undefined;
    if (!reference) return undefined;
    const driven = Math.atan2(reference.y - at.y, reference.x - at.x);
    if (!rule.againstId) return driven;
    // Relative, where the other body is not the world: the angle the input
    // actually prescribes, which a world bearing only equals while the body it
    // is measured against holds still.
    const against = where(rule.againstId);
    if (!against) return undefined;
    return driven - Math.atan2(against.y - at.y, against.x - at.x);
  }
  if (rule.carrierIds) {
    const from = where(rule.carrierIds[0]);
    const to = where(rule.carrierIds[1]);
    if (!from || !to) return undefined;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (!(length > 0)) return undefined;
    // How far along its carrier the block has slid, measured from the carrier's
    // own end in the carrier's own direction -- a quantity a moving carrier
    // cannot change, where a world projection is one it can.
    return ((at.x - from.x) * (to.x - from.x) + (at.y - from.y) * (to.y - from.y)) / length;
  }
  const axis = rule.axis;
  return axis ? at.x * axis.x + at.y * axis.y : undefined;
}

/**
 * The driven quantity at every sample, unwrapped where it is an angle.
 *
 * Unwrapped so that a crank going round twice reads as twice as far rather than
 * as back where it started -- the same reason `drive-profile` unwraps -- and so
 * that "is the anchor inside this cycle's range" is a question about an
 * interval rather than about a circle with a seam in it.
 */
export function coordinatesAcross(rule: CoordinateRule, frames: Joint[][]): (number | undefined)[] {
  const raw = frames.map((frame) => {
    const index = new Map(frame.map((joint) => [joint.id, joint]));
    return coordinateIn(rule, (id) => index.get(id));
  });
  if (rule.kind !== 'angle') return raw;
  let previous: number | undefined;
  let turns = 0;
  return raw.map((value) => {
    if (value === undefined) return undefined;
    if (previous !== undefined) {
      const step = value + turns * TWO_PI - previous;
      if (step > Math.PI) turns -= 1;
      else if (step < -Math.PI) turns += 1;
    }
    const unwrapped = value + turns * TWO_PI;
    previous = unwrapped;
    return unwrapped;
  });
}

const TWO_PI = Math.PI * 2;

/**
 * How far outside a sample interval, as a fraction of it, a coordinate may
 * fall and still count as on the sample.
 *
 * A hundredth: a hundredth of a degree for a crank. The pose a re-anchor
 * puts at sample 0 is interpolated between two solved samples, and a point
 * part-way along a chord is not at the part-way angle -- the coordinate read
 * back off it is off by up to a few thousandths of a degree, which is
 * invisible on screen and well inside this.
 */
const REACH_SLACK = 1e-2;

/** Where an anchored coordinate sits in a cycle, as a fractional sample index. */
export interface AnchorReach {
  /** The sample below it, and how far past that sample it lies. */
  readonly index: number;
  readonly blend: number;
  /** Which way the coordinate was going at that point. */
  readonly heading: 1 | -1;
}

/**
 * Find the anchored coordinate in a cycle, on the leg the anchor was taken on.
 *
 * A lookup, not a solve. Every pointer move of a posed drag already produces a
 * provisional cycle, so asking whether the anchor is still inside it costs a
 * walk of an array the preview has already paid for -- which is what lets the
 * ghost warn *during* the gesture rather than a snackbar explaining afterwards.
 *
 * The candidates are the crossings of the coordinate between consecutive
 * samples. Where several cross -- a rocker passes every value twice a cycle,
 * and a toggle-adjacent pose has two legs sharing coordinates -- the seed
 * decides: the winner is the crossing whose pose is nearest the one t = 0 was
 * last known to be in. Heading is a tiebreak before that, because the two legs
 * of a reversing cycle differ in direction before they differ in shape.
 */
export function reachAnchor(
  coordinates: (number | undefined)[],
  anchor: Pick<MachineAnchor, 'coordinate' | 'heading' | 'kind' | 'seed'>,
  frames: Joint[][],
  /** Whether the whole-turn retry below has already been spent on this call. */
  wrapped = false
): AnchorReach | null {
  const crossings: AnchorReach[] = [];
  for (let i = 0; i + 1 < coordinates.length; i++) {
    const from = coordinates[i];
    const to = coordinates[i + 1];
    if (from === undefined || to === undefined) continue;
    const span = to - from;
    if (Math.abs(span) < 1e-12) {
      if (Math.abs(from - anchor.coordinate) < 1e-9) {
        crossings.push({ index: i, blend: 0, heading: anchor.heading });
      }
      continue;
    }
    const blend = (anchor.coordinate - from) / span;
    // With a hair of slack at either end. The coordinate was read off one
    // cycle's sample 0 and is being looked for in the next cycle's, and the
    // two differ in the last decimals: positions are rounded per sample and
    // the angle is recomputed from them. Exactly on a sample and a hair
    // outside its interval, a crank's start was declared unreachable -- so
    // the ghost drew the last pose it could reach, a third of a turn from
    // where the transport said the start was.
    if (blend < -REACH_SLACK || blend > 1 + REACH_SLACK) continue;
    crossings.push({
      index: i,
      blend: Math.min(1, Math.max(0, blend)),
      heading: span > 0 ? 1 : -1,
    });
  }
  if (crossings.length === 0) {
    // An angle repeats every turn, so a coordinate a whole number of turns away
    // is the same crank position and the cycle does reach it. Tried only after
    // the direct search, so a cycle that holds the value outright never has to
    // reason about turns at all.
    //
    // Once only. `wrapNear` returns the coordinate unchanged whenever no whole
    // number of turns brings it into range -- including the case where the
    // cycle has no usable coordinates at all -- and retrying on an unchanged
    // value recurses until the stack runs out. A drag that broke the linkage
    // outright reached exactly that, and the crash looked like a solver fault.
    if (anchor.kind !== 'angle' || wrapped) return null;
    const near = wrapNear(anchor.coordinate, coordinates);
    if (near === anchor.coordinate) return null;
    return reachAnchor(coordinates, { ...anchor, coordinate: near }, frames, true);
  }
  const sameWay = crossings.filter((crossing) => crossing.heading === anchor.heading);
  const shortlist = sameWay.length > 0 ? sameWay : crossings;
  return shortlist.reduce((best, candidate) =>
    seedDistance(candidate, frames, anchor.seed) < seedDistance(best, frames, anchor.seed)
      ? candidate
      : best
  );
}

/**
 * The same crank position, expressed inside this cycle's own range.
 *
 * Returns the coordinate unchanged when no whole number of turns brings it into
 * range, which leaves the caller's second search to fail exactly as the first
 * one did.
 */
function wrapNear(coordinate: number, coordinates: (number | undefined)[]): number {
  const known = coordinates.filter((value): value is number => value !== undefined);
  if (known.length === 0) return coordinate;
  const low = Math.min(...known);
  const high = Math.max(...known);
  // Into the range rather than towards the middle of it. A cycle that covers a
  // full revolution runs from c to c + 2pi, and an anchor stored one turn on
  // sits a hair past the far end -- near enough the middle to fail a
  // round-to-nearest and be refused, which would move the start of any machine
  // whose cycle happens to be written on the other side of the seam.
  if (coordinate < low) return coordinate + Math.ceil((low - coordinate) / TWO_PI) * TWO_PI;
  if (coordinate > high) return coordinate - Math.ceil((coordinate - high) / TWO_PI) * TWO_PI;
  return coordinate;
}

/** How far this crossing's pose is from the pose t = 0 was last known to hold. */
function seedDistance(
  reach: AnchorReach,
  frames: Joint[][],
  seed: ReadonlyMap<string, { x: number; y: number }>
): number {
  const from = frames[reach.index];
  const to = frames[Math.min(reach.index + 1, frames.length - 1)];
  if (!from || !to) return Number.POSITIVE_INFINITY;
  let total = 0;
  let counted = 0;
  const next = new Map(to.map((joint) => [joint.id, joint]));
  from.forEach((joint) => {
    const want = seed.get(joint.id);
    const ahead = next.get(joint.id);
    if (!want || !ahead) return;
    const x = joint.x + (ahead.x - joint.x) * reach.blend;
    const y = joint.y + (ahead.y - joint.y) * reach.blend;
    total += Math.hypot(x - want.x, y - want.y);
    counted++;
  });
  // No joint in common with the seed is not "a perfect match"; it is no
  // evidence at all, and must not win a comparison against a real one.
  return counted === 0 ? Number.POSITIVE_INFINITY : total / counted;
}

/**
 * Where in this cycle a given pose occurs -- without being told which way the
 * input was travelling through it.
 *
 * `reachAnchor` is asked about a pose whose leg is already known, because an
 * anchor and a commit both record the heading they were taken at. This one is
 * asked about a pose that has just been re-measured against a *different* rule
 * -- the input moved to another joint -- and a heading in the old
 * parameterization says nothing about the new one. Guessing it is worse than
 * having none: `reachAnchor` prefers crossings that match, so a wrong guess is
 * actively steered towards the wrong leg.
 *
 * So both legs are searched and the pose itself decides between them, which is
 * the tiebreak `reachAnchor` already falls back on.
 */
export function findPose(
  coordinates: (number | undefined)[],
  where: {
    readonly coordinate: number;
    readonly kind: 'angle' | 'length';
    readonly seed: ReadonlyMap<string, { x: number; y: number }>;
  },
  frames: Joint[][]
): AnchorReach | null {
  const found = ([1, -1] as const)
    .map((heading) => reachAnchor(coordinates, { ...where, heading }, frames))
    .filter((reach): reach is AnchorReach => reach !== null);
  if (found.length === 0) return null;
  return found.reduce((best, one) =>
    seedDistance(one, frames, where.seed) < seedDistance(best, frames, where.seed) ? one : best
  );
}

/**
 * Where a machine was when a posed edit was committed.
 *
 * The same three things an anchor carries, and for the same reason: putting the
 * display back where the reader's hand was is the identical lookup as finding
 * the anchor, and a coordinate alone names two poses on a reversing cycle.
 */
export interface CommitPose {
  readonly coordinate: number;
  readonly heading: 1 | -1;
  readonly seed: ReadonlyMap<string, { x: number; y: number }>;
}

/**
 * A machine's start pose, drawn as a skeleton under the mechanism.
 *
 * Bars rather than the solid outlines the real linkage wears: two solid
 * linkages on one grid compete for the reader's attention, and only one of them
 * is the thing being edited.
 */
/** One of the ghost's link shapes: the real outline, carried to the start pose. */
export interface GhostBody {
  /** The link's own path, exactly as the canvas draws it now. */
  readonly d: string;
  readonly fill: string;
  /** Where that path goes: a rigid move from the drawn pose to the start one. */
  readonly transform: string;
}

export interface StartPoseGhost {
  /** Which machine, so the canvas can tie it to a transport row. */
  readonly index: number;
  /** Which sample the start pose falls on, for the arc a drag traces from it. */
  readonly at: number;
  /**
   * The real linkage, carried back to where it starts.
   *
   * It used to be a skeleton -- every pair of a link's joints as a line, so a
   * plate drew as its outline plus its diagonals. That reads as a diagram of
   * the linkage rather than as the linkage: a plate is a plate, and the
   * diagonals were a second thing to explain. Behind the mechanism at 22% it is
   * plainly the same object, earlier.
   */
  readonly bodies: readonly GhostBody[];
  /** Kept for the press target and the tag: a plate's outline is hard to aim at. */
  readonly bars: readonly { x1: number; y1: number; x2: number; y2: number }[];
  readonly pins: readonly { x: number; y: number }[];
  /**
   * Whether the geometry as it stands can still start here.
   *
   * False turns the ghost amber: the drag has taken the linkage somewhere its
   * original start no longer exists -- a crank lengthened until it is a rocker
   * -- and letting go now will move the start. Dragging back recovers it, which
   * is a better answer than a message explaining what already happened.
   */
  readonly reachable: boolean;
}

/**
 * One frame of a cycle, part way between two samples.
 *
 * The same interpolation `applyMechanismPose` does, in the terms the anchor
 * lookup answers in -- so the pose the ghost draws is exactly the pose the
 * commit would land on.
 */
export function blendFrame(
  frames: Joint[][],
  index: number,
  blend: number
): { id: string; x: number; y: number }[] {
  const from = frames[index];
  const to = frames[Math.min(index + 1, frames.length - 1)];
  if (!from) return [];
  const ahead = new Map(to.map((joint) => [joint.id, joint]));
  return from.map((joint) => {
    const next = ahead.get(joint.id) ?? joint;
    return {
      id: joint.id,
      x: joint.x + (next.x - joint.x) * blend,
      y: joint.y + (next.y - joint.y) * blend,
    };
  });
}
