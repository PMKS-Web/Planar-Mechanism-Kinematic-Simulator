import './joint';
import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';
import {
  Cylinder,
  HEAD_CLEARANCE_R,
  cylinderAtSeal,
  cylinderBarrelFloor,
  cylinderRodFloor,
  cylinderSizeOf,
  cylinderStroke,
  cylinderStrokeAlong,
} from './cylinder';
import {
  CylinderEdit,
  CylinderEditContext,
  CylinderEndState,
  CylinderFreedom,
  CylinderGive,
  poseForBarrelLength,
  poseForCylinderAngle,
  poseForCylinderStart,
  poseForRodLength,
  poseForSealAt,
  whatGives,
} from './cylinder-edit';

/**
 * What each field and each gesture asks the part for, and what gives when it
 * cannot have all of it (decisions D10, D11, S6, S7, S17 and S19).
 *
 * The tiebreak is **one ladder**, so this is written as one table rather than
 * as a hundred hand-written cases: both end joints over floating, grounded and
 * locked, both members over fixed and free, for each of the five edits, with
 * `whatGives` naming the rung that should have taken it and the pose read back
 * to say which one did. The fixtures are chosen so that every rung a case
 * offers can actually be taken, which is what lets the expectation be the
 * ladder itself instead of a column of answers somebody typed.
 *
 * A table proves the five edits agree with the ladder; it cannot prove the
 * ladder is in the right *order*, because it reads that order from the same
 * function. So the named cases under it pin the order itself, one per rung,
 * and the ones under those are what a table cannot state at all: the two
 * scenarios the maintainer reported, the smallest-change promise the repairs
 * make, how far a number that cannot be fully honored does get, and the
 * refusals that survive.
 */

const R = 0.15;
const CLEARANCE = HEAD_CLEARANCE_R * R;

/**
 * A cylinder lying along +x from A at the origin, built by hand.
 *
 * Built rather than drawn because these are pure functions of the record, and
 * because a drawn one cannot have two different member lengths yet — which is
 * the state most of this file is about.
 */
function cylinder(
  options: {
    barrel?: number;
    rod?: number;
    along?: number;
    groundA?: boolean;
    groundB?: boolean;
    angle?: number;
  } = {}
): Cylinder {
  const barrelLength = options.barrel ?? 6;
  const rodLength = options.rod ?? 6;
  const along = options.along ?? cylinderStrokeAlong(barrelLength, R).min + 2;
  const angle = options.angle ?? 0;
  const at = (distance: number) =>
    [distance * Math.cos(angle), distance * Math.sin(angle)] as const;

  const mountA = new RevJoint('A', 0, 0);
  const inner = new RevJoint('N', ...at(barrelLength));
  const seal = new PrisJoint('S', ...at(along));
  const mountB = new RevJoint('B', ...at(along + rodLength));
  mountA.ground = options.groundA ?? false;
  mountB.ground = options.groundB ?? false;

  const barrel = new RealLink('AN', [mountA, inner]);
  const rod = new RealLink('SB', [seal, mountB]);
  [mountA, inner].forEach((joint) => joint.links.push(barrel));
  [seal, mountB].forEach((joint) => joint.links.push(rod));
  seal.slideOn(barrel, mountA, inner);
  seal.isSealed = true;
  seal.rotates = false;
  return cylinderAtSeal(seal)!;
}

function context(overrides: Partial<CylinderEditContext> = {}): CylinderEditContext {
  return {
    r: R,
    isGrounded: (joint) => (joint as RevJoint).ground === true,
    isLocked: () => false,
    holds: {},
    fixedBy: (members) => `Held by fixed length ${members.map((one) => one.id).join(' and ')}`,
    ...overrides,
  };
}

/** The pose read back the way the record reads a built part. */
function reading(edit: CylinderEdit) {
  if (!edit.ok) throw new Error(`refused: ${edit.refusal.code}`);
  const { mountA, inner, seal, mountB } = edit.pose;
  const span = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);
  return {
    barrel: span(mountA, inner),
    rod: span(seal, mountB),
    along: span(mountA, seal),
    span: span(mountA, mountB),
    angle: Math.atan2(mountB.y - mountA.y, mountB.x - mountA.x),
    pose: edit.pose,
  };
}

