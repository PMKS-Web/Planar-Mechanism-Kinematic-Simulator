import './joint';
import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';
import {
  Cylinder,
  HEAD_CLEARANCE_R,
  cylinderAtSeal,
  cylinderBarrelFloor,
  cylinderHeadTravel,
  cylinderRodFloor,
  cylinderStrokeAlong,
} from './cylinder';
import { CylinderEditContext, rescaleCylinder } from './cylinder-edit';
import { planCylinderRescale, planDerivedInteriors } from './cylinder-interiors';

/**
 * What a change of Object Size does to a cylinder (decision S29).
 *
 * The maintainer's report was *"when I re-size objects, cylinders become weird
 * visually — try a fully expanded cylinder, then reduce the object size"*, and
 * the reason is arithmetic rather than taste: the head's own length and the
 * clearance behind it are measured in R, the four joints and the two member
 * lengths are not, so the travel moves out from under a head that stayed where
 * it was. What this file pins is the promise made in answer to it — **no joint
 * a reader can see moves, and the part is never left in two pieces** — and the
 * two cases where the second has to give way, said out loud rather than
 * quietly.
 */

/** The size a drawing starts at, and the R it implies. */
const R = 0.15;

function cylinder(
  options: { barrel?: number; rod?: number; along?: number; angle?: number } = {}
): Cylinder {
  const barrel = options.barrel ?? 6;
  const rod = options.rod ?? 6;
  const along = options.along ?? cylinderStrokeAlong(barrel, R).min + 2;
  const angle = options.angle ?? 0;
  const at = (d: number) => [d * Math.cos(angle), d * Math.sin(angle)] as const;

  const mountA = new RevJoint('A', 0, 0);
  const inner = new RevJoint('N', ...at(barrel));
  const seal = new PrisJoint('S', ...at(along));
  const mountB = new RevJoint('B', ...at(along + rod));
  const barrelBar = new RealLink('AN', [mountA, inner]);
  const rodBar = new RealLink('SB', [seal, mountB]);
  [mountA, inner].forEach((joint) => joint.links.push(barrelBar));
  [seal, mountB].forEach((joint) => joint.links.push(rodBar));
  seal.slideOn(barrelBar, mountA, inner);
  seal.isSealed = true;
  seal.rotates = false;
  return cylinderAtSeal(seal)!;
}

/** A cylinder standing exactly at the open end of its travel, as drawn at `r`. */
function fullyOpen(r: number, barrel = 6): Cylinder {
  return cylinder({ barrel, rod: barrel, along: cylinderHeadTravel(barrel, r).max });
}

function context(r: number, overrides: Partial<CylinderEditContext> = {}): CylinderEditContext {
  return {
    r,
    isGrounded: () => false,
    isLocked: () => false,
    holds: {},
    ...overrides,
  };
}

const span = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

/** Everything a reader can point at, to compare before and after. */
const visible = (one: Cylinder) => ({
  a: { x: one.mountA.x, y: one.mountA.y },
  b: { x: one.mountB.x, y: one.mountB.y },
  s: { x: one.seal.x, y: one.seal.y },
});

/** Is the head inside its own barrel's travel, and are both members legal? */
function whole(one: Cylinder, r: number, barrel = span(one.mountA, one.inner)): boolean {
  const rod = span(one.seal, one.mountB);
  const along = span(one.mountA, one.seal);
  const travel = cylinderHeadTravel(barrel, r);
  return (
    barrel >= cylinderBarrelFloor(r) - 1e-9 &&
    along >= travel.min - 1e-9 &&
    along <= travel.max + 1e-9 &&
    rod > 0
  );
}

/** Write the answer back onto the part, the way the service commits it. */
function apply(one: Cylinder, r: number): ReturnType<typeof rescaleCylinder> {
  const answer = rescaleCylinder(one, context(r));
  if (!answer.whole && 'pose' in answer) {
    one.inner.x = answer.pose.inner.x;
    one.inner.y = answer.pose.inner.y;
  }
  return answer;
}

// --------------------------------------------------------- nothing to repair

