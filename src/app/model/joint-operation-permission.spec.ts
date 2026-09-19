import { Joint, PrisJoint, RealJoint, RevJoint } from './joint';
import { Link, RealLink } from './link';
import { cylindersIn } from './cylinder';
import {
  JointOperationContext,
  refuseGround,
  refuseJointOperation,
} from './joint-operation-permission';

/**
 * The one place that answers whether a structural edit may happen at a joint.
 *
 * Four things used to answer it separately — the context menu, the edit panel,
 * the group edit and the mutation itself — and the failure mode of that is not
 * a crash but a lie: a control offered and refused one layer down, or grayed
 * for a rule nothing enforces. So the rule is a pure function of the drawing
 * now, and this is its contract.
 *
 * Two of the answers below were deliberately temporary and have turned over.
 * A mount used to be refused a weld, and any member of a cylinder refused a
 * block; both were a fence around an unfinished path rather than a rule about
 * cylinders. What is refused now is the ram's *inside* -- the buried barrel
 * end, the pin and the slider -- and this file is where the difference between
 * those two questions is kept.
 */

/** A ram, plus the plain bars and joints around it to ask questions about. */
function drawing() {
  const barrelFar = new RevJoint('A', 0, 0);
  const barrelNear = new RevJoint('B', 6, 0);
  // The ram's seal: one joint where there used to be three. It keeps the pin's
  // letter, because a slider's own letter was never drawn and everything that
  // named the pin -- the rod's id among them -- still names something.
  const slider = new PrisJoint('C', 6, 0);
  const rodFar = new RevJoint('D', 10, 0);
  // Two ordinary bars meeting at an elbow, so there is something weldable.
  const elbow = new RevJoint('E', 20, 0);
  const first = new RevJoint('F', 16, 0);
  const second = new RevJoint('G', 20, 4);
  const lone = new RevJoint('H', 30, 0);

  const barrel = new RealLink('AB', [barrelFar, barrelNear]);
  const rod = new RealLink('CD', [slider, rodFar]);
  const bar = new RealLink('EF', [elbow, first]);
  const other = new RealLink('EG', [elbow, second]);
  const stub = new RealLink('HH', [lone, new RevJoint('I', 34, 0)]);

  slider.slideOn(barrel, barrelFar, barrelNear);
  slider.isSealed = true;
  // What the coincident pin's weld used to say: the rod is rigid with the slot.
  slider.rotates = false;

  const joints: Joint[] = [barrelFar, barrelNear, slider, rodFar, elbow, first, second, lone];
  const links: Link[] = [barrel, rod, bar, other, stub];
  links.forEach((link) =>
    link.joints.forEach((joint) => {
      if (joint instanceof RealJoint && !joint.links.includes(link)) joint.links.push(link);
    })
  );

  const context: JointOperationContext = {
    cylinders: cylindersIn(joints),
    isDriven: (joint) => joint.input,
    hasSlider: (joint) => joint instanceof PrisJoint,
  };
  // `pin` and `slider` are the same joint now. Both names are kept because the
  // tests below ask two different questions of it -- what a ram's inside
  // refuses, and what a joint that slides refuses -- and renaming either would
  // obscure which question a case is asking.
  return { barrelFar, barrelNear, pin: slider, rodFar, slider, elbow, lone, context };
}

describe('whether a weld may be made at a joint', () => {
  it('allows an ordinary elbow where two bars meet', () => {
    const { elbow, context } = drawing();
    expect(refuseJointOperation(elbow, 'weld', context)).toBeUndefined();
  });

  it('refuses a joint with nothing to fuse, and says which kind of nothing', () => {
    const { lone, context } = drawing();
    expect(refuseJointOperation(lone, 'weld', context)?.short).toBe('needs 2 links');
    expect(refuseJointOperation(lone, 'weld', context)?.long).toContain('only one meets here');

    const loose = new RevJoint('X', 50, 50);
    expect(refuseJointOperation(loose, 'weld', context)?.long).toContain('is on none');
  });

  /**
   * A plain slider with one bar riding it, away from the ram.
   *
   * `drawing()`'s slider is sealed, and a sealed part refuses every weld for
   * being sealed — which would hide the answer these two are asking for.
   */
  function plainSlider() {
    const carrierA = new RevJoint('R', 100, 0);
    const carrierB = new RevJoint('S', 110, 0);
    const far = new RevJoint('T', 105, 10);
    const slider = new PrisJoint('U', 105, 0);
    const carrier = new RealLink('RS', [carrierA, carrierB]);
    const rider = new RealLink('TU', [far, slider]);
    [carrierA, carrierB].forEach((joint) => joint.links.push(carrier));
    [far, slider].forEach((joint) => joint.links.push(rider));
    slider.slideOn(carrier, carrierA, carrierB);
    return { slider, rider };
  }

  it('welds a slider, because that is what a Slide is', () => {
    // This used to be refused: the weld had to land on the coincident pin, and
    // the slider itself had nothing of its own to hold. A slider is one joint
    // now, and welding it is how its riders stop turning against the slot.
    const { context } = drawing();
    const { slider } = plainSlider();
    expect(refuseJointOperation(slider, 'weld', context)).toBeUndefined();
  });

  it('refuses a Slide with nothing riding the slot to hold', () => {
    const { context } = drawing();
    const bare = new PrisJoint('V', 80, 80);
    expect(refuseJointOperation(bare, 'weld', context)?.short).toBe('nothing rides it');
  });

  it('refuses a driven joint, because a weld says the opposite of an input', () => {
    const { elbow, context } = drawing();
    elbow.input = true;
    expect(refuseJointOperation(elbow, 'weld', context)?.short).toBe('it is driven');
  });

  it('lets a mount weld, and refuses the ram’s inside', () => {
    // The ban that used to be here is gone on purpose: a mount is where a
    // cylinder meets the drawing, so fusing one into a bracket is the ordinary
    // thing to want. What is sealed is the ram's inside, and welding anything
    // to one of those three joints would fuse the part to its own workings.
    const { barrelFar, rodFar, barrelNear, context } = drawing();

    // A mount with one link on it is refused for arithmetic, not for being a
    // mount -- a weld fuses what meets at a joint, and one bar does not meet.
    for (const mount of [barrelFar, rodFar]) {
      expect(refuseJointOperation(mount, 'weld', context)?.short).toBe('needs 2 links');
    }

    const refused = refuseJointOperation(barrelNear, 'weld', context);
    expect(refused?.short).toBe('inside a cylinder');
    expect(refused?.code).toBe('cylinder.sealed-weld');
  });
});

