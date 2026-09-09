import { MechanismFixture } from './fixture';
import { cylinderBetween } from './slot-fixtures';

/**
 * Mechanisms whose cylinder mounts are welded, or riding slots, or both.
 *
 * These are the drawings the coupled route exists for: the walk has no
 * primitive that can place a ram attached at a mount, so a partition holding
 * one goes to the constraint set whole. Every fixture here is a shape the app
 * itself refuses to build today -- the ban comes off in step 5 of
 * `docs/cylinder-mount-joints-plan.md` -- and each is chosen so its whole
 * motion can be written down in closed form and checked against, rather than
 * compared with another run of the same solver.
 *
 * `scale` is not optional in practice. A cylinder's stroke is bounded by its
 * own slot, and a slot is drawn in marks -- absolute internal model units --
 * so these have to be built in that world. The layout is computed in user
 * units first, where one objectScale is one unit and the mark radius is 0.15,
 * and scaled afterwards, which is what keeps the ram's proportions the ones
 * the model would have given it.
 */

/** Signed speed every one of these is driven at, in units per second. */
export const MOUNT_INPUT_SPEED = 1;

/**
 * A ram whose barrel mount rides a grounded guide along the ram's own axis.
 *
 * The simplest thing a mount can be attached to and the simplest thing that
 * can be done with it: the guide, the ram and the fixed eye are all on one
 * line, so commanding the ram's length says exactly where the carriage is --
 * `O = R - s` along the guide, and nothing else it could be.
 *
 * What makes it a coupled drawing is only that the mount carries a block of
 * its own. The walk would place the ram from its two mounts as though the
 * carriage were not there.
 */
export function axialCarriageFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const mount = { x: 0, y: 0 };
  const eye = { x: 10, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'O', ...at(mount.x, mount.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
      { id: 'R', ...at(eye.x, eye.y), ground: true },
    ],
    links: [{ joints: 'ON' }, { joints: 'PR' }],
    sliders: [
      // The ram itself, driving.
      {
        at: 'P',
        prisId: 'S',
        on: { carrier: 'ON', a: 'O', b: 'N' },
        sealed: true,
        input: true,
      },
      // The carriage the barrel mount rides in.
      { at: 'O', prisId: 'K', angleRad: 0 },
    ],
    welds: ['P'],
    inputAngVel: MOUNT_INPUT_SPEED * scale,
  };
}

/** The oblique guide's heading, and the geometry the closed form reads. */
export const OBLIQUE = {
  /** Guide direction, from the carriage's own start point. */
  heading: Math.PI / 3,
  /** Where along the guide the perpendicular from the eye falls. */
  foot: 5,
  /** How far the eye stands off the guide -- the closest the ram can ever be. */
  standoff: 3,
};

/**
 * The same carriage, on a guide that runs across the ram rather than along it.
 *
 * Now the ram's length says where the carriage is only through a quadratic:
 * with the guide written as `O0 + t u` and the eye at `R`, `|O0 + t u - R| = s`
 * gives `t = c -+ sqrt(s^2 - h^2)`, where `c` is the foot of the perpendicular
 * from the eye and `h` the standoff. Two roots, one on each side of the foot,
 * and the mechanism is on the near one -- which is a branch the residual alone
 * cannot tell from the other.
 *
 * The standoff is deliberately well under the ram's shortest reach, so the two
 * roots never meet inside the stroke: the tangency is a genuine singularity
 * and this fixture is about the ordinary interval, not about it.
 */
export function obliqueGuideFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const u = { x: Math.cos(OBLIQUE.heading), y: Math.sin(OBLIQUE.heading) };
  const normal = { x: -u.y, y: u.x };
  const mount = { x: 0, y: 0 };
  const eye = {
    x: OBLIQUE.foot * u.x + OBLIQUE.standoff * normal.x,
    y: OBLIQUE.foot * u.y + OBLIQUE.standoff * normal.y,
  };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'O', ...at(mount.x, mount.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
      { id: 'R', ...at(eye.x, eye.y), ground: true },
    ],
    links: [{ joints: 'ON' }, { joints: 'PR' }],
    sliders: [
      { at: 'P', prisId: 'S', on: { carrier: 'ON', a: 'O', b: 'N' }, sealed: true, input: true },
      { at: 'O', prisId: 'K', angleRad: OBLIQUE.heading },
    ],
    welds: ['P'],
    inputAngVel: MOUNT_INPUT_SPEED * scale,
  };
}