describe('a size a cylinder can follow', () => {
  it('leaves a part standing mid-stroke exactly alone', () => {
    const one = cylinder();
    const before = visible(one);
    const barrel = span(one.mountA, one.inner);
    for (const r of [R * 0.9, R * 1.1]) {
      expect(rescaleCylinder(one, context(r)).whole).toBe(true);
    }
    expect(visible(one)).toEqual(before);
    expect(span(one.mountA, one.inner)).toBe(barrel);
  });

  it('says nothing at all about a drawing with no cylinders in it', () => {
    const plan = planCylinderRescale(
      [],
      () => context(R),
      () => ''
    );
    expect(plan.placements.size).toBe(0);
    expect(plan.refusals).toEqual([]);
  });
});

// ------------------------------------------------- the maintainer's own case

describe('a fully open cylinder under a smaller Object Size', () => {
  it('brings the barrel’s mouth out to meet the head, and moves no visible joint', () => {
    const one = fullyOpen(R);
    const before = visible(one);
    const barrel = span(one.mountA, one.inner);
    const half = R / 2;

    // Broken first: this is the gap the maintainer saw.
    expect(whole(one, half)).toBe(false);

    const answer = apply(one, half);
    expect(answer.whole).toBe(false);
    expect(whole(one, half)).toBe(true);
    expect(span(one.mountA, one.inner)).toBeGreaterThan(barrel);
    // To 1e-9, which is three orders below anything a URL can express.
    expect(visible(one).a.x).toBeCloseTo(before.a.x, 9);
    expect(visible(one).b.x).toBeCloseTo(before.b.x, 9);
    expect(visible(one).s.x).toBeCloseTo(before.s.x, 9);
  });

  it('keeps *Starts at* at 100%, because the head is still at the mouth', () => {
    const one = fullyOpen(R);
    const half = R / 2;
    apply(one, half);
    const travel = cylinderHeadTravel(span(one.mountA, one.inner), half);
    const along = span(one.mountA, one.seal);
    expect((along - travel.min) / (travel.max - travel.min)).toBeCloseTo(1, 9);
  });

  it('outruns the rod’s floor rather than leave the part in two pieces', () => {
    // A cylinder drawn with equal members clears its rod floor by exactly one
    // clearance, and the head shrinks by `headAlongHalfMax` of the shortfall --
    // so any reduction past about three quarters needs a barrel the rod is not
    // long enough for. The reach wins, and the answer says which branch ran.
    const one = fullyOpen(R);
    const half = R / 2;
    const answer = rescaleCylinder(one, context(half));
    expect(answer.whole).toBe(false);
    if (answer.whole || !('pose' in answer)) throw new Error('expected a repair');
    expect(answer.pastRodFloor).toBe(true);
    expect(answer.barrel).toBeGreaterThan(
      span(one.seal, one.mountB) + HEAD_CLEARANCE_R * half + 1e-9
    );
  });

  it('honors the rod’s floor where the two can both be had', () => {
    // A tenth off the size is well inside the margin equal members carry.
    const one = fullyOpen(R);
    const gentle = R * 0.95;
    const answer = rescaleCylinder(one, context(gentle));
    if (answer.whole || !('pose' in answer)) throw new Error('expected a repair');
    expect(answer.pastRodFloor).toBe(false);
    expect(answer.barrel).toBeLessThanOrEqual(
      span(one.seal, one.mountB) + HEAD_CLEARANCE_R * gentle + 1e-9
    );
  });
});

describe('a nearly shut cylinder under a larger Object Size', () => {
  it('shortens the barrel so the head is not through its own closed end', () => {
    const one = cylinder({ along: cylinderHeadTravel(6, R).min });
    const before = visible(one);
    const bigger = R * 1.6;
    expect(whole(one, bigger)).toBe(false);

    apply(one, bigger);
    expect(whole(one, bigger)).toBe(true);
    expect(visible(one).b.x).toBeCloseTo(before.b.x, 9);
    expect(visible(one).s.x).toBeCloseTo(before.s.x, 9);
  });
});

