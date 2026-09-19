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
  poseForBarrelLength,
  poseForCylinderAngle,
  poseForCylinderStart,
  poseForRodLength,
  poseForSealAt,
} from './cylinder-edit';

/**
 * What each field and each gesture asks the part for, and what it is told when
 * the part cannot do it (decisions D10, D11, S6 and S7).
 *
 * Every case here is about the *tiebreak*: a cylinder has more ways to satisfy
 * a number than it has freedoms, so what gives is decided by what is bolted
 * down and what is fixed at a length. The refusals are half the file on
 * purpose — an edit that quietly did something adjacent to what was asked is
 * the failure this ladder exists to prevent, and a refusal that changes nothing
 * is the promise it keeps.
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
    holds: {},
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
const heldBy = (sentence: string) => (displaced: { id: string }[]) =>
  displaced.length > 0 ? sentence : undefined;

function refusalOf(edit: CylinderEdit) {
  if (edit.ok) throw new Error('expected a refusal');
  return edit.refusal;
}

describe('one angle, turned about the joint that can hold it (D10)', () => {
  it('turns about the seal when nothing is grounded', () => {
    const part = cylinder();
    const before = { x: part.seal.x, y: part.seal.y };
    const after = reading(poseForCylinderAngle(part, Math.PI / 2, context()));

    expect(after.angle).toBeCloseTo(Math.PI / 2, 9);
    expect(after.pose.seal.x).toBeCloseTo(before.x, 9);
    expect(after.pose.seal.y).toBeCloseTo(before.y, 9);
    // Rigid: both members keep the length they had.
    expect(after.barrel).toBeCloseTo(6, 9);
    expect(after.rod).toBeCloseTo(6, 9);
  });

  it('turns about the grounded joint when exactly one is grounded', () => {
    for (const grounded of ['A', 'B'] as const) {
      const part = cylinder(grounded === 'A' ? { groundA: true } : { groundB: true });
      const pivot = grounded === 'A' ? part.mountA : part.mountB;
      const was = { x: pivot.x, y: pivot.y };
      const after = reading(poseForCylinderAngle(part, 1, context()));

      expect(after.angle).toBeCloseTo(1, 9);
      const landed = grounded === 'A' ? after.pose.mountA : after.pose.mountB;
      expect(landed.x).toBeCloseTo(was.x, 9);
      expect(landed.y).toBeCloseTo(was.y, 9);
    }
  });

  it('refuses with both grounded, because the frame settles the direction', () => {
    const refusal = refusalOf(
      poseForCylinderAngle(cylinder({ groundA: true, groundB: true }), 1, context())
    );
    expect(refusal.code).toBe('cylinder.angle-refused');
    expect(refusal.short).toBe('both joints are grounded');
    expect(refusal.long).toContain('Unground one of them');
  });

  it('refuses when a fixed bar elsewhere would have to move', () => {
    const refusal = refusalOf(
      poseForCylinderAngle(cylinder(), 1, context({ heldBy: heldBy('Held by fixed length OA') }))
    );
    expect(refusal.code).toBe('cylinder.angle-refused');
    expect(refusal.long).toContain('Held by fixed length OA');
  });

  it('does not ask about held bars when the number is the angle it already has', () => {
    const part = cylinder();
    const edit = poseForCylinderAngle(
      part,
      0,
      context({ heldBy: heldBy('Held by fixed angle OA') })
    );
    expect(edit.ok).toBe(true);
  });
});

describe('Starts at, and what gives (D11)', () => {
  const travel = cylinderStrokeAlong(6, R);

  it('moves the rod’s joint by default, leaving the barrel where it is', () => {
    const part = cylinder();
    const after = reading(poseForCylinderStart(part, 1, context()));

    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.along).toBeCloseTo(travel.max, 9);
    expect(after.rod).toBeCloseTo(6, 9);
    expect(after.barrel).toBeCloseTo(6, 9);
  });

  it('slides the barrel back instead when the rod’s joint is grounded', () => {
    const part = cylinder({ groundB: true });
    const wasB = { x: part.mountB.x, y: part.mountB.y };
    const wasSeal = { x: part.seal.x, y: part.seal.y };
    const after = reading(poseForCylinderStart(part, 0, context()));

    expect(after.pose.mountB.x).toBeCloseTo(wasB.x, 9);
    expect(after.pose.seal.x).toBeCloseTo(wasSeal.x, 9);
    expect(after.along).toBeCloseTo(travel.min, 9);
    expect(after.pose.mountA.x).toBeGreaterThan(0);
  });

  it('shortens the rod when both are grounded and the rod is free', () => {
    const part = cylinder({ rod: 12, groundA: true, groundB: true });
    const span = cylinderSizeOf(part, R).span;
    const after = reading(poseForCylinderStart(part, 1, context()));

    expect(after.span).toBeCloseTo(span, 9);
    expect(after.barrel).toBeCloseTo(6, 9);
    expect(after.along).toBeCloseTo(travel.max, 9);
    expect(after.rod).toBeCloseTo(span - travel.max, 9);
  });

  it('changes the barrel when both are grounded and the rod is fixed', () => {
    const part = cylinder({ rod: 12, groundA: true, groundB: true });
    const span = cylinderSizeOf(part, R).span;
    const after = reading(poseForCylinderStart(part, 0.25, context({ holds: { rod: true } })));

    expect(after.span).toBeCloseTo(span, 6);
    expect(after.rod).toBeCloseTo(12, 9);
    const grown = cylinderStrokeAlong(after.barrel, R);
    expect((after.along - grown.min) / (grown.max - grown.min)).toBeCloseTo(0.25, 6);
  });

  it('refuses when both are grounded and both lengths are fixed', () => {
    const refusal = refusalOf(
      poseForCylinderStart(
        cylinder({ groundA: true, groundB: true }),
        1,
        context({ holds: { barrel: true, rod: true } })
      )
    );
    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.short).toBe('too many fixed values');
  });

  it('refuses when the rod would end up shorter than the travel', () => {
    // A part already near closed: opening it fully with both ends bolted down
    // would have to eat the whole rod.
    const part = cylinder({ along: cylinderStrokeAlong(6, R).min, groundA: true, groundB: true });
    const refusal = refusalOf(poseForCylinderStart(part, 1, context()));

    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.short).toBe('the rod would be too short');
  });

  it('refuses when no barrel reaches it with the rod fixed', () => {
    // A cylinder already near the shortest one there is: opening it fully with
    // both ends bolted down would need a barrel below the floor.
    const part = cylinder({
      barrel: 0.5,
      rod: 3,
      along: cylinderStrokeAlong(0.5, R).min,
      groundA: true,
      groundB: true,
    });
    const refusal = refusalOf(poseForCylinderStart(part, 1, context({ holds: { rod: true } })));

    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.short).toBe('no barrel reaches it');
  });

  it('refuses when a fixed bar holds the joint that would move', () => {
    const refusal = refusalOf(
      poseForCylinderStart(cylinder(), 1, context({ heldBy: heldBy('Held by fixed angle BC') }))
    );
    expect(refusal.code).toBe('cylinder.start-refused');
    expect(refusal.long).toContain('Held by fixed angle BC');
  });
});

describe('Barrel Length moves the buried end and nothing else (S6)', () => {
  it('leaves both joints and the seal exactly where they were', () => {
    const part = cylinder({ rod: 9 });
    const after = reading(poseForBarrelLength(part, 7, context()));

    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.seal.x).toBeCloseTo(part.seal.x, 9);
    expect(after.pose.mountB.x).toBeCloseTo(part.mountB.x, 9);
    expect(after.barrel).toBeCloseTo(7, 9);
    // The travel changed under a seal that did not move, so the share it
    // stands at changed with it -- which is the whole of what this edit does.
    const grown = cylinderStrokeAlong(7, R);
    expect(after.along).toBeGreaterThan(grown.min);
    expect(after.along).toBeLessThan(grown.max);
  });

  it('refuses a barrel with no travel left in it', () => {
    const refusal = refusalOf(
      poseForBarrelLength(cylinder(), cylinderBarrelFloor(R) / 2, context())
    );
    expect(refusal.code).toBe('cylinder.barrel-length-refused');
    expect(refusal.short).toBe('no room to slide');
  });

  it('refuses a barrel whose travel would outgrow the rod', () => {
    const part = cylinder({ rod: 4, along: cylinderStrokeAlong(6, R).min + 1 });
    const refusal = refusalOf(poseForBarrelLength(part, 12, context()));

    expect(refusal.code).toBe('cylinder.barrel-length-refused');
    expect(refusal.short).toBe('longer than the rod');
  });

  it('refuses a barrel too short to reach where the rod is standing', () => {
    const part = cylinder({ barrel: 12, rod: 14, along: cylinderStrokeAlong(12, R).max });
    const refusal = refusalOf(poseForBarrelLength(part, cylinderBarrelFloor(R) * 1.2, context()));

    expect(refusal.code).toBe('cylinder.barrel-length-refused');
    expect(refusal.short).toBe('too short to reach');
  });

  it('refuses a barrel that would swallow the joint', () => {
    // On a short cylinder the head follows the barrel up, and so does the
    // closed stop -- past where this seal is already standing.
    const part = cylinder({ barrel: 0.5, rod: 3, along: cylinderStrokeAlong(0.5, R).min });
    const refusal = refusalOf(poseForBarrelLength(part, 1, context()));

    expect(refusal.code).toBe('cylinder.barrel-length-refused');
    expect(refusal.short).toBe('too long for the pose');
  });
});

describe('Rod Length moves the far joint, unless the frame holds it (S6)', () => {
  it('moves the far joint by default', () => {
    const part = cylinder();
    const after = reading(poseForRodLength(part, 9, context()));

    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.pose.seal.x).toBeCloseTo(part.seal.x, 9);
    expect(after.rod).toBeCloseTo(9, 9);
    expect(after.span).toBeCloseTo(part.seal.x + 9, 9);
  });

  it('slides the barrel back when the far joint is grounded', () => {
    const part = cylinder({ groundB: true });
    const wasB = { x: part.mountB.x, y: part.mountB.y };
    const along = cylinderSizeOf(part, R).span - 6;
    const after = reading(poseForRodLength(part, 9, context()));

    expect(after.pose.mountB.x).toBeCloseTo(wasB.x, 9);
    expect(after.rod).toBeCloseTo(9, 9);
    // The seal keeps its place along the barrel; the whole barrel end moved.
    expect(after.along).toBeCloseTo(along, 9);
    expect(after.pose.mountA.x).toBeCloseTo(wasB.x - along - 9, 9);
  });

  it('slides the seal when both joints are grounded', () => {
    const part = cylinder({ groundA: true, groundB: true });
    const span = cylinderSizeOf(part, R).span;
    const after = reading(poseForRodLength(part, 6.5, context()));

    expect(after.span).toBeCloseTo(span, 9);
    expect(after.rod).toBeCloseTo(6.5, 9);
    expect(after.along).toBeCloseTo(span - 6.5, 9);
  });

  it('refuses a rod shorter than the travel', () => {
    const refusal = refusalOf(
      poseForRodLength(cylinder(), cylinderRodFloor(6, R) - 0.01, context())
    );
    expect(refusal.code).toBe('cylinder.rod-length-refused');
    expect(refusal.short).toBe('shorter than the travel');
  });

  it('refuses a rod that would put a doubly grounded cylinder past its stop', () => {
    const part = cylinder({ groundA: true, groundB: true });
    const refusal = refusalOf(poseForRodLength(part, 9, context()));

    expect(refusal.code).toBe('cylinder.rod-length-refused');
    expect(refusal.short).toBe('it would not reach');
  });

  it('refuses when a fixed bar holds the joint that would move', () => {
    const refusal = refusalOf(
      poseForRodLength(cylinder(), 9, context({ heldBy: heldBy('Held by fixed length BC') }))
    );
    expect(refusal.long).toContain('Held by fixed length BC');
  });
});

describe('dragging the seal is Starts at by hand (S7)', () => {
  it('projects the pointer onto the axis and takes the rod with it', () => {
    const part = cylinder();
    const after = reading(poseForSealAt(part, { x: 4, y: 3 }, context()));

    expect(after.along).toBeCloseTo(4, 9);
    expect(after.pose.mountA).toEqual({ x: 0, y: 0 });
    expect(after.rod).toBeCloseTo(6, 9);
    expect(after.pose.mountB.x).toBeCloseTo(10, 9);
  });

  it('clamps at the stops rather than telescoping out of the barrel', () => {
    const part = cylinder();
    const travel = cylinderStrokeAlong(6, R);
    expect(reading(poseForSealAt(part, { x: 99, y: 0 }, context())).along).toBeCloseTo(
      travel.max,
      9
    );
    expect(reading(poseForSealAt(part, { x: -99, y: 0 }, context())).along).toBeCloseTo(
      travel.min,
      9
    );
  });

  it('slides the barrel back when the far joint is grounded', () => {
    const part = cylinder({ groundB: true });
    const wasB = { x: part.mountB.x, y: part.mountB.y };
    const after = reading(poseForSealAt(part, { x: 4, y: 0 }, context()));

    expect(after.along).toBeCloseTo(4, 9);
    expect(after.pose.mountB.x).toBeCloseTo(wasB.x, 9);
    expect(after.rod).toBeCloseTo(6, 9);
  });

  it('resizes nothing, and says nothing, with both joints grounded', () => {
    const refusal = refusalOf(
      poseForSealAt(cylinder({ groundA: true, groundB: true }), { x: 4, y: 0 }, context())
    );
    expect(refusal.code).toBe('cylinder.seal-refused');
    expect(refusal.silent).toBe(true);
  });

  it('is silent when the drag has nowhere to go', () => {
    const part = cylinder();
    // Already at the stop, and asked for more of the same.
    const travel = cylinderStrokeAlong(6, R);
    const parked = cylinder({ along: travel.max });
    expect(refusalOf(poseForSealAt(parked, { x: 99, y: 0 }, context())).silent).toBe(true);
    expect(
      refusalOf(
        poseForSealAt(part, { x: 4, y: 0 }, context({ heldBy: heldBy('Held by fixed length OA') }))
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
