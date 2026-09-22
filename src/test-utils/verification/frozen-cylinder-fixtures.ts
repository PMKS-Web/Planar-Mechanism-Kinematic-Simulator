import { MechanismFixture } from './fixture';
import { cylinderBetween } from './slot-fixtures';

/**
 * Two drawings in which a cylinder is a fixed part of one body (decision S25).
 *
 * The maintainer, on the first of them:
 *
 * > *"Image 2 shows this incorrect status about nothing being driven because
 * > there's something clearly being driven. So you should never show a message
 * > if a mechanism is driven that says it's not driven. ... But this one should
 * > be simulateable"*
 *
 * Both are the same shape seen twice. A cylinder's two end joints are welded
 * into one body, so there is one body on each side of the seal and the part
 * cannot stroke -- which does not stop the body moving. The first is that body
 * on its own, pinned to ground and driven; the second is the same body used as
 * the coupler of an ordinary crank-rocker, which is the case that matters more,
 * because a frozen cylinder is a rigid link and has to run like the ternary
 * link it is.
 *
 * The welds are written as the compound they leave behind -- every member as a
 * leaf of one body, with the slot lifted to that body -- which is what a
 * rebuild makes of a cylinder's end joint after a weld.
 */

/** Where the cylinder's two end joints sit in both drawings below. */
const MOUNT = { x: 0, y: 0 };
const EYE = { x: 6, y: 0 };

/**
 * **The maintainer's drawing.** One fused body `ABCDE`: the cylinder `A-B-C`
 * with a bar to `D` off each of its end joints, a bar `D-E`, welds at `A`, `C`
 * and `D`, and `E` a grounded pin with Driven Input on.
 *
 * It is one rigid body turning about a pin, and the cylinder turns with it. The
 * app used to fail to solve it, keep the mechanism it had solved before the
 * input was switched on, and report that machine's blocker -- "Nothing drives
 * this mechanism", about a drawing whose joint `E` is driven.
 */
export function drivenFrozenCylinderBodyFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const { barrelEnd, pin } = cylinderBetween(MOUNT, EYE, 0.5);
  return {
    joints: [
      { id: 'A', ...at(MOUNT.x, MOUNT.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'B', ...at(pin.x, pin.y) },
      { id: 'C', ...at(EYE.x, EYE.y) },
      { id: 'D', ...at(3, 4) },
      { id: 'E', ...at(3, -3), ground: true, input: true },
    ],
    links: [
      {
        joints: 'ABCDEN',
        subset: [
          { joints: 'AN' },
          { joints: 'BC' },
          { joints: 'AD' },
          { joints: 'CD' },
          { joints: 'DE' },
        ],
      },
    ],
    sliders: [{ at: 'B', on: { carrier: 'ABCDEN', a: 'A', b: 'N' }, sealed: true }],
    // `B` is the seal, which is what makes the part a cylinder; the other three
    // are the welds that put both of its ends in one body.
    welds: ['B', 'A', 'C', 'D'],
    inputAngVel: 1,
  };
}

/**
 * The same body used as a coupler: a crank-rocker whose coupler is a frozen
 * cylinder welded between two ternary bars.
 *
 * The general case, and the one worth guarding. `P` and `Q` are ordinary pins
 * of the coupler -- neither is a weld -- so the crank and the rocker hang off
 * the body the way they would off any ternary link, and the cylinder inside it
 * is carried round by the coupler's own motion.
 *
 * Proportions: crank 1.2, coupler 4.4, rocker 3.0, frame 4.754. Grashof with
 * the shortest link next to the frame, so the crank goes right round.
 */
export function frozenCylinderCouplerFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  const { barrelEnd, pin } = cylinderBetween(MOUNT, EYE, 0.5);
  return {
    joints: [
      { id: 'O', ...at(0.8, 1), ground: true, input: true },
      { id: 'P', ...at(0.8, 2.2) },
      { id: 'A', ...at(MOUNT.x, MOUNT.y) },
      { id: 'N', ...at(barrelEnd.x, barrelEnd.y) },
      { id: 'S', ...at(pin.x, pin.y) },
      { id: 'C', ...at(EYE.x, EYE.y) },
      { id: 'D', ...at(3, 3.2) },
      { id: 'Q', ...at(5.2, 2.2) },
      { id: 'G', ...at(5.2, -0.8), ground: true },
    ],
    links: [
      { joints: 'OP' },
      {
        joints: 'ACDNPQS',
        subset: [{ joints: 'AN' }, { joints: 'CS' }, { joints: 'ADP' }, { joints: 'CDQ' }],
      },
      { joints: 'GQ' },
    ],
    sliders: [{ at: 'S', on: { carrier: 'ACDNPQS', a: 'A', b: 'N' }, sealed: true }],
    welds: ['S', 'A', 'C', 'D'],
    inputAngVel: 1,
  };
}