describe('a barrel walked under its own floor', () => {
  it('is given back the shortest barrel that has any travel in it', () => {
    // A barrel a hair over the floor at the size it was drawn at is under the
    // floor the moment R grows, and then the part has no travel at all --
    // which is the state readiness reports as "no travel: ... or reduce Object
    // Size". The repair gives it the floor back.
    const one = fullyOpen(R, cylinderBarrelFloor(R) * 1.05);
    const bigger = (R * 4) / 3;
    expect(span(one.mountA, one.inner)).toBeLessThan(cylinderBarrelFloor(bigger));
    expect(cylinderStrokeAlong(span(one.mountA, one.inner), bigger).usable).toBe(false);

    apply(one, bigger);
    expect(span(one.mountA, one.inner)).toBeGreaterThanOrEqual(cylinderBarrelFloor(bigger) - 1e-9);
    expect(whole(one, bigger)).toBe(true);
  });

  it('leaves a part it cannot give a travel back to, and says so', () => {
    // Twice the size is too much for the same part: the shortest barrel with
    // any travel in it already has its shut position past where the head
    // stands, and reaching it would mean moving the seal.
    const one = fullyOpen(R, cylinderBarrelFloor(R) * 1.05);
    expect(rescaleCylinder(one, context(R * 2))).toEqual({
      whole: false,
      blocked: 'no-barrel-reaches',
    });
  });
});

// --------------------------------------------------------- what does not give

describe('what a size change may not spend', () => {
  it('leaves a barrel that holds its length exactly as it is, and says so', () => {
    const one = fullyOpen(R);
    const before = visible(one);
    const barrel = span(one.mountA, one.inner);
    const answer = rescaleCylinder(one, context(R / 2, { holds: { barrel: true } }));
    expect(answer).toEqual({ whole: false, blocked: 'fixed-length' });
    expect(span(one.mountA, one.inner)).toBe(barrel);
    expect(visible(one)).toEqual(before);
  });

  it('refuses where only moving a visible joint could fix it', () => {
    // The head standing closer to its mount than the shortest barrel's own
    // clearance: no barrel is short enough to leave it inside the travel, and
    // reaching it would mean moving the seal.
    const one = cylinder({ barrel: 6, rod: 6, along: 0.05 });
    const answer = rescaleCylinder(one, context(R * 3));
    expect(answer).toEqual({ whole: false, blocked: 'no-barrel-reaches' });
  });

  it('never moves the rod, whose length is two joints that are both staying', () => {
    const one = fullyOpen(R);
    const rod = span(one.seal, one.mountB);
    apply(one, R / 2);
    expect(span(one.seal, one.mountB)).toBeCloseTo(rod, 9);
  });
});

// ------------------------------------------------------------ the guarantees

describe('applying a size twice', () => {
  it('changes nothing the second time', () => {
    const one = fullyOpen(R);
    const half = R / 2;
    apply(one, half);
    const settled = span(one.mountA, one.inner);
    expect(apply(one, half).whole).toBe(true);
    expect(span(one.mountA, one.inner)).toBe(settled);
  });

  it('does not claim a round trip back up, and is whole at every step', () => {
    // Down and back up is not the identity and is not pretended to be: the
    // barrel that made the part whole at the smaller size is a real length the
    // drawing now has, and the larger size has no reason to undo it. What is
    // promised is that the part is drawable at *every* size it passes through.
    const one = fullyOpen(R);
    const grown = span(one.mountA, one.inner);
    apply(one, R / 2);
    expect(whole(one, R / 2)).toBe(true);
    apply(one, R);
    expect(whole(one, R)).toBe(true);
    expect(span(one.mountA, one.inner)).not.toBeCloseTo(grown, 6);
  });
});

