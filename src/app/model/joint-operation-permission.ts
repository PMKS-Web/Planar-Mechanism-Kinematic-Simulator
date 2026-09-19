/**
 * Whether one structural edit may be made at one joint, and why not.
 *
 * The menu grays a row, the panel disables a control, the group edit refuses a
 * selection and the mutation itself turns an edit away — four places that have
 * to agree about the same rule, and four places that used to each carry their
 * own copy of it. A control offered and then refused one layer down reads as a
 * broken app; a control grayed for a reason nothing enforces is worse, because
 * it is a rule the reader cannot discover is gone.
 *
 * So the rule lives here, once, as a function of the drawing rather than of any
 * service. Callers pass the few facts that are theirs to know — what the
 * cylinders are, whether a joint reads as driven, whether it already carries a
 * block — and get back either `undefined` or the sentence the reader sees.
 *
 * **Pure on purpose.** Nothing here touches a service, so the panel and the
 * canvas and a spec can all ask the same question of the same drawing.
 */

import { Joint, PrisJoint, RealJoint } from './joint';
import { RealLink } from './link';
import { Cylinder, cylindersEnclosing } from './cylinder';

/** A structural edit, named as the state it is asking for rather than as a toggle. */
export type JointOperation = 'weld' | 'unweld' | 'add-slider' | 'remove-slider';

/**
 * Why an edit will not happen, in the two lengths the app needs: `short` for a
 * chip or a menu row's gray note, `long` for a tooltip or a snackbar.
 */
export interface OperationRefusal {
  code: string;
  short: string;
  long: string;
}

/**
 * What the caller knows and this module does not.
 *
 * `isDriven` and `hasSlider` are questions about the joint graph that the
 * canvas already answers, and a slider's input lives on its guide rather than
 * on the pin — re-deriving that here would be a second answer to a question
 * `GridUtilsService` has settled.
 */
export interface JointOperationContext {
  cylinders: Cylinder[];
  isDriven: (joint: RealJoint) => boolean;
  hasSlider: (joint: RealJoint) => boolean;
}

/**
 * The one answer. `undefined` means the edit may proceed.
 *
 * A no-op is allowed rather than refused: asking to weld a joint that is
 * already welded is not an error, and the control that would do it is the same
 * control that undoes it.
 *
 * `after` judges the edit on the joint as it will stand once that other edit
 * has run: the second half of a change of joint type, where one press gives a
 * pin its block and welds it in the same edit (`model/joint-type.ts`).
 */
export function refuseJointOperation(
  joint: Joint | undefined,
  operation: JointOperation,
  context: JointOperationContext,
  after?: JointOperation
): OperationRefusal | undefined {
  if (!(joint instanceof RealJoint)) {
    return operation === 'weld' || operation === 'unweld'
      ? { code: 'joint.not-a-joint', short: 'not a joint', long: 'Only a joint can be welded.' }
      : {
          code: 'joint.not-a-joint',
          short: 'not a joint',
          long: 'Only a joint can carry a slider.',
        };
  }
  switch (operation) {
    case 'weld':
      return refuseWeld(joint, context, after);
    case 'unweld':
      return refuseUnweld(joint, context);
    case 'add-slider':
      return refuseAddSlider(joint, context);
    case 'remove-slider':
      return refuseRemoveSlider(joint, context);
  }
}

function refuseWeld(
  joint: RealJoint,
  context: JointOperationContext,
  after?: JointOperation
): OperationRefusal | undefined {
  // Welding a slider is what makes it a Slide: its riders stop turning against
  // the slot and the assembly keeps the slot's angle. It used to be refused
  // here, because the weld had to land on the coincident pin instead — the
  // object a slider no longer has.
  if (joint instanceof PrisJoint ? !joint.rotates : joint.isWelded) return undefined;

  // A mount welds like any other joint: it is where a cylinder attaches to the
  // rest of the drawing, so fusing one into a bracket is the ordinary thing to
  // want. What is sealed is the ram's *inside* -- the buried barrel end, the
  // pin and the slider -- and welding anything to one of those is fusing a
  // part to its own workings. None of the three is drawn or selectable, so
  // nothing offers it; the rule is here so that no path can reach it, and so
  // that the refusal says which of the two things a cylinder joint can be.
  if (cylindersEnclosing(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-weld',
      short: 'part is sealed',
      long: 'This joint is inside a sealed cylinder, and fusing anything to it would weld the part to its own workings. Weld one of its two mounts instead.',
    };
  }

  // A weld is the statement that the bodies at this joint do not move relative
  // to each other, and an input is the statement that they do. Both at once is
  // not a state the model can honor.
  if (joint.input) {
    return {
      code: 'weld.is-driven',
      short: 'it is driven',
      long: 'A weld says these bodies do not move relative to each other, and an input says they do. Remove the input first.',
    };
  }

  return weldNeedsLinks(joint, after);
}

/**
 * Whether a weld that a change of type *keeps* still has two bodies to fuse
 * once the slot leaves.
 *
 * Prismatic and Welded are both welded, so `stepsBetween` emits no weld step
 * between them and nothing asks `weldNeedsLinks` — the change is the slot
 * coming off, and the weld simply stays. On a Slide with one bar that weld was
 * the bar held to the slot, and with the slot gone the reconciler finds nothing
 * for it to be rigid about and takes it away: the reader who chose Welded would
 * be handed a Revolute without a word.
 *
 * Asked the way that reconciler looks — a compound already standing at the
 * joint, or two bars it can still fuse into one. A compound counts as one link,
 * which is why counting `links` is not enough.
 */