/**
 * The oracle for the frozen body's forces: the very same drawing with the
 * cylinder drawn as plain welded bars.
 *
 * Derived from the fixture above rather than written out again, so the two
 * cannot drift into being different shapes: the same joints in the same places,
 * the same compound with the same leaves, the same masses and the same center
 * of mass -- and `B` an ordinary pin with no slot. A frozen cylinder *is* this
 * body, so every reaction the force solver reports at `E`, and the torque it
 * asks of the drive, has to be the same number to solver tolerance.
 */
export function weldedBarsOracleFixture(scale: number = 1): MechanismFixture {
  const { sliders, welds, ...rest } = drivenFrozenCylinderBodyFixture(scale);
  void sliders;
  return { ...rest, welds: (welds ?? []).filter((id) => id !== 'B') };
}

/**
 * **The maintainer's cylinder riding a slot** (decision S22, amended S25/S27):
 * a ternary `ABC` grounded at `A` with a slot along `A–B`; a cylinder whose
 * barrel end `D` is a Prismatic slider riding that slot; its seal `E` driven;
 * its rod welded at `F` into the ternary `FGH`, which is grounded at `G`.
 *
 * Every coordinate below is the drawing as it was saved, read back out of the
 * URL the maintainer shared. It is published because of what that rounding did:
 * `D` sits 7.6e-2 model units off its own slot line, well under half the grain
 * a coordinate is stored on, and the coupled solver's residual gate — a
 * millionth of the mechanism's size — refused the whole drawing for it. The
 * machine ran in the session it was drawn in and would not run when it was
 * reopened, and every undo landed on the same refusal, because undo replays a
 * URL.
 *
 * `D` is deliberately left where the URL put it. Straightened here it would
 * stop being the case it exists to cover.
 */
export function cylinderOnASlotFixture(scale: number = 1): MechanismFixture {
  const at = (x: number, y: number) => ({ x: x * scale, y: y * scale });
  return {
    joints: [
      { id: 'A', ...at(-1.234, -0.575), ground: true },
      { id: 'B', ...at(0.5431485, 1.242855) },
      { id: 'C', ...at(-1.6548195, 1.6360345) },
      { id: 'D', ...at(-0.2568585, 0.4245235) },
      // The barrel's buried inner end. A single letter because a fixture's
      // link string is read one character per joint, so the app's own interior
      // name (`D1`) cannot be written here; it is still the cylinder's inner
      // joint, so every reader-facing name drops it (D14, S11).
      { id: 'N', ...at(1.8821385, 0.386357) },
      { id: 'F', ...at(3.290136, 0.361234) },
      { id: 'E', ...at(1.151139, 0.3994005) },
      { id: 'G', ...at(6.162, -1.309), ground: true },
      { id: 'H', ...at(6.1241345, 0.342003) },
    ],
    // The colors the drawing was shared with. A cylinder is one color (S15) and
    // a welded member follows the body that swallowed it (S16), so the barrel,
    // the rod and the body holding the rod are all the one fill -- which is
    // what the shared payload carries, and what the fill left to the palette's
    // cursor would not be.
    links: [
      { joints: 'ABC', fill: '#c5cae9' },
      { joints: 'DN', fill: '#303e9f' },
      {
        joints: 'EFGH',
        fill: '#303e9f',
        subset: [
          { joints: 'EF', fill: '#303e9f' },
          { joints: 'FGH', fill: '#00695C' },
        ],
      },
    ],
    sliders: [
      // The barrel end, riding the ternary's slot. Prismatic rather than
      // Pin-in-slot: it is in the weld list below, so its riders keep the
      // slot's angle.
      { at: 'D', on: { carrier: 'ABC', a: 'A', b: 'B' } },
      // The seal, and the drive.
      { at: 'E', on: { carrier: 'DN', a: 'D', b: 'N' }, sealed: true, input: true },
    ],
    welds: ['D', 'E', 'F'],
    // Length per second along the slot, the sign the drawing was shared with.
    inputAngVel: -0.2 * scale,
  };
}