/** A held bar in the way of the joints an edit would actually displace. */
const heldBy = (sentence: string, only?: string) => (displaced: { id: string }[]) =>
  displaced.some((joint) => only === undefined || joint.id === only) ? sentence : undefined;

function refusalOf(edit: CylinderEdit) {
  if (edit.ok) throw new Error('expected a refusal');
  return edit.refusal;
}

function stopOf(edit: CylinderEdit) {
  if (!edit.ok) throw new Error(`refused: ${edit.refusal.code}`);
  if (!edit.stoppedBy) throw new Error('expected an edit that stopped short');
  return edit.stoppedBy;
}

// ---------------------------------------------------------------- the ladder

describe('one ladder, stated once (S17)', () => {
  it('spends a floating joint, then the seal, then a grounded joint, then a length', () => {
    const everything: CylinderFreedom = {
      a: 'floating',
      b: 'floating',
      seal: true,
      barrel: true,
      rod: true,
    };
    expect(whatGives(everything)).toEqual(['joint-b', 'joint-a', 'seal', 'rod', 'barrel']);
    // A length is a number the reader chose; ground is where the frame happens
    // to be pinned, so it yields first.
    expect(whatGives({ ...everything, a: 'grounded', b: 'grounded' })).toEqual([
      'seal',
      'joint-b',
      'joint-a',
      'rod',
      'barrel',
    ]);
  });

  it('never offers a locked joint, a fixed length or a seal the edit already placed', () => {
    expect(
      whatGives({ a: 'locked', b: 'grounded', seal: false, barrel: false, rod: true })
    ).toEqual(['joint-b', 'rod']);
    expect(whatGives({ a: 'locked', b: 'locked', seal: false, barrel: false, rod: false })).toEqual(
      []
    );
  });
});

// ----------------------------------------------------------------- the table

const END_STATES: CylinderEndState[] = ['floating', 'grounded', 'locked'];

/** One row: what each end may do, and which members are keeping their length. */
interface Row {
  a: CylinderEndState;
  b: CylinderEndState;
  barrelFixed: boolean;
  rodFixed: boolean;
}

function everyRow(): Row[] {
  const rows: Row[] = [];
  for (const a of END_STATES) {
    for (const b of END_STATES) {
      for (const barrelFixed of [false, true]) {
        for (const rodFixed of [false, true]) rows.push({ a, b, barrelFixed, rodFixed });
      }
    }
  }
  return rows;
}

function label(row: Row): string {
  return `A ${row.a}, B ${row.b}${row.barrelFixed ? ', barrel fixed' : ''}${
    row.rodFixed ? ', rod fixed' : ''
  }`;
}

/** The drawing around the part, as one row of the table describes it. */
function contextFor(row: Row): CylinderEditContext {
  const inState = (state: CylinderEndState) =>
    new Set([row.a === state ? 'A' : '', row.b === state ? 'B' : ''].filter(Boolean));
  const grounded = inState('grounded');
  const locked = inState('locked');
  return context({
    isGrounded: (joint) => grounded.has(joint.id),
    isLocked: (joint) => locked.has(joint.id),
    holds: { barrel: row.barrelFixed, rod: row.rodFixed },
  });
}

/**
 * The fixture every row is run on: a long rod on a short barrel, opened a
 * third of the way.
 *
 * Deliberately roomy. Every rung the ladder can offer has to be *takeable*
 * here — a rod long enough to leave room above its own floor, a barrel short
 * enough to have room to grow — because the point of the table is that the
 * order alone decides, not which rung happened to be the only one that fitted.
 */
const TABLE_BARREL = 6;
const TABLE_ROD = 12;
const TABLE_ALONG = cylinderStrokeAlong(TABLE_BARREL, R).min + 2;
/** Three tenths open: far enough from where the seal stands to move something. */
const TABLE_SHARE = 0.3;
const TABLE_STANDING =
  (TABLE_ALONG - cylinderStrokeAlong(TABLE_BARREL, R).min) / cylinderStroke(TABLE_BARREL, R);

function tablePart(): Cylinder {
  return cylinder({ barrel: TABLE_BARREL, rod: TABLE_ROD, along: TABLE_ALONG });
}

