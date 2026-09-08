import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  offsetPivotLeverFixture,
  offsetPivotLeverWeldedRodFixture,
} from '../../test-utils/verification/slot-fixtures';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { Joint } from '../../app/model/joint';

/**
 * A slotted lever pinned to the frame at a joint that is not on its slot.
 *
 * Every earlier slotted-lever fixture put the pivot at one end of the slot, and
 * the inverse-slot primitive was written for exactly that: swing the carrier
 * about a known slot joint until the slot passes through the block. A lever
 * whose pivot is a third pin of its own -- a locomotive's combination lever,
 * pinned to the frame between its slot and its rod -- had no known slot joint
 * to swing about, and the walk left it unplaced. Reported from a drawing that
 * was refused for a "part tied to nothing", which was doubly wrong: the count
 * that was compared against was Gruebler's, not the one freedom the drive has.
 *
 * The primitive now swings the carrier about any known pin of it, keeping the
 * pivot's offset from the slot line. The claims below are the ones that make
 * that a solve rather than a picture: the pivot never moves, the lever stays
 * rigid, the block stays on the slot, and the rates the loop solver finds are
 * the derivatives of the positions it was handed.
 */
/** A step small enough that the closed form's central difference is exact to 1e-9. */
const DELTA = 1e-6;

/**
 * The crank's angle as the drawing holds it, read off the crank pin.
 *
 * Not from the clock: each sample turns the pin from the previous sample's
 * recorded position, which was rounded to four decimals, so a turn of the
 * crank ends a few ten-thousandths of a radian short of where the clock says.
 * The closed form is asked about the pose the solver actually reached.
 */
const crankAngle = (frame: Joint[]) => {
  const b = frame.find((one) => one.id === 'B')!;
  return Math.atan2(b.y, b.x);
};

/**
 * The drawing in closed form, from the crank angle alone.
 *
 * In the lever's own frame the slot is the line y = 1 and the pivot C sits one
 * unit below it. Turned by phi about C, the slot passes through the crank pin B
 * when the vector from C to B, expressed in that frame, has a y of one -- and
 * the block sits at x = +sqrt(|CB|^2 - 1) along it, on the side it started.
 * The rod D-F is three long and F rides the line y = 1, to the right of D.
 */
function pose(theta: number): {
  B: [number, number];
  D: [number, number];
  E: [number, number];
  F: [number, number];
  lever: number;
} {
  const b: [number, number] = [Math.cos(theta), Math.sin(theta)];
  const rx = b[0] - 3;
  const ry = b[1];
  const along = Math.sqrt(rx * rx + ry * ry - 1);
  // From C the block lies `along` units up the slot and one unit across it,
  // on the side that makes the offset -1 with the slot pointing D -> E; that
  // direction is -x in the lever's frame, hence the pi.
  const lever = Math.atan2(ry, rx) - Math.atan2(-1, along) - Math.PI;
  const turn = (x: number, y: number): [number, number] => [
    3 + x * Math.cos(lever) - y * Math.sin(lever),
    x * Math.sin(lever) + y * Math.cos(lever),
  ];
  const d = turn(-1, 1);
  const e = turn(-5, 1);
  const f: [number, number] = [d[0] + Math.sqrt(9 - (d[1] - 1) * (d[1] - 1)), 1];
  return { B: b, D: d, E: e, F: f, lever };
}

