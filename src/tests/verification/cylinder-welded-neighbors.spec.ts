// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { NotificationService } from '../../app/services/notification.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import {
  TWO_CYLINDERS_PAYLOAD,
  WELDED_BRACKET_PAYLOAD,
  twoCylindersOneBracketFixture,
  weldedBracketCylinderFixture,
} from '../../test-utils/verification/welded-cylinder-fixtures';
import { Cylinder, cylindersIn } from '../../app/model/cylinder';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';

/**
 * Who moves when something welded to a cylinder is not what the reader has
 * hold of (decision S21).
 *
 * The maintainer's two drawings, driven through the service every surface
 * goes through. The rule in one line: **only a body drag carries**. A drag of
 * the barrel, the rod, or a body welded to either takes the whole assembly;
 * everything else — an end joint, the slide, a typed Angle, *Starts at*, a
 * member length — writes the cylinder's own joints, and a welded body changes
 * shape around them exactly as a compound link does when one of its joints is
 * dragged.
 *
 * Written against the fixtures rather than against a hand-built graph so the
 * same two drawings are published as URLs a reviewer can open, and so the
 * scenes here and the ones `e2e/cylinder-welded-drag.mjs` drives with a real
 * mouse are the same drawings.
 */

interface Scene {
  mechanism: MechanismService;
  grid: GridUtilsService;
  notify: NotificationService;
  history: SaveHistoryService;
  /** Every joint's position, by id, as it stands. */
  pose: () => Map<string, { x: number; y: number }>;
  at: (id: string) => { x: number; y: number };
  joint: (id: string) => RealJoint;
  span: (from: string, to: string) => number;
  cylinders: () => Cylinder[];
  /** The cylinder whose slide is this joint. */
  on: (seal: string) => Cylinder;
  said: () => string[];
}

function open(payload: string): Scene {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const mechanism = TestBed.inject(MechanismService);
  const grid = TestBed.inject(GridUtilsService);
  const notify = TestBed.inject(NotificationService);
  const history = TestBed.inject(SaveHistoryService);
  TestBed.inject(UrlProcessorService).updateFromURL(payload, false, true);
  const joint = (id: string) => mechanism.joints.find((one) => one.id === id) as RealJoint;
  const at = (id: string) => ({ x: joint(id).x, y: joint(id).y });
  return {
    mechanism,
    grid,
    notify,
    history,
    pose: () => new Map(mechanism.joints.map((one) => [one.id, { x: one.x, y: one.y }])),
    at,
    joint,
    span: (from, to) => Math.hypot(at(from).x - at(to).x, at(from).y - at(to).y),
    cylinders: () => cylindersIn(mechanism.joints),
    on: (seal) => cylindersIn(mechanism.joints).find((one) => one.seal.id === seal)!,
    said: () => notify.live.map((one) => `${one.id}|${one.text}`),
  };
}

/**
 * Which joints are somewhere new, and by how far.
 *
 * A rebuild rounds every coordinate to six places and re-derives the two joints
 * a cylinder owns, so "did not move" is a distance rather than an equality --
 * and one loose enough to survive that rounding and nothing else.
 */
const STILL = 1e-4;

function movedBetween(
  was: Map<string, { x: number; y: number }>,
  now: Map<string, { x: number; y: number }>
): string[] {
  return [...now]
    .filter(([id, to]) => {
      const from = was.get(id);
      return !!from && Math.hypot(to.x - from.x, to.y - from.y) > STILL;
    })
    .map(([id]) => id)
    .sort();
}

describe('the two drawings the report arrived as', () => {
  // The browser suite opens the payloads rather than the fixtures, because an
  // `e2e/*.mjs` has no TypeScript to call. So they have to be the same drawing.
  it('are the URLs `e2e/cylinder-welded-drag.mjs` opens', () => {
    expect(fixturePayload(weldedBracketCylinderFixture())).toBe(WELDED_BRACKET_PAYLOAD);
    expect(fixturePayload(twoCylindersOneBracketFixture())).toBe(TWO_CYLINDERS_PAYLOAD);
  });
});