/** Where a share of the travel puts the seal on the table's fixture. */
function tablePoint(share: number): { x: number; y: number } {
  const travel = cylinderStrokeAlong(TABLE_BARREL, R);
  return { x: travel.min + share * (travel.max - travel.min), y: 0 };
}

/** What an edit asks for, and what it leaves the ladder to spend. */
interface TableEdit {
  name: string;
  /** The member whose length the reader typed, which the ladder may not re-choose. */
  typed?: 'barrel' | 'rod';
  /** True when where the seal stands is still the ladder's to choose. */
  seal: boolean;
  /** The number this edit asks for, and the one the fixture already has. */
  asked: number;
  standing: number;
  at: (part: Cylinder, ctx: CylinderEditContext, value: number) => CylinderEdit;
  /** What "the number landed" means for this edit. */
  landed: (after: ReturnType<typeof reading>, value: number) => boolean;
}

const shareLanded = (after: ReturnType<typeof reading>, value: number) => {
  const travel = cylinderStrokeAlong(after.barrel, R);
  return Math.abs((after.along - travel.min) / (travel.max - travel.min) - value) < 1e-6;
};

const TABLE_EDITS: TableEdit[] = [
  {
    name: 'Starts at',
    seal: false,
    asked: TABLE_SHARE,
    standing: TABLE_STANDING,
    at: (part, ctx, value) => poseForCylinderStart(part, value, ctx),
    landed: shareLanded,
  },
  {
    name: 'a drag of the seal',
    seal: false,
    asked: TABLE_SHARE,
    standing: TABLE_STANDING,
    at: (part, ctx, value) => poseForSealAt(part, tablePoint(value), ctx),
    landed: shareLanded,
  },
  {
    name: 'Rod Length',
    typed: 'rod',
    seal: true,
    asked: 10,
    standing: TABLE_ROD,
    at: (part, ctx, value) => poseForRodLength(part, value, ctx),
    landed: (after, value) => Math.abs(after.rod - value) < 1e-6,
  },
  {
    name: 'Barrel Length',
    typed: 'barrel',
    seal: false,
    // Short enough that the head no longer stands inside its travel, so the
    // repair puts the head on the near stop and something has to follow it.
    asked: 1.5,
    standing: TABLE_BARREL,
    at: (part, ctx, value) => poseForBarrelLength(part, value, ctx),
    landed: (after, value) => Math.abs(after.barrel - value) < 1e-6,
  },
];

/** Which rung this pose actually took, read off the drawing it describes. */
function whatGave(
  before: Cylinder,
  edit: CylinderEdit,
  typed?: 'barrel' | 'rod'
): CylinderGive | 'refused' | 'nothing' {
  if (!edit.ok) return 'refused';
  // An edit that stopped short is the typed number being refused and the part
  // going as far toward it as it could (S19), so the ladder's answer to *that
  // number* was the bottom rung.
  if (edit.stoppedBy) return 'refused';
  const after = reading(edit);
  const moved = (was: { x: number; y: number }, to: { x: number; y: number }) =>
    Math.hypot(to.x - was.x, to.y - was.y) > 1e-6;
  const wasBarrel = Math.hypot(before.inner.x - before.mountA.x, before.inner.y - before.mountA.y);
  const wasRod = Math.hypot(before.mountB.x - before.seal.x, before.mountB.y - before.seal.y);
  const wasAlong = Math.hypot(before.seal.x - before.mountA.x, before.seal.y - before.mountA.y);
  // Lengths first: a rung that resizes a member is the one that keeps both end
  // joints, so reading the ends first would call it "nothing moved".
  if (typed !== 'barrel' && Math.abs(after.barrel - wasBarrel) > 1e-6) return 'barrel';
  if (typed !== 'rod' && Math.abs(after.rod - wasRod) > 1e-6) return 'rod';
  if (moved(before.mountB, after.pose.mountB) && !moved(before.mountA, after.pose.mountA)) {
    return 'joint-b';
  }
  if (moved(before.mountA, after.pose.mountA) && !moved(before.mountB, after.pose.mountB)) {
    return 'joint-a';
  }
  if (Math.abs(after.along - wasAlong) > 1e-6) return 'seal';
  return 'nothing';
}