describe('a slotted lever pinned off its slot', () => {
  const built = buildMechanism(offsetPivotLeverFixture());
  const frames = built.mechanism.joints;
  const at = (frame: Joint[], id: string) => frame.find((one) => one.id === id)!;
  const span = (frame: Joint[], a: string, b: string) =>
    Math.hypot(at(frame, a).x - at(frame, b).x, at(frame, a).y - at(frame, b).y);

  it('turns all the way round', () => {
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBe(361);
    // Every sample turns the crank the same way: no reversal anywhere.
    const signs = new Set(built.mechanism.inputAngularVelocities.map(Math.sign));
    expect(signs.size).toBe(1);
  });

  it('keeps the pivot on the frame and the lever rigid about it', () => {
    const cd = span(frames[0], 'C', 'D');
    const ce = span(frames[0], 'C', 'E');
    for (const frame of frames) {
      expect(at(frame, 'C').x).toBe(3);
      expect(at(frame, 'C').y).toBe(0);
      // To the four decimals every solved position is recorded at.
      expect(span(frame, 'C', 'D')).toBeCloseTo(cd, 3);
      expect(span(frame, 'C', 'E')).toBeCloseTo(ce, 3);
    }
  });

  it('keeps the block on the slot, one unit from the pivot as drawn', () => {
    // The closed form: the slot line stays a fixed signed distance from the
    // pivot, and passes through the crank pin. Both at every sample, to the
    // four decimals every solved position is recorded at.
    for (const frame of frames) {
      const d = at(frame, 'D');
      const e = at(frame, 'E');
      const b = at(frame, 'B');
      const p = at(frame, 'P');
      const ux = (e.x - d.x) / span(frame, 'D', 'E');
      const uy = (e.y - d.y) / span(frame, 'D', 'E');
      expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(1e-9);
      expect(Math.abs(ux * (b.y - d.y) - uy * (b.x - d.x))).toBeLessThan(2e-4);
      expect(Math.abs(ux * (0 - d.y) - uy * (3 - d.x) - 1)).toBeLessThan(2e-4);
    }
  });

  it('lands every sample on the closed-form pose', () => {
    for (let t = 0; t < frames.length; t++) {
      const exact = pose(crankAngle(frames[t]));
      for (const id of ['B', 'D', 'E', 'F'] as const) {
        // Each coordinate is recorded to four decimals, and the lever's far
        // end is placed from a crank pin recorded the same way, so a point
        // may sit a few ten-thousandths from where the closed form puts it.
        expect(
          Math.hypot(at(frames[t], id).x - exact[id][0], at(frames[t], id).y - exact[id][1])
        ).toBeLessThan(5e-4);
      }
    }
  });

  it('finds rates that are the derivatives of the closed-form pose', () => {
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
    for (let t = 0; t < frames.length; t++) {
      KinematicsSolver.determineKinematics(
        frames[t],
        built.mechanism.links[t],
        built.mechanism.inputAngularVelocities[t]
      );
      // The grounded pivot is seeded at rest and must stay there: it is the
      // seed the lever's other joints are carried from, and a stale seed once
      // handed it a velocity of its own.
      expect(KinematicsSolver.jointVelMap.get('C')).toEqual([0, 0]);
      // Differentiated where the closed form is exact, so what is compared is
      // the solver's rate against the true one, not against rounded positions:
      // the pose's derivative in the crank angle, times the crank's speed.
      const speed = built.mechanism.inputAngularVelocities[t];
      const before = pose(crankAngle(frames[t]) - DELTA);
      const after = pose(crankAngle(frames[t]) + DELTA);
      for (const id of ['D', 'E', 'F', 'P'] as const) {
        const v = KinematicsSolver.jointVelMap.get(id)!;
        const exact = id === 'P' ? 'B' : id;
        const vx = (speed * (after[exact][0] - before[exact][0])) / (2 * DELTA);
        const vy = (speed * (after[exact][1] - before[exact][1])) / (2 * DELTA);
        // The rates are solved on the recorded positions, so they carry the
        // same few ten-thousandths, against speeds of order one.
        expect(Math.hypot(v[0] - vx, v[1] - vy)).toBeLessThan(5e-3);
      }
      const turned = after.lever - before.lever;
      const omega = (speed * Math.atan2(Math.sin(turned), Math.cos(turned))) / (2 * DELTA);
      expect(KinematicsSolver.linkAngVelMap.get('CDE')!).toBeCloseTo(omega, 3);
      // And the slider's guide is horizontal, so its rate has no vertical part.
      expect(Math.abs(KinematicsSolver.jointVelMap.get('F')![1])).toBeLessThan(1e-9);
    }
  });
});

describe('the same lever with its rod welded to the block', () => {
  it('is refused: a rod that cannot tilt cannot follow a pin on a swinging lever', () => {
    // The weld makes rod and block one body, held level by the guide, so the
    // rod's end on the lever may only move along the guide -- and a pin on a
    // lever turning about a fixed pivot does not, except at one instant. The
    // geometry says nothing moves. It only says so because the slot on the
    // lever is measured as it lies: read the block's stored angle instead and
    // a slanted slot counts as horizontal, and the crank pin was free to leave
    // its slot sideways -- a freedom the drawing does not have.
    const built = buildMechanism(offsetPivotLeverWeldedRodFixture());
    expect(built.mechanism.dof).toBeLessThan(1);
    expect(built.mechanism.isMechanismValid()).toBe(false);
    expect(built.mechanism.failure).toBe('mobility');
  });
});