/** Where the translating bracket's witness joint stands off its mount. */
export const BRACKET_ARM = 2;
/** How far the passive ram's eye is from the bracket's start. */
export const BRACKET_REACH = 10;

/**
 * A ram welded into a bracket that translates, and cannot turn.
 *
 * The bracket's own joint is welded to a grounded guide's block, which is what
 * holds its heading against the world; the ram's barrel is welded into the
 * bracket, so the barrel cannot turn either. The drive is the guide, not the
 * ram: the ram is *passive*, and its length is whatever the distance from the
 * moving mount to the fixed eye happens to be. Push the bracket far enough and
 * that distance leaves the stroke, which is a refusal by a part nothing is
 * commanding -- the reversal here is a ram's stop, reached by another
 * actuator.
 *
 * The witness `W` is on the compound and off the ram's axis, so a barrel that
 * quietly turned inside its bracket would show there and nowhere else.
 */
export function translatingBracketFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const mount = { x: 0, y: 0 };
  const eye = { x: BRACKET_REACH, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'W', ...at(0, BRACKET_ARM) },
      { id: 'O', ...at(mount.x, mount.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
      { id: 'R', ...at(eye.x, eye.y), ground: true },
    ],
    links: [
      // Barrel and bracket, welded at the mount into one body.
      { joints: 'ONW', subset: [{ joints: 'ON' }, { joints: 'WO' }] },
      { joints: 'PR' },
    ],
    sliders: [
      // The slot is named on the compound the barrel was welded into: a
      // floating slot follows its carrier up to the top-level body, which is
      // what the app's own rebuild leaves behind.
      { at: 'P', prisId: 'S', on: { carrier: 'ONW', a: 'O', b: 'N' }, sealed: true },
      // The drive: a grounded guide the bracket is welded to, so the compound
      // translates along it without turning.
      { at: 'W', prisId: 'K', angleRad: 0, input: true },
    ],
    welds: ['P', 'O', 'W'],
    inputAngVel: MOUNT_INPUT_SPEED * scale,
  };
}

/** The rotating carrier's proportions. */
export const CARRIER = { slot: 8, mountAlong: 4, eye: { x: 4, y: 5 } };

/**
 * A ram whose mount rides a slot cut into a turning crank.
 *
 * The mount is welded to its block, so the barrel keeps a fixed angle to the
 * slot -- a right angle, as drawn -- and the ram's far eye is pinned to
 * ground. That makes the whole pose two components of one fixed vector read in
 * the crank's own turning frame: how far along the slot the mount sits, and
 * how long the ram has to be to reach the eye from there.
 *
 * Which is the point of it. The mount's acceleration is not the crank's: a
 * point sliding along a turning bar carries a Coriolis term, `2 rho' omega`
 * across the slot, and it is the largest thing in the answer at the moment the
 * mount is moving fastest along the bar. A formulation that differentiated the
 * constraints in a frame it forgot was turning would agree everywhere else.
 *
 * The ram is passive; the crank is the actuator, and it turns until the ram
 * reaches a stop.
 */