for (const edit of TABLE_EDITS) {
  describe(`${edit.name} climbs the ladder and takes the first rung that works`, () => {
    for (const row of everyRow()) {
      it(`gives what the ladder says with ${label(row)}`, () => {
        const part = tablePart();
        const ctx = contextFor(row);
        const freedom: CylinderFreedom = {
          a: row.a,
          b: row.b,
          seal: edit.seal,
          barrel: !row.barrelFixed && edit.typed !== 'barrel',
          rod: !row.rodFixed && edit.typed !== 'rod',
        };
        const answer = edit.at(part, ctx, edit.asked);

        expect(whatGave(part, answer, edit.typed)).toBe(whatGives(freedom)[0] ?? 'refused');

        if (!answer.ok || answer.stoppedBy) {
          // The ladder only runs out with *both* ends held: moving an end joint
          // is the rung that never fails.
          expect(row.a).toBe('locked');
          expect(row.b).toBe('locked');
        }
        if (!answer.ok) {
          expect(answer.refusal.long).toMatch(/joint A is locked/i);
          expect(answer.refusal.long).toMatch(/joint B is locked/i);
          return;
        }

        const after = reading(answer);
        if (answer.stoppedBy) {
          // Between where it stood and what was typed, and asking again for
          // exactly that much is an edit with nothing left to stop (S19).
          const { reached } = answer.stoppedBy;
          expect(reached).toBeGreaterThanOrEqual(Math.min(edit.standing, edit.asked) - 1e-9);
          expect(reached).toBeLessThanOrEqual(Math.max(edit.standing, edit.asked) + 1e-9);
          expect(Math.abs(reached - edit.standing)).toBeGreaterThan(1e-9);
          const again = edit.at(tablePart(), contextFor(row), reached);
          expect(again.ok && again.stoppedBy).toBeUndefined();
          expect(edit.landed(after, reached)).toBe(true);
        } else {
          expect(edit.landed(after, edit.asked)).toBe(true);
        }
        // 1. A locked item never moves.
        if (row.a === 'locked') expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
        if (row.b === 'locked') {
          expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 6);
          expect(after.pose.mountB.y).toBeCloseTo(part.mountB.y, 6);
        }
        if (row.barrelFixed && edit.typed !== 'barrel') {
          expect(after.barrel).toBeCloseTo(TABLE_BARREL, 6);
        }
        if (row.rodFixed && edit.typed !== 'rod') expect(after.rod).toBeCloseTo(TABLE_ROD, 6);
      });
    }
  });
}

// ------------------------------------------------------- the order, one rung
//                                                          at a time

/**
 * The table reads the order off `whatGives`, so it cannot catch the order
 * being wrong. These can: one named case per rung, saying what moved.
 */