describe('the plan the service commits', () => {
  it('carries one placement, for the joint the drawing never shows', () => {
    const one = fullyOpen(R);
    const plan = planCylinderRescale(
      [one],
      () => context(R / 2),
      () => 'AB'
    );
    expect([...plan.placements.keys()]).toEqual([one.inner.id]);
    expect(plan.reshaped).toEqual([one.barrel]);
    expect(plan.refusals).toEqual([]);
    expect(plan.pastRodFloor).toEqual([one]);
  });

  it('words a refusal with the name the caller gave it, and no interior joint', () => {
    const one = fullyOpen(R);
    const plan = planCylinderRescale(
      [one],
      () => context(R / 2, { holds: { barrel: true } }),
      () => 'AD'
    );
    expect(plan.placements.size).toBe(0);
    expect(plan.refusals.length).toBe(1);
    expect(plan.refusals[0].text).toContain('Cylinder AD');
    expect(plan.refusals[0].text).toContain('Object Size');
    expect(plan.refusals[0].text).not.toContain(one.inner.id);
    // The reader's nouns: the block is a joint, an end is an end joint.
    expect(plan.refusals[0].text).not.toMatch(/\b(mount|head|seal|ram)\b/i);
  });
});

describe('the derivation that runs on every rebuild', () => {
  it('writes nothing for a cylinder that is already straight', () => {
    expect(planDerivedInteriors([cylinder()]).placements.size).toBe(0);
  });

  it('puts a nudged inner end back on the axis at its own barrel length', () => {
    const one = cylinder();
    const barrel = span(one.mountA, one.inner);
    one.inner.y += 0.4;
    const plan = planDerivedInteriors([one]);
    const put = plan.placements.get(one.inner.id)!;
    expect(put.y).toBeCloseTo(0, 9);
    // The length it already had, read off the bent pose, is what it keeps.
    expect(Math.hypot(put.x, put.y)).toBeCloseTo(Math.hypot(barrel, 0.4), 9);
    expect(plan.reshaped).toEqual([one.barrel]);
  });
});

describe('a cylinder drawn at an angle', () => {
  it('is repaired along its own axis, not along x', () => {
    const one = fullyOpen(R);
    const turned = cylinder({
      barrel: 6,
      rod: 6,
      along: cylinderHeadTravel(6, R).max,
      angle: Math.PI / 3,
    });
    apply(one, R / 2);
    apply(turned, R / 2);
    expect(span(turned.mountA, turned.inner)).toBeCloseTo(span(one.mountA, one.inner), 9);
    // Still exactly on the axis A->B.
    const axis = Math.atan2(turned.mountB.y - turned.mountA.y, turned.mountB.x - turned.mountA.x);
    const toInner = Math.atan2(turned.inner.y - turned.mountA.y, turned.inner.x - turned.mountA.x);
    expect(toInner).toBeCloseTo(axis, 9);
  });
});

describe('the rod floor is a ceiling, never a reason to repair', () => {
  it('leaves a drawable part alone even where its travel has outgrown its rod', () => {
    // A short rod beside a long barrel: shrinking R lengthens the stroke past
    // the rod. Nothing about the picture is wrong -- the head is inside its
    // barrel -- and the only way to satisfy the floor is to shorten the barrel,
    // which would be a second silent edit arguing with the first.
    const barrel = 6;
    const rod = cylinderRodFloor(barrel, R) + 0.02;
    const one = cylinder({ barrel, rod, along: cylinderHeadTravel(barrel, R).min + 0.5 });
    const smaller = R * 0.6;
    expect(rod).toBeLessThan(cylinderRodFloor(barrel, smaller));

    expect(rescaleCylinder(one, context(smaller)).whole).toBe(true);
  });

  it('does not pull back the barrel the smaller size grew, when the size goes up again', () => {
    // This is the undo path: the repair at the small size deliberately outran
    // the floor, and putting the size back must not quietly take it away.
    const one = fullyOpen(R);
    apply(one, R / 2);
    const repaired = span(one.mountA, one.inner);
    expect(repaired).toBeGreaterThan(span(one.seal, one.mountB) + HEAD_CLEARANCE_R * R);

    expect(rescaleCylinder(one, context(R)).whole).toBe(true);
    expect(span(one.mountA, one.inner)).toBe(repaired);
  });
});