describe('image 1: a bar welded to a cylinder’s barrel end joint', () => {
  const scene = () => open(fixturePayload(weldedBracketCylinderFixture()));

  it('is the drawing the report describes', () => {
    const shown = scene();
    const [cylinder] = shown.cylinders();
    expect(cylinder.mountA.id).toBe('A');
    expect(cylinder.seal.id).toBe('C');
    expect(cylinder.mountB.id).toBe('B');
    // One body holding the barrel and the bar, which is what the weld at A
    // leaves behind.
    expect(cylinder.barrelRoot.id).not.toBe(cylinder.barrel.id);
    expect(cylinder.barrelRoot.joints.map((one) => one.id).sort()).toEqual(['A', 'J', 'N']);
  });

  it('leaves J alone when B, the far end, is dragged', () => {
    // The first half of the report, in one gesture.
    const shown = scene();
    const was = shown.pose();
    const barrel = shown.span('A', 'N');
    const rod = shown.span('C', 'B');

    shown.grid.dragJoint(shown.joint('B'), new Coord(shown.at('B').x - 1, shown.at('B').y + 3));

    expect(movedBetween(was, shown.pose())).toEqual(['B', 'C', 'N']);
    expect(shown.span('A', 'N')).toBeCloseTo(barrel, 4);
    expect(shown.span('C', 'B')).toBeCloseTo(rod, 4);
  });

  it('leaves J alone when A, the welded end joint, is dragged', () => {
    // A is a joint of the bracket, so the bracket changes shape: the joint the
    // reader took hold of moves and the other one does not, which is what a
    // compound link does.
    const shown = scene();
    const was = shown.pose();

    shown.grid.dragJoint(shown.joint('A'), new Coord(1, 2));

    expect(movedBetween(was, shown.pose())).toEqual(['A', 'C', 'N']);
    expect(shown.at('A').x).toBeCloseTo(1, 3);
    expect(shown.at('A').y).toBeCloseTo(2, 3);
  });

  it('leaves J alone through a typed Angle', () => {
    const shown = scene();
    const was = shown.pose();
    const barrel = shown.span('A', 'N');
    const rod = shown.span('C', 'B');

    expect(shown.grid.setCylinderAngle(shown.on('C'), Math.PI / 4)).toBe(true);

    expect(movedBetween(was, shown.pose()).includes('J')).toBe(false);
    expect(shown.span('A', 'N')).toBeCloseTo(barrel, 4);
    expect(shown.span('C', 'B')).toBeCloseTo(rod, 4);
    expect(
      Math.atan2(shown.at('B').y - shown.at('A').y, shown.at('B').x - shown.at('A').x)
    ).toBeCloseTo(Math.PI / 4, 4);
  });

  it('leaves J alone through a typed Barrel Length, a Rod Length and a Starts at', () => {
    const shown = scene();
    const was = shown.pose();

    expect(shown.grid.setBarrelLength(shown.on('C'), shown.span('A', 'N') * 1.25)).toBe(true);
    expect(shown.grid.setRodLength(shown.on('C'), shown.span('C', 'B') * 1.3)).toBe(true);
    expect(shown.grid.setCylinderStart(shown.on('C'), 0.75)).toBe(true);

    expect(movedBetween(was, shown.pose()).includes('J')).toBe(false);
    expect(shown.said()).toEqual([]);
  });

  it('leaves J alone when the slide itself is dragged', () => {
    const shown = scene();
    const was = shown.pose();
    const barrel = shown.span('A', 'N');
    const rod = shown.span('C', 'B');

    shown.grid.dragCylinderSeal(shown.on('C'), new Coord(shown.at('C').x + 1, shown.at('C').y));

    expect(movedBetween(was, shown.pose()).includes('J')).toBe(false);
    // A drag of the head never changes a member's length.
    expect(shown.span('A', 'N')).toBeCloseTo(barrel, 4);
    expect(shown.span('C', 'B')).toBeCloseTo(rod, 4);
  });

  it('takes J with it when the body itself is dragged', () => {
    // The one gesture that still carries. The canvas routes a drag of the
    // barrel, the rod or the bracket here through `cylinderAt`.
    const shown = scene();
    const was = shown.pose();

    shown.grid.dragCylinder(shown.on('C'), 2, -3);

    expect(movedBetween(was, shown.pose())).toEqual(['A', 'B', 'C', 'J', 'N']);
    for (const id of ['A', 'B', 'C', 'J', 'N']) {
      expect(shown.at(id).x - was.get(id)!.x).toBeCloseTo(2, 3);
      expect(shown.at(id).y - was.get(id)!.y).toBeCloseTo(-3, 3);
    }
  });

  it('swings J round with it when the body turns about a locked joint', () => {
    const shown = scene();
    shown.joint('A').locked = true;
    shown.mechanism.updateMechanism(false);
    const was = shown.pose();
    const bracket = shown.span('A', 'J');

    shown.grid.rotateCylinder(shown.on('C'), new Coord(shown.at('A').x, shown.at('A').y), 0.4);

    // The pivot is where the Lock says it is, and the body kept its shape.
    expect(shown.at('A').x).toBeCloseTo(was.get('A')!.x, 4);
    expect(shown.at('A').y).toBeCloseTo(was.get('A')!.y, 4);
    expect(shown.span('A', 'J')).toBeCloseTo(bracket, 4);
    expect(movedBetween(was, shown.pose())).toEqual(['B', 'C', 'J', 'N']);
  });

  it('is one undo entry per gesture, and undo puts the drawing back', () => {
    const shown = scene();
    shown.mechanism.updateMechanism(true);
    const was = shown.pose();

    shown.grid.dragJoint(shown.joint('B'), new Coord(shown.at('B').x - 1, shown.at('B').y + 3));
    shown.mechanism.updateMechanism(true);
    shown.history.undo();

    for (const [id, point] of was) {
      // What "back" means across a URL round trip: the codec stores user units
      // to a thousandth, and undo replays a URL.
      expect(Math.hypot(shown.at(id).x - point.x, shown.at(id).y - point.y), id).toBeLessThan(0.5);
    }
  });
});