describe('the ladder in the order the maintainer set (S17)', () => {
  const rows = (options: Partial<Row>): Row => ({
    a: 'floating',
    b: 'floating',
    barrelFixed: false,
    rodFixed: false,
    ...options,
  });

  it('moves the rod’s end joint first, because a floating joint is the cheapest thing there is', () => {
    const part = tablePart();
    const after = reading(poseForCylinderStart(part, TABLE_SHARE, contextFor(rows({}))));
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).not.toBeCloseTo(part.mountB.x, 6);
    expect(after.barrel).toBeCloseTo(TABLE_BARREL, 9);
    expect(after.rod).toBeCloseTo(TABLE_ROD, 9);
  });

  it('expands and contracts with both ends grounded rather than resizing a member', () => {
    const part = tablePart();
    const after = reading(
      poseForCylinderStart(part, TABLE_SHARE, contextFor(rows({ a: 'grounded', b: 'grounded' })))
    );
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeLessThan(part.mountB.x - 0.1);
    expect(after.barrel).toBeCloseTo(TABLE_BARREL, 9);
    expect(after.rod).toBeCloseTo(TABLE_ROD, 9);
  });

  it('does the same under a drag of the head, which is the same ladder', () => {
    const part = tablePart();
    const typed = reading(
      poseForCylinderStart(part, TABLE_SHARE, contextFor(rows({ a: 'grounded', b: 'grounded' })))
    );
    const dragged = reading(
      poseForSealAt(
        part,
        tablePoint(TABLE_SHARE),
        contextFor(rows({ a: 'grounded', b: 'grounded' }))
      )
    );
    expect(dragged.along).toBeCloseTo(typed.along, 9);
    expect(dragged.pose.mountB.x).toBeCloseTo(typed.pose.mountB.x, 9);
    expect(dragged.barrel).toBeCloseTo(TABLE_BARREL, 9);
    expect(dragged.rod).toBeCloseTo(TABLE_ROD, 9);
  });

  it('spends the grounded end when the other one is locked', () => {
    const part = tablePart();
    const after = reading(
      poseForCylinderStart(part, TABLE_SHARE, contextFor(rows({ a: 'grounded', b: 'locked' })))
    );
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.pose.mountA.x).not.toBeCloseTo(0, 6);
    expect(after.barrel).toBeCloseTo(TABLE_BARREL, 9);
    expect(after.rod).toBeCloseTo(TABLE_ROD, 9);
  });

  it('changes the rod’s length only when no end joint may move at all', () => {
    const part = tablePart();
    const after = reading(
      poseForCylinderStart(part, TABLE_SHARE, contextFor(rows({ a: 'locked', b: 'locked' })))
    );
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.barrel).toBeCloseTo(TABLE_BARREL, 9);
    expect(after.rod).not.toBeCloseTo(TABLE_ROD, 6);
  });

  it('and the barrel’s when the rod is keeping its length as well', () => {
    const part = tablePart();
    const after = reading(
      poseForCylinderStart(
        part,
        TABLE_SHARE,
        contextFor(rows({ a: 'locked', b: 'locked', rodFixed: true }))
      )
    );
    expect(after.rod).toBeCloseTo(TABLE_ROD, 9);
    expect(after.barrel).not.toBeCloseTo(TABLE_BARREL, 6);
  });

  it('and refuses when both are locked and both lengths are fixed', () => {
    const refusal = refusalOf(
      poseForCylinderStart(
        tablePart(),
        TABLE_SHARE,
        contextFor(rows({ a: 'locked', b: 'locked', barrelFixed: true, rodFixed: true }))
      )
    );
    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.short).toBe('nothing is free to move');
  });

  it('still slides the seal for a Rod Length before it spends a grounded joint', () => {
    const part = cylinder({ groundA: true, groundB: true });
    const span = cylinderSizeOf(part, R).span;
    const after = reading(poseForRodLength(part, 6.5, context()));
    expect(after.span).toBeCloseTo(span, 9);
    expect(after.rod).toBeCloseTo(6.5, 9);
    expect(after.along).toBeCloseTo(span - 6.5, 9);
  });

  it('and spends the grounded joint when sliding the seal leaves the travel', () => {
    const part = cylinder({ groundA: true, groundB: true });
    const after = reading(poseForRodLength(part, 9, context()));
    expect(after.rod).toBeCloseTo(9, 9);
    expect(after.barrel).toBeCloseTo(6, 9);
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeGreaterThan(part.mountB.x);
  });
});

// ------------------------------------------------- the two reported scenarios

describe('a standard cylinder, fully open, with nothing locked', () => {
  /** Barrel and rod equal, as a creation gesture draws them, opened all the way. */
  function openRam() {
    return cylinder({ barrel: 6, rod: 6, along: cylinderStrokeAlong(6, R).max });
  }

  it('shortens the barrel to fit a rod typed under the travel, and stays fully open', () => {
    const part = openRam();
    const after = reading(poseForRodLength(part, 3, context()));

    expect(after.rod).toBeCloseTo(3, 9);
    // The longest barrel a rod of 3 allows, which is the smallest change that
    // makes the typed number legal.
    expect(after.barrel).toBeCloseTo(3 + CLEARANCE, 9);
    const travel = cylinderStrokeAlong(after.barrel, R);
    expect((after.along - travel.min) / (travel.max - travel.min)).toBeCloseTo(1, 9);
    // The barrel's own joint is the one thing that did not move.
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeLessThan(part.mountB.x);
  });

  it('lets the head follow a shortened barrel to its new stop, and brings B in', () => {
    const part = openRam();
    const after = reading(poseForBarrelLength(part, 3, context()));

    expect(after.barrel).toBeCloseTo(3, 9);
    expect(after.rod).toBeCloseTo(6, 9);
    const travel = cylinderStrokeAlong(3, R);
    expect(after.along).toBeCloseTo(travel.max, 9);
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeLessThan(part.mountB.x);
  });
});

