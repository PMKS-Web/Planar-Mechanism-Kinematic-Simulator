import './joint';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { RealLink } from './link';
import {
  MERGE_REFUSAL_MESSAGES,
  MergeRefusal,
  refuseJointMerge,
  resolveDropCandidate,
  resolveJointDropTarget,
} from './drop-target';

/** Wire `joints` into one link, the way MechanismService keeps the graph. */
function connect(id: string, joints: RealJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => {
    joint.links.push(link);
    joints.filter((other) => other !== joint).forEach((other) => joint.connectedJoints.push(other));
  });
  return link;
}

describe('joint merge rules', () => {
  it('allows two joints that share no link', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 4, 0);
    const d = new RevJoint('D', 5, 0);
    connect('AB', [a, b]);
    connect('CD', [c, d]);

    expect(refuseJointMerge(b, c)).toBeUndefined();
  });

  it('refuses the two ends of one link, which would collapse it', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    connect('AB', [a, b]);

    expect(refuseJointMerge(a, b)).toBe('shares-a-link');
  });

  // Links A-B and A-C, with B dropped on C, would leave two rigid bars spanning
  // the same pair of points: a weld written as an accident.
  it('refuses a merge that would leave two links between the same pair', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 1, 1);
    connect('AB', [a, b]);
    connect('AC', [a, c]);

    expect(refuseJointMerge(b, c)).toBe('over-constrained');
  });

  // The same defect one step less obvious: B and C are already fixed relative
  // to each other by the ternary body, so a bar between them adds nothing and
  // over-constrains the pair. An exact-duplicate test misses this.
  it('refuses a bar that would double a pair already held by a ternary link', () => {
    const b = new RevJoint('B', -2.7, 0.9);
    const c = new RevJoint('C', 2.9, 2.2);
    const g = new RevJoint('G', 0.7, 0.8);
    const f = new RevJoint('F', 1, 4);
    connect('BCG', [b, c, g]);
    connect('BF', [b, f]);

    expect(refuseJointMerge(f, c)).toBe('over-constrained');
  });

  it('still allows a bar onto a ternary link when it doubles no pair', () => {
    const b = new RevJoint('B', -2.7, 0.9);
    const c = new RevJoint('C', 2.9, 2.2);
    const g = new RevJoint('G', 0.7, 0.8);
    const f = new RevJoint('F', 1, 4);
    const h = new RevJoint('H', 4, 6);
    connect('BCG', [b, c, g]);
    connect('FH', [f, h]);

    expect(refuseJointMerge(f, c)).toBeUndefined();
  });

  it('refuses a slider dragged onto another joint, whose slot would be left naming nothing', () => {
    // One direction only. The survivor of a merge is the target, so merging a
    // slider away takes the slot with it -- while dropping a pin *onto* a
    // slider is the pin-in-slot gesture and stays legal (below).
    const a = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('B', 1, 0, false, true);

    expect(refuseJointMerge(slider, a)).toBe('prismatic');
  });

  it('refuses a joint merged into itself', () => {
    const a = new RevJoint('A', 0, 0);

    expect(refuseJointMerge(a, a)).toBe('same-joint');
  });

  it('has a message for every refusal it can return', () => {
    const reasons: MergeRefusal[] = [
      'same-joint',
      'shares-a-link',
      'prismatic',
      'over-constrained',
      'not-a-real-joint',
    ];
    reasons.forEach((reason) => expect(MERGE_REFUSAL_MESSAGES[reason]).toBeTruthy());
  });
});