export function rotatingCarrierFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const mount = { x: CARRIER.mountAlong, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, CARRIER.eye, 0.5);
  return {
    joints: [
      { id: 'A', ...at(0, 0), ground: true, input: true },
      { id: 'E', ...at(CARRIER.slot, 0) },
      { id: 'O', ...at(mount.x, mount.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
      { id: 'R', ...at(CARRIER.eye.x, CARRIER.eye.y), ground: true },
    ],
    links: [{ joints: 'AE' }, { joints: 'ON' }, { joints: 'PR' }],
    sliders: [
      { at: 'P', prisId: 'S', on: { carrier: 'ON', a: 'O', b: 'N' }, sealed: true },
      { at: 'O', prisId: 'Q', on: { carrier: 'AE', a: 'A', b: 'E' } },
    ],
    welds: ['P', 'O'],
    inputAngVel: MOUNT_INPUT_SPEED,
  };
}

/** The boom's proportions, and where its witness joint sits. */
export const BOOM = { length: 4, pivotToEye: 3, witness: { x: -2, y: 5 } };

/**
 * A boom raised by a ram whose rod mount is welded into the boom itself.
 *
 * The ordinary boom has the rod pinned to the boom and free to turn in it;
 * here the two are one body, so the rod cannot turn and the ram's whole
 * heading is the boom's. The witness `W` is a third joint of that body, off
 * both the boom's line and the ram's, which is what makes it worth reading:
 * `a_W = a_C + alpha x r - omega^2 r` is the only relation that puts it where
 * it goes, and a body whose angular acceleration was wrong would still place
 * every joint on the boom's own line correctly.
 *
 * The ram is the drive, so the boom's angle follows from the law of cosines --
 * one equation, hand-solvable, and independent of everything the solver does.
 */
export function weldedBoomFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const mount = { x: BOOM.pivotToEye, y: 0 };
  const boomTip = { x: 0, y: BOOM.length };
  const { barrelEnd, pin } = cylinderBetween(mount, boomTip, 0.5);
  return {
    joints: [
      { id: 'O', ...at(0, 0), ground: true },
      { id: 'C', ...at(boomTip.x, boomTip.y) },
      { id: 'W', ...at(BOOM.witness.x, BOOM.witness.y) },
      { id: 'G', ...at(mount.x, mount.y), ground: true },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'P', ...at(pin.x, pin.y) },
    ],
    links: [
      { joints: 'OC' },
      { joints: 'GN' },
      // The rod, welded at its mount into a bracket that carries the witness.
      // Welded into the *boom* instead there would be nothing left to move:
      // the ram and the boom would be one body pinned to ground at both ends.
      { joints: 'PCW', subset: [{ joints: 'PC' }, { joints: 'CW' }] },
    ],
    sliders: [
      { at: 'P', prisId: 'S', on: { carrier: 'GN', a: 'G', b: 'N' }, sealed: true, input: true },
    ],
    welds: ['P', 'C'],
    inputAngVel: MOUNT_INPUT_SPEED * scale,
  };
}

/**
 * The same drawing with every joint renamed and every list turned round.
 *
 * Nothing about a mechanism depends on what its joints are called or on the
 * order somebody happened to draw them in, and several things in the solver
 * are indexed by exactly that: which joint a compound lists second, which
 * member of a weld comes first, which order the unknowns enter the vector.
 * A fixture built both ways and solved to the same motion is the only way to
 * say so.
 */
export function permuted(fixture: MechanismFixture): MechanismFixture {
  const rename = (id: string) =>
    [...id].map((letter) => String.fromCharCode(letter.charCodeAt(0) + 1)).join('');
  const link = (spec: MechanismFixture['links'][number]): MechanismFixture['links'][number] => ({
    ...spec,
    joints: rename(spec.joints),
    subset: spec.subset ? [...spec.subset].reverse().map(link) : undefined,
  });
  const sliders = [...(fixture.slider ? [fixture.slider] : []), ...(fixture.sliders ?? [])]
    .reverse()
    .map((spec) => ({
      ...spec,
      at: rename(spec.at),
      prisId: rename(spec.prisId),
      on: spec.on
        ? { carrier: rename(spec.on.carrier), a: rename(spec.on.a), b: rename(spec.on.b) }
        : undefined,
    }));
  return {
    ...fixture,
    joints: [...fixture.joints].reverse().map((spec) => ({ ...spec, id: rename(spec.id) })),
    links: [...fixture.links].reverse().map(link),
    slider: undefined,
    sliders,
    welds: fixture.welds?.map(rename),
  };
}