/**
 * The same bar, pinned to the end joint rather than welded to it, so it is a
 * bar of its own and can hold its length.
 *
 * A hold lives on a two-joint bar the solver can see, and `heldBars` reads the
 * top-level links; welded into a compound the bracket is a leaf, and a leaf
 * carries no hold. This is the shape the claim is about anyway: S21 is about
 * what an edit *carries*, and a hold is not a carry — it is a constraint the
 * CAD solver answers before any of this runs.
 */
function barOnACylinderEndJoint(): MechanismFixture {
  const mount = { x: 0, y: 0 };
  const eye = { x: 6, y: 0 };
  const { barrelEnd, pin } = cylinderBetween(mount, eye, 0.5);
  return {
    joints: [
      { id: 'A', ...mount },
      { id: 'N', ...barrelEnd },
      { id: 'C', ...pin },
      { id: 'B', ...eye },
      { id: 'J', x: -3, y: -2 },
    ],
    links: [{ joints: 'AN' }, { joints: 'CB' }, { joints: 'AJ' }],
    sliders: [{ at: 'C', on: { carrier: 'AN', a: 'A', b: 'N' }, sealed: true }],
    welds: ['C'],
    inputAngVel: 1,
  };
}

describe('a bar holding its length on a cylinder’s end joint', () => {
  it('still gets the answer the hold solver gives it', () => {
    // Holds are untouched by S21: `dragJoint` asks `settleHolds` before any
    // cylinder pose is worked out, so a bar fixed at its length still swings
    // its far end round its own circle rather than standing still.
    const shown = open(fixturePayload(barOnACylinderEndJoint()));
    const bar = shown.mechanism.links.find((link) => link.id === 'AJ') as RealLink;
    expect(bar).toBeDefined();
    bar.hold = 'length';
    shown.mechanism.updateMechanism(false);
    const was = shown.pose();
    const length = shown.span('A', 'J');

    shown.grid.dragJoint(shown.joint('A'), new Coord(1, 2));

    // J followed, on its own circle: the held length is exactly what it was.
    expect(shown.span('A', 'J')).toBeCloseTo(length, 3);
    // The cylinder re-laid itself around the moved end joint, and nothing
    // outside the part and that bar went anywhere.
    expect(movedBetween(was, shown.pose())).toEqual(['A', 'C', 'J', 'N']);
  });
});