describe('merging onto sliders and welds', () => {
  /** A bar C-D, and a slider B on its own bar A-B, ready to be dropped on. */
  function pinAndSlider() {
    const a = new RevJoint('A', 0, 0);
    const b = new PrisJoint('B', 1, 0, false, true);
    const c = new RevJoint('C', 4, 0);
    connect('AB', [a, b]);
    connect('CD', [c, new RevJoint('D', 6, 0)]);
    return { a, b, c };
  }

  // Dropping a pin onto a slider is how a pin-in-slot gets built. It used to be
  // a drop onto the slider's coincident *pin*, which is the object Stage 1 of
  // `docs/joint-type-and-cylinder-plan.md` removed.
  it('allows a pin to be dropped onto a slider', () => {
    const { b, c } = pinAndSlider();

    expect(refuseJointMerge(c, b)).toBeUndefined();
  });

  it('refuses a slider dropped onto a plain pin', () => {
    const { b, c } = pinAndSlider();

    expect(refuseJointMerge(b, c)).toBe('prismatic');
  });

  it('refuses one slider onto another, which is a joint type rather than a merge', () => {
    // Caught by the source rule: a joint slides along one slot or none, and
    // there is no longer a shape in which two of them meet at a point.
    const { b } = pinAndSlider();
    const other = new PrisJoint('E', 4, 0, false, true);
    connect('EF', [other, new RevJoint('F', 6, 0)]);

    expect(refuseJointMerge(b, other)).toBe('prismatic');
  });

  it('allows a merge onto a welded joint, which the merge re-welds', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 2, 1);
    const x = new RevJoint('X', 5, 5);
    connect('ABC', [a, b, c]);
    connect('XY', [x, new RevJoint('Y', 7, 5)]);
    b.isWelded = true;

    expect(refuseJointMerge(x, b)).toBeUndefined();
  });

  it('offers a slider as a drop target', () => {
    // The slider is the joint with the hitbox now. Narrowing the candidate
    // filter to `RevJoint`, which is what it read while the pin beside the
    // slider was the thing a reader could grab, takes the gesture away.
    const { a, b, c } = pinAndSlider();

    expect(resolveJointDropTarget(c, 1, 0, [a, b, c], 1)).toBe(b);
  });
});

describe('resolving a joint drop target', () => {
  function scene() {
    const dragged = new RevJoint('A', 0, 0);
    const near = new RevJoint('B', 10, 0);
    const nearer = new RevJoint('C', 10.2, 0);
    const far = new RevJoint('D', 40, 0);
    connect('AE', [dragged, new RevJoint('E', -5, 0)]);
    connect('BF', [near, new RevJoint('F', 10, -5)]);
    connect('CG', [nearer, new RevJoint('G', 10, 5)]);
    connect('DH', [far, new RevJoint('H', 40, 5)]);
    return { dragged, near, nearer, far, joints: [dragged, near, nearer, far] };
  }

  it('takes the nearest legal joint inside the radius', () => {
    const { dragged, nearer, joints } = scene();

    expect(resolveJointDropTarget(dragged, 10.15, 0, joints, 1)).toBe(nearer);
  });

  it('takes nothing when every joint is outside the radius', () => {
    const { dragged, joints } = scene();

    expect(resolveJointDropTarget(dragged, 25, 0, joints, 1)).toBeUndefined();
  });

  it('skips a joint in range that it is not allowed to merge with', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 1, 0);
    connect('AB', [dragged, partner]);

    expect(resolveJointDropTarget(dragged, 1, 0, [dragged, partner], 5)).toBeUndefined();
  });

  it('never returns the joint being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);

    expect(resolveJointDropTarget(dragged, 0, 0, [dragged], 5)).toBeUndefined();
  });

  it('takes a slider under the pointer, which is how a pin-in-slot is made', () => {
    // This used to ignore one: a slider was an invisible prismatic joint, and
    // what a reader aimed at was the pin sitting on top of it.
    const dragged = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('B', 3, 0, false, true);

    expect(resolveJointDropTarget(dragged, 3, 0, [dragged, slider], 5)).toBe(slider);
  });
});