describe('whether a weld may be undone at a joint', () => {
  it('never lets the sealed pin go: that weld is what makes the ram one part', () => {
    const { pin, context } = drawing();
    expect(refuseJointOperation(pin, 'unweld', context)?.code).toBe('cylinder.sealed-unweld');
  });

  it('lets a welded mount come back out of its compound', () => {
    // The forward-looking half of the same rule, and the reason membership is
    // the wrong test: a mount has no block of its own, so taking it out of a
    // neighboring body is an ordinary unweld even while welding one is refused.
    const { barrelFar, context } = drawing();
    barrelFar.isWelded = true;
    expect(refuseJointOperation(barrelFar, 'unweld', context)).toBeUndefined();
  });

  it('says nothing about a joint that is not welded', () => {
    const { elbow, context } = drawing();
    expect(refuseJointOperation(elbow, 'unweld', context)).toBeUndefined();
  });
});

describe('whether a block may be added or removed at a joint', () => {
  it('allows an ordinary joint', () => {
    const { elbow, context } = drawing();
    expect(refuseJointOperation(elbow, 'add-slider', context)).toBeUndefined();
  });

  it('refuses a driven joint, which would then hold three bodies', () => {
    const { elbow, context } = drawing();
    elbow.input = true;
    expect(refuseJointOperation(elbow, 'add-slider', context)?.short).toBe('it is driven');
  });

  it('refuses a block inside the ram, and allows one at a mount', () => {
    // This used to ask about *membership*, so a mount was turned away for a
    // slider the cylinder keeps somewhere else entirely. The rule that is
    // actually true is about the bore: the ram has a slider of its own in
    // there, and a second one inside it is meaningless. A block on a mount is
    // how a ram gets a carriage.
    //
    // The pin is not in the list because it already carries the ram's own
    // block, so *adding* one is a question about it that does not arise; the
    // refusal it needs is the removal one, below.
    const { barrelFar, rodFar, barrelNear, context } = drawing();

    expect(refuseJointOperation(barrelNear, 'add-slider', context)?.code).toBe(
      'cylinder.sealed-slider'
    );
    for (const mount of [barrelFar, rodFar]) {
      expect(refuseJointOperation(mount, 'add-slider', context), mount.id).toBeUndefined();
    }
  });

  it('refuses taking the ram’s own block away', () => {
    const { pin, context } = drawing();
    expect(refuseJointOperation(pin, 'remove-slider', context)?.code).toBe(
      'cylinder.sealed-slider'
    );
  });
});

describe('whether a joint may be grounded', () => {
  it('sends a cylinder’s own joints to the ends of the part', () => {
    // A cylinder is bolted to the world at the joints at its two ends. The
    // seal is a square a reader can select and right-click, so this is a row
    // somebody will press (decision D9) rather than a rule nothing can reach.
    const { pin, barrelNear, context } = drawing();
    for (const inside of [pin, barrelNear]) {
      const refused = refuseGround(inside, context);
      expect(refused?.short, inside.id).toBe('ground an end joint instead');
      expect(refused?.code, inside.id).toBe('cylinder.ground-an-end-joint');
      // The same answer through the operation table, so the menu and the panel
      // can ask whichever way suits them.
      expect(refuseJointOperation(inside, 'ground', context)?.code).toBe(
        'cylinder.ground-an-end-joint'
      );
    }
  });

  it('says nothing about the joints at those ends, or about a plain joint', () => {
    const { barrelFar, rodFar, elbow, context } = drawing();
    for (const joint of [barrelFar, rodFar, elbow]) {
      expect(refuseGround(joint, context), joint.id).toBeUndefined();
    }
  });
});