describe('image 2: two cylinders whose barrels are welded at one end joint', () => {
  const scene = () => open(fixturePayload(twoCylindersOneBracketFixture()));

  it('is the drawing the report describes', () => {
    const shown = scene();
    const parts = shown.cylinders();
    expect(parts).toHaveLength(2);
    expect(parts.every((one) => one.mountA.id === 'A')).toBe(true);
    // One body holding both barrels.
    expect(parts[0].barrelRoot.id).toBe(parts[1].barrelRoot.id);
  });

  it('moves A alone when A is dragged: B and E both stay', () => {
    // The report's second half. `E` used to be carried while `B` stood still,
    // which is the inconsistency it names.
    const shown = scene();
    const was = shown.pose();

    shown.grid.dragJoint(shown.joint('A'), new Coord(-1, 1.5));

    expect(movedBetween(was, shown.pose())).toEqual(['A', 'C', 'D', 'M', 'N']);
    expect(shown.at('A').x).toBeCloseTo(-1, 3);
    expect(shown.at('A').y).toBeCloseTo(1.5, 3);
  });

  it('leaves B alone when E is dragged, and E alone when B is dragged', () => {
    const shown = scene();
    const first = shown.pose();

    shown.grid.dragJoint(shown.joint('E'), new Coord(shown.at('E').x + 2, shown.at('E').y + 1));
    expect(movedBetween(first, shown.pose())).toEqual(['D', 'E', 'M']);

    const second = shown.pose();
    shown.grid.dragJoint(shown.joint('B'), new Coord(shown.at('B').x + 1, shown.at('B').y - 2));
    expect(movedBetween(second, shown.pose())).toEqual(['B', 'C', 'N']);
  });

  it('leaves the other cylinder alone through a typed Angle on one of them', () => {
    const shown = scene();
    const was = shown.pose();

    expect(shown.grid.setCylinderAngle(shown.on('C'), -0.4)).toBe(true);

    const moved = movedBetween(was, shown.pose());
    expect(moved).not.toContain('E');
    // And the second cylinder kept both of its member lengths whatever it did.
    expect(shown.span('A', 'M')).toBeCloseTo(
      Math.hypot(was.get('A')!.x - was.get('M')!.x, was.get('A')!.y - was.get('M')!.y),
      3
    );
  });

  it('takes both cylinders with it when the body is dragged', () => {
    const shown = scene();
    const was = shown.pose();

    shown.grid.dragCylinder(shown.on('C'), 3, 1);

    expect(movedBetween(was, shown.pose())).toEqual(['A', 'B', 'C', 'D', 'E', 'M', 'N']);
    for (const id of ['A', 'B', 'E']) {
      expect(shown.at(id).x - was.get(id)!.x).toBeCloseTo(3, 3);
      expect(shown.at(id).y - was.get(id)!.y).toBeCloseTo(1, 3);
    }
  });

  it('gives the same answer whichever cylinder the list is read in', () => {
    // Two cylinders on one end joint are posed in turn, so the order they are
    // enumerated in must not decide where anything lands.
    const forward = scene();
    forward.grid.dragJoint(forward.joint('A'), new Coord(-1, 1.5));

    const backward = scene();
    backward.mechanism.joints.reverse();
    backward.grid.dragJoint(backward.joint('A'), new Coord(-1, 1.5));

    for (const id of ['A', 'B', 'C', 'D', 'E', 'M', 'N']) {
      expect(backward.at(id).x, id).toBeCloseTo(forward.at(id).x, 4);
      expect(backward.at(id).y, id).toBeCloseTo(forward.at(id).y, 4);
    }
  });

  it('says nothing, because nothing was refused', () => {
    const shown = scene();
    shown.grid.dragJoint(shown.joint('A'), new Coord(-1, 1.5));
    shown.grid.dragJoint(shown.joint('E'), new Coord(shown.at('E').x + 2, shown.at('E').y + 1));
    shown.grid.dragCylinder(shown.on('D'), 1, 1);

    expect(shown.said()).toEqual([]);
  });
});