// The canvas needs the joint the user is *aiming* at, legal or not, so that a
// refused target can be marked red and explained instead of going dark.
describe('resolving the joint a drag is aimed at', () => {
  /**
   * A dragged joint plus one legal target and one refused target, side by side.
   * The refusal is over-constraint rather than sharing a link, because a joint
   * on the dragged joint's own link is skipped outright — see the specs below.
   */
  function scene() {
    const dragged = new RevJoint('A', 0, 0);
    const anchor = new RevJoint('X', -5, 0);
    const refused = new RevJoint('B', 10, 0);
    const legal = new RevJoint('C', 10.5, 0);
    connect('AX', [dragged, anchor]);
    // Merging A into B would leave a second bar spanning X and B.
    connect('XB', [anchor, refused]);
    connect('CG', [legal, new RevJoint('G', 10.5, 5)]);
    return { dragged, refused, legal, joints: [dragged, refused, legal] };
  }

  it('reports a legal target with no refusal', () => {
    const { dragged, legal, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.5, 0, joints, 1)).toEqual({
      joint: legal,
      refusal: undefined,
    });
  });

  it('reports a refused target together with the reason it was refused', () => {
    const { dragged, refused, joints } = scene();

    expect(resolveDropCandidate(dragged, 10, 0, joints, 1)).toEqual({
      joint: refused,
      refusal: 'over-constrained',
    });
  });

  // Nearest wins outright: a refused joint under the cursor must not be stepped
  // over in favor of a legal one further away, or the red ring would appear on
  // a joint the user is not pointing at.
  it('takes the nearest joint even when a legal one sits just behind it', () => {
    const { dragged, refused, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.1, 0, joints, 1)?.joint).toBe(refused);
  });

  it('takes the nearer legal joint when that is the one under the cursor', () => {
    const { dragged, legal, joints } = scene();

    expect(resolveDropCandidate(dragged, 10.4, 0, joints, 1)?.joint).toBe(legal);
  });

  it('takes nothing when every joint is outside the radius', () => {
    const { dragged, joints } = scene();

    expect(resolveDropCandidate(dragged, 5, 0, joints, 1)).toBeUndefined();
  });

  // Dragging one end of a bar onto the other is self-explanatory — the drawing
  // already shows the bar — so it is not a target at all rather than a red one.
  it('ignores the other end of the link being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 3, 0);
    connect('AB', [dragged, partner]);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, partner], 5)).toBeUndefined();
  });

  it('lets a legal joint further out win over a skipped same-link one', () => {
    const dragged = new RevJoint('A', 0, 0);
    const partner = new RevJoint('B', 3, 0);
    const legal = new RevJoint('C', 3.4, 0);
    connect('AB', [dragged, partner]);
    connect('CD', [legal, new RevJoint('D', 3.4, 5)]);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, partner, legal], 5)?.joint).toBe(legal);
  });

  // The dragged joint is always at distance zero from the cursor, so reporting
  // it would pin a permanent ring to the thing being dragged.
  it('never reports the joint being dragged', () => {
    const dragged = new RevJoint('A', 0, 0);

    expect(resolveDropCandidate(dragged, 0, 0, [dragged], 5)).toBeUndefined();
  });

  it('reports a slider it is aimed at, rather than passing over it', () => {
    const dragged = new RevJoint('A', 0, 0);
    const slider = new PrisJoint('B', 3, 0, false, true);

    expect(resolveDropCandidate(dragged, 3, 0, [dragged, slider], 5)?.joint).toBe(slider);
  });
});

describe('a slider and the link it rides', () => {
  /** Bar C--D, with a slider at P riding a slot cut into it. */
  function slottedLever() {
    const c = new RevJoint('C', 0, 0);
    const d = new RevJoint('D', 4, 0);
    const carrier = connect('CD', [c, d]);
    const p = new PrisJoint('P', 2, 0);
    const e = new RevJoint('E', 2, 3);
    connect('EP', [e, p]);
    p.slideOn(carrier, c, d);
    return { c, d, p, e };
  }

  it('refuses to merge a joint that defines the slot into the slider riding it', () => {
    // Found by dragging a slider 25px: it snapped onto the nearer end of its own
    // carrier, and the assembly went on sliding on itself -- non-dangling and
    // unflagged, because the slot's own well-formedness test looks at the
    // slider, and the merge used to happen to its paired pin.
    const scene = slottedLever();

    expect(refuseJointMerge(scene.c, scene.p)).toBe('own-carrier');
    expect(refuseJointMerge(scene.d, scene.p)).toBe('own-carrier');
  });

  it('refuses the other direction for the blunter reason: a slider cannot merge away', () => {
    // Both directions are refused; which rule catches it differs, because the
    // slider is the merge *source* here and a source that slides is turned away
    // before the carrier is ever considered.
    const scene = slottedLever();

    expect(refuseJointMerge(scene.p, scene.c)).toBe('prismatic');
  });

  it('says which rule it hit', () => {
    expect(MERGE_REFUSAL_MESSAGES['own-carrier']).toMatch(/ride/i);
  });

  it('still allows a merge with a joint that has nothing to do with the slot', () => {
    // The refusal must be about the carrier, not about sliders in general --
    // dropping a pin onto a slider is a pin-in-slot, which is the point.
    const scene = slottedLever();
    const loose = new RevJoint('Z', 9, 9);
    const other = new RevJoint('Y', 9, 8);
    connect('YZ', [loose, other]);

    expect(refuseJointMerge(loose, scene.p)).toBeUndefined();
  });

  it('never offers such a target to a drag', () => {
    const scene = slottedLever();

    const found = resolveJointDropTarget(scene.p, 0.05, 0, [scene.c, scene.d], 1);

    expect(found).toBeUndefined();
  });
});