describe('a repair changes the other member by exactly the deficit', () => {
  it('shortens the barrel by what the rod fell short of its floor', () => {
    for (const rod of [5, 3, 1]) {
      const part = cylinder({ barrel: 6, rod: 6 });
      const deficit = cylinderRodFloor(6, R) - rod;
      const after = reading(poseForRodLength(part, rod, context()));
      expect(6 - after.barrel).toBeCloseTo(deficit, 9);
    }
  });

  it('lengthens the rod by what the barrel’s new travel outgrew it', () => {
    for (const barrel of [8, 10, 14]) {
      const part = cylinder({ barrel: 6, rod: 6 });
      const deficit = cylinderRodFloor(barrel, R) - 6;
      const after = reading(poseForBarrelLength(part, barrel, context()));
      expect(after.rod - 6).toBeCloseTo(deficit, 9);
      expect(after.rod).toBeCloseTo(cylinderStroke(barrel, R), 9);
    }
  });

  it('leaves both members alone when the typed number needs no repair', () => {
    const part = cylinder({ barrel: 6, rod: 9 });
    expect(reading(poseForRodLength(part, 8, context())).barrel).toBeCloseTo(6, 9);
    expect(reading(poseForBarrelLength(part, 7, context())).rod).toBeCloseTo(9, 9);
  });
});

// ------------------------------------------- as far as it goes, and why (S19)

describe('a number that cannot be fully honored is honored as far as it goes', () => {
  it('the maintainer’s case: a 3 cm rod fixed, a 1 cm barrel, and 4 cm typed', () => {
    // The barrel may grow only until its travel equals the rod, which is
    // `rod + clearance`, and it goes exactly there rather than refusing.
    const part = cylinder({ barrel: 1, rod: 3, along: 1 });
    const answer = poseForBarrelLength(part, 4, context({ holds: { rod: true } }));
    const stop = stopOf(answer);

    expect(reading(answer).barrel).toBeCloseTo(3 + CLEARANCE, 9);
    expect(reading(answer).rod).toBeCloseTo(3, 9);
    expect(stop.reached).toBeCloseTo(3 + CLEARANCE, 9);
    expect(stop.code).toBe('cylinder.barrel-length-stopped-short');
    expect(stop.cause).toContain('fixed length SB');
    expect(stop.cause).toContain('more travel than the rod is long');
  });

  it('the mirror: a barrel keeping its length, and a rod typed under the travel', () => {
    const part = cylinder({ barrel: 6, rod: 6 });
    const answer = poseForRodLength(part, 1, context({ holds: { barrel: true } }));
    const stop = stopOf(answer);

    expect(reading(answer).rod).toBeCloseTo(cylinderStroke(6, R), 9);
    expect(reading(answer).barrel).toBeCloseTo(6, 9);
    expect(stop.reached).toBeCloseTo(cylinderRodFloor(6, R), 9);
    expect(stop.code).toBe('cylinder.rod-length-stopped-short');
    expect(stop.cause).toContain('fixed length AN');
  });

  it('a barrel typed under the floor goes down to the floor', () => {
    const part = cylinder();
    const answer = poseForBarrelLength(part, 0.01, context());
    const stop = stopOf(answer);

    expect(stop.reached).toBeCloseTo(cylinderBarrelFloor(R), 5);
    expect(reading(answer).barrel).toBeCloseTo(cylinderBarrelFloor(R), 5);
    expect(stop.cause).toContain('no travel left in it');
  });

  it('a rod typed under any cylinder at all goes down to the shortest there is', () => {
    const part = cylinder();
    const answer = poseForRodLength(part, 1e-3, context());
    const stop = stopOf(answer);

    // The rod that leaves a barrel exactly on its own floor.
    expect(stop.reached).toBeCloseTo(cylinderBarrelFloor(R) - CLEARANCE, 5);
    expect(stop.cause).toContain('no barrel with room to slide in');
  });

  it('Starts at with both ends locked opens until the rod is on its floor', () => {
    const part = cylinder({ barrel: 6, rod: 6 });
    const answer = poseForCylinderStart(
      part,
      1,
      context({ isLocked: () => true, holds: { barrel: true } })
    );
    const stop = stopOf(answer);
    const after = reading(answer);

    expect(after.rod).toBeCloseTo(cylinderRodFloor(6, R), 6);
    expect(after.barrel).toBeCloseTo(6, 9);
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 6);
    expect(stop.code).toBe('cylinder.start-stopped-short');
    expect(stop.cause).toMatch(/joint A is locked/i);
    expect(stop.reached).toBeGreaterThan(part.start);
    expect(stop.reached).toBeLessThan(1);
  });

  it('refuses outright, and changes nothing, when none of the request can be had', () => {
    const part = cylinder();
    const shut = context({ isLocked: () => true, holds: { barrel: true, rod: true } });
    for (const answer of [
      poseForCylinderStart(part, 1, shut),
      poseForCylinderAngle(part, 1, shut),
    ]) {
      const refusal = refusalOf(answer);
      expect(refusal.short).toBe('nothing is free to move');
      expect(refusal.long).toMatch(/joint A is locked/i);
    }
  });

  it('says nothing and stops short of nothing when the number is fully reachable', () => {
    const answer = poseForBarrelLength(cylinder({ rod: 9 }), 7, context());
    expect(answer.ok && answer.stoppedBy).toBeUndefined();
  });
});