export function weldOutlivesTheSlot(joint: RealJoint): OperationRefusal | undefined {
  const bars = joint.links.filter((link): link is RealLink => link instanceof RealLink);
  if (bars.length >= 2 || bars.some((bar) => bar.subset.length > 0)) return undefined;
  return {
    code: 'weld.needs-two-links',
    short: 'needs 2 links',
    long: 'A weld fuses the links that meet at a joint, and without its slot only one meets here.',
  };
}

/**
 * What a weld needs to hold, which depends on what it is welding.
 *
 * On a slider the weld is the Slide: the riders stop turning against the slot,
 * so one rider is enough and the slot is the other half. On every other joint it
 * fuses the links that meet there, so it needs two of them.
 *
 * Judged on the joint as it will stand once `after` has run — the second half of
 * a change of type, where one press gives a pin its slot and welds it in the
 * same edit (`model/joint-type.ts`). A block used to be a link of the pin it
 * rode, so gaining one gave a pin on a single bar its second link; a slider is
 * the joint itself now, and what it holds is whatever rides it.
 */
export function weldNeedsLinks(
  joint: RealJoint,
  after?: JointOperation
): OperationRefusal | undefined {
  const slides =
    after === 'add-slider' || (joint instanceof PrisJoint && after !== 'remove-slider');
  const bars = joint.links.filter((link): link is RealLink => link instanceof RealLink);
  if (slides) {
    if (bars.length >= 1) return undefined;
    return {
      code: 'weld.needs-a-rider',
      short: 'nothing rides it',
      long: 'A Slide holds what rides the slot still against it, and nothing rides this one.',
    };
  }
  const meeting = joint.links.length;
  if (meeting >= 2) return undefined;
  // A loose joint has no links at all, and telling it "only one meets here" is
  // a sentence about a link that is not there.
  return {
    code: 'weld.needs-two-links',
    short: 'needs 2 links',
    long:
      meeting <= 0
        ? 'A weld fuses the links that meet at a joint, and this joint is on none.'
        : after === 'remove-slider'
          ? 'A weld fuses the links that meet at a joint, and without its slot only one meets here.'
          : 'A weld fuses the links that meet at a joint, and only one meets here.',
  };
}

function refuseUnweld(
  joint: RealJoint,
  context: JointOperationContext
): OperationRefusal | undefined {
  // Read the way `refuseWeld` reads it, and for the same reason: a slider
  // records its weld in `rotates`, so asking `isWelded` of one answers false
  // however welded it is. That made this fail *open* -- the guard below, which
  // is what stops a reader taking a sealed cylinder apart, stopped firing at
  // the one joint a cylinder is sealed at.
  const welded = joint instanceof PrisJoint ? !joint.rotates : joint.isWelded;
  if (!welded) return undefined;
  // The sealed pin's weld is what makes a cylinder one part, and it never
  // comes off. A welded *mount* has no block of its own, so taking one back
  // out of a neighboring compound is an ordinary unweld and stays legal —
  // which is why this asks about interiors and not about membership.
  if (cylindersEnclosing(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-unweld',
      short: 'part is sealed',
      long: 'This weld is what holds a cylinder together as one part, so it cannot be undone. Delete the cylinder instead.',
    };
  }
  return undefined;
}

function refuseAddSlider(
  joint: RealJoint,
  context: JointOperationContext
): OperationRefusal | undefined {
  if (context.hasSlider(joint)) return undefined;

  // The ram's own block belongs to its interior, and an interior joint takes
  // no second one -- that is what sealed means. A *mount* is not interior:
  // giving one a block is how a ram gets a carriage, and it is the same edit
  // as giving any other joint one. This asked about membership before, so a
  // mount was turned away for a slider the cylinder keeps somewhere else
  // entirely.
  if (cylindersEnclosing(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-slider',
      short: 'part is sealed',
      long: 'This joint is inside a sealed cylinder, which has a slider of its own, so it takes no second one. Add one at a mount instead.',
    };
  }

  // A drive on a pin turns; a drive on a slot travels. They are measured in
  // different units and prescribe different freedoms, so a joint cannot change
  // from one to the other while it is the drive. Taking a slot away is always
  // allowed.
  if (context.isDriven(joint)) {
    return {
      code: 'slider.is-driven',
      short: 'it is driven',
      long: 'This joint is the drive, and a drive on a pin turns where a drive on a slot travels. Remove the input first.',
    };
  }
  return undefined;
}

function refuseRemoveSlider(
  joint: RealJoint,
  context: JointOperationContext
): OperationRefusal | undefined {
  if (!context.hasSlider(joint)) return undefined;
  // The cylinder's own block is the cylinder. An external block on a mount is
  // an ordinary block and comes off like one, which is why this asks about
  // interiors rather than about membership.
  if (cylindersEnclosing(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-slider',
      short: 'part is sealed',
      long: 'This joint is inside a sealed cylinder, and its slider is what makes the part one thing. Delete the cylinder instead.',
    };
  }
  return undefined;
}
