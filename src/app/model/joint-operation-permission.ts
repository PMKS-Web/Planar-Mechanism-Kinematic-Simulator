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
import { Cylinder, cylinderInteriorsAt, cylinderMountsAt, cylindersOfJointIn } from './cylinder';

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
 */
export function refuseJointOperation(
  joint: Joint | undefined,
  operation: JointOperation,
  context: JointOperationContext
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
      return refuseWeld(joint, context);
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
  context: JointOperationContext
): OperationRefusal | undefined {
  // The slider itself is the freedom between its block and its guide; a weld
  // would be the claim that there is none. The pin riding it welds.
  if (joint instanceof PrisJoint) {
    return {
      code: 'weld.is-the-slider',
      short: 'it is the slider',
      long: 'A weld fuses the links that meet at a pin, and this is the slider itself: the freedom between its block and its guide. Weld the pin riding it instead.',
    };
  }
  if (joint.isWelded) return undefined;

  // TEMPORARY, and the whole point of this task: a mount is refused today
  // because welding one into a neighboring compound opened more edge cases
  // than it was worth. `docs/cylinder-mount-joints-plan.md` step 5 is where
  // this branch goes, once the compound-carrying edit path behind it exists.
  if (cylinderMountsAt(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-weld',
      short: 'part is sealed',
      long: 'A cylinder is one sealed part, so its joints cannot be fused into a neighboring body. Attach a link here instead.',
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

  // A loose joint has no links at all, and telling it "only one meets here" is
  // a sentence about a link that is not there.
  const meeting = joint.links.length;
  if (meeting >= 2) return undefined;
  return {
    code: 'weld.needs-two-links',
    short: 'needs 2 links',
    long:
      meeting === 0
        ? 'A weld fuses the links that meet at a joint, and this joint is on none.'
        : 'A weld fuses the links that meet at a joint, and only one meets here.',
  };
}

function refuseUnweld(
  joint: RealJoint,
  context: JointOperationContext
): OperationRefusal | undefined {
  if (!joint.isWelded) return undefined;
  // The sealed pin's weld is what makes a cylinder one part, and it never
  // comes off. A welded *mount* has no block of its own, so taking one back
  // out of a neighboring compound is an ordinary unweld and stays legal —
  // which is why this asks about interiors and not about membership.
  if (cylinderInteriorsAt(context.cylinders, joint).length > 0) {
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

  // TEMPORARY in the same way as the weld branch above, and broader than it
  // needs to be: this refuses on *membership*, so a mount is turned away for a
  // slider the cylinder keeps somewhere else entirely. Step 5 narrows it to
  // `cylinderInteriorsAt`, which is the rule that is actually true.
  if (cylindersOfJointIn(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-slider',
      short: 'part of a cylinder',
      long: 'A cylinder is one sealed part with a slider of its own inside it, so its joints take no second one. Attach a link here instead.',
    };
  }

  // A block is a body too, so adding one to a driven pin puts a third at the
  // joint. Taking one away is always allowed.
  if (context.isDriven(joint)) {
    return {
      code: 'slider.is-driven',
      short: 'it is driven',
      long: 'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
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
  // an ordinary block and comes off like one.
  if (cylindersOfJointIn(context.cylinders, joint).length > 0) {
    return {
      code: 'cylinder.sealed-slider',
      short: 'part of a cylinder',
      long: 'A cylinder is one sealed part with a slider of its own inside it, so its joints take no second one. Attach a link here instead.',
    };
  }
  return undefined;
}