// --------------------------------------------------- the refusals that remain

describe('what a cylinder still refuses, and why', () => {
  it('refuses only when both ends are held, and names the holds and the lengths', () => {
    const refusal = refusalOf(
      poseForCylinderStart(
        cylinder(),
        1,
        context({
          isLocked: (joint) => joint.id === 'A',
          heldBy: heldBy('Held by fixed angle BC', 'B'),
          holds: { barrel: true, rod: true },
        })
      )
    );
    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.short).toBe('nothing is free to move');
    expect(refusal.long).toMatch(/joint A is locked/i);
    expect(refusal.long).toContain('held by fixed angle BC');
    expect(refusal.long).toContain('fixed length AN');
    expect(refusal.long).toContain('release a fixed length');
  });

  it('tries the other end before refusing when one end is held by a bar', () => {
    const part = cylinder();
    const after = reading(
      poseForCylinderStart(part, 1, context({ heldBy: heldBy('Held by fixed angle BC', 'B') }))
    );
    // B is the end the ladder reaches for first, and a held bar takes it out of
    // the ladder rather than refusing the whole edit.
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.pose.mountA.x).not.toBeCloseTo(0, 6);
  });

  it('says nothing at all when a drag has nowhere to go', () => {
    const parked = cylinder({ along: cylinderStrokeAlong(6, R).max });
    expect(refusalOf(poseForSealAt(parked, { x: 99, y: 0 }, context())).silent).toBe(true);
    expect(
      refusalOf(
        poseForSealAt(
          cylinder(),
          { x: 4, y: 0 },
          context({ isLocked: () => true, holds: { barrel: true, rod: true } })
        )
      ).silent
    ).toBe(true);
  });
});

describe('a part with nothing to read', () => {
  it('refuses every edit rather than guessing an axis', () => {
    const part = cylinder({ barrel: CLEARANCE / 2, rod: 1, along: 0.2 });
    expect(refusalOf(poseForCylinderAngle(part, 1, context())).short).toBe(
      'the cylinder is not built'
    );
    expect(refusalOf(poseForCylinderStart(part, 1, context())).short).toBe(
      'the cylinder is not built'
    );
    expect(refusalOf(poseForRodLength(part, 5, context())).short).toBe('the cylinder is not built');
    expect(refusalOf(poseForSealAt(part, { x: 1, y: 0 }, context())).silent).toBe(true);
  });
});

// ------------------------------------------- what the ladder did not change

describe('one angle, turned about whatever cannot move (D10, S17)', () => {
  /** Which joint the ladder leaves standing, per what the two ends may do. */
  function pivotFor(row: Row): 'seal' | 'A' | 'B' | 'refused' {
    if (row.a === 'floating' && row.b === 'floating') return 'seal';
    if (row.a === 'floating') return 'B';
    if (row.b === 'floating') return 'A';
    if (row.a === 'locked' && row.b === 'locked') return 'refused';
    if (row.a === 'locked') return 'A';
    if (row.b === 'locked') return 'B';
    // Both grounded: the typed number outranks a grounded joint.
    return 'A';
  }

  for (const row of everyRow()) {
    it(`turns about the right joint with ${label(row)}`, () => {
      const part = tablePart();
      const was = {
        A: { x: part.mountA.x, y: part.mountA.y },
        B: { x: part.mountB.x, y: part.mountB.y },
        seal: { x: part.seal.x, y: part.seal.y },
      };
      const answer = poseForCylinderAngle(part, 1, contextFor(row));
      const expected = pivotFor(row);
      if (expected === 'refused') {
        const refusal = refusalOf(answer);
        expect(refusal.code).toBe('cylinder.angle-refused');
        expect(refusal.long).toMatch(/joint A is locked/i);
        return;
      }

      const after = reading(answer);
      expect(after.angle).toBeCloseTo(1, 9);
      // Rigid: an angle never resizes anything, so no hold can be in its way.
      expect(after.barrel).toBeCloseTo(TABLE_BARREL, 9);
      expect(after.rod).toBeCloseTo(TABLE_ROD, 9);
      const landed = { seal: after.pose.seal, A: after.pose.mountA, B: after.pose.mountB }[
        expected
      ];
      expect(landed.x).toBeCloseTo(was[expected].x, 9);
      expect(landed.y).toBeCloseTo(was[expected].y, 9);
      if (row.a === 'locked') expect(after.pose.mountA).toEqual(was.A);
      if (row.b === 'locked') {
        expect(after.pose.mountB.x).toBeCloseTo(was.B.x, 9);
        expect(after.pose.mountB.y).toBeCloseTo(was.B.y, 9);
      }
    });
  }

  it('does not ask about locks when the number is the angle it already has', () => {
    const part = cylinder();
    expect(poseForCylinderAngle(part, 0, context({ isLocked: () => true })).ok).toBe(true);
  });
});

describe('the rungs D11 and S6 already had still answer the same way', () => {
  const travel = cylinderStrokeAlong(6, R);

  it('moves the rod’s joint for Starts at by default, leaving the barrel where it is', () => {
    const after = reading(poseForCylinderStart(cylinder(), 1, context()));
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.along).toBeCloseTo(travel.max, 9);
    expect(after.rod).toBeCloseTo(6, 9);
    expect(after.barrel).toBeCloseTo(6, 9);
  });

  it('slides the barrel back instead when the rod’s joint is grounded', () => {
    const part = cylinder({ groundB: true });
    const after = reading(poseForCylinderStart(part, 0, context()));
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.along).toBeCloseTo(travel.min, 9);
    expect(after.pose.mountA.x).toBeGreaterThan(0);
  });

  it('moves only the buried end for a Barrel Length the part can already hold', () => {
    const part = cylinder({ rod: 9 });
    const after = reading(poseForBarrelLength(part, 7, context()));
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.seal.x).toBeCloseTo(part.seal.x, 9);
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.barrel).toBeCloseTo(7, 9);
  });

  it('projects a seal drag onto the axis and takes the rod with it', () => {
    const part = cylinder();
    const after = reading(poseForSealAt(part, { x: 4, y: 3 }, context()));
    expect(after.along).toBeCloseTo(4, 9);
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.rod).toBeCloseTo(6, 9);
  });

  it('clamps a seal drag at the stops rather than telescoping out of the barrel', () => {
    const part = cylinder();
    expect(reading(poseForSealAt(part, { x: 99, y: 0 }, context())).along).toBeCloseTo(
      travel.max,
      9
    );
    expect(reading(poseForSealAt(part, { x: -99, y: 0 }, context())).along).toBeCloseTo(
      travel.min,
      9
    );
  });
});
