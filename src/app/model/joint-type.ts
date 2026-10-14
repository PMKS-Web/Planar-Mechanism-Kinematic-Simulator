/**
 * A joint's type, offered as one choice in the Edit panel and the right-click
 * menu: Revolute, Prismatic, Pin-in-slot or Welded.
 *
 * Nothing stores a type. What a joint is comes down to two facts the drawing
 * already records -- whether it slides, and whether the bodies meeting at it
 * are held rigid -- and the four types are those two facts' four combinations
 * (D1): Revolute has neither, Pin-in-slot slides, Prismatic slides with its
 * riders held to the slot (the Slide), and Welded is the weld alone. A change
 * of type is therefore one or two of the edits those facts already have, and
 * this says which, in what order, and whether the joint may take them.
 *
 * Where each fact lives moved in Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`: a slider used to be a prismatic joint
 * with a coincident pin joined by a block, so sliding meant "a block rides this
 * pin" and the Slide's weld sat on that pin. A slider is one joint now, so
 * sliding is what the joint *is* and the weld is `rotates` on it.
 *
 * Pure, like the refusal model it asks: a spec, the panel and the menu put the
 * same question to the same drawing.
 */

import { PrisJoint, RealJoint } from './joint';
import {
  JointOperation,
  JointOperationContext,
  OperationRefusal,
  refuseJointOperation,
  weldOutlivesTheSlot,
} from './joint-operation-permission';

export type JointType = 'revolute' | 'prismatic' | 'pin-in-slot' | 'welded';

/** In the order the choice lays them out, two to a row. */
export const JOINT_TYPES: readonly JointType[] = ['revolute', 'prismatic', 'pin-in-slot', 'welded'];

/** Title Case, because each one labels a control (`docs/ui-vocabulary.md`). */
export const JOINT_TYPE_LABEL: Readonly<Record<JointType, string>> = {
  revolute: 'Revolute',
  prismatic: 'Prismatic',
  'pin-in-slot': 'Pin-in-slot',
  welded: 'Welded',
};

/**
 * What the choice says beside a joint whose block has nowhere to slide -- no
 * slot to ride and no ground to fix its direction -- while its chosen option
 * takes the refusal ink (D4). It is the one thing about a slot the drawing
 * cannot show: a dangling block looks like any other.
 */
export const NOWHERE_TO_SLIDE = {
  lead: 'Nowhere to slide.',
  sentence: 'Drag it onto a link to cut its slot, or ground it.',
} as const;

/** The two facts a type is made of. */
export interface JointTypeBits {
  slider: boolean;
  welded: boolean;
}

export function jointTypeOf(bits: JointTypeBits): JointType {
  if (bits.slider) return bits.welded ? 'prismatic' : 'pin-in-slot';
  return bits.welded ? 'welded' : 'revolute';
}

export function bitsOf(type: JointType): JointTypeBits {
  return {
    slider: type === 'prismatic' || type === 'pin-in-slot',
    welded: type === 'prismatic' || type === 'welded',
  };
}

/**
 * The type a joint is now, read the way the refusal model reads it.
 *
 * A slider says whether its riders may turn against the slot in `rotates`; every
 * other joint says whether the bodies meeting at it are fused in `isWelded`.
 * The two were one bit before a slider became one joint — the weld then lived on
 * the coincident pin, which is the object that no longer exists.
 */
export function jointTypeAt(joint: RealJoint, context: JointOperationContext): JointType {
  const slider = context.hasSlider(joint);
  const welded = joint instanceof PrisJoint ? !joint.rotates : joint.isWelded;
  return jointTypeOf({ slider, welded });
}

/**
 * The glyph for a type, floating or standing on the frame. A grounded joint
 * wears the grounded set on every option, not only its own, so the choice reads
 * as one joint in four forms (D2).
 */
export function jointTypeIcon(type: JointType, grounded: boolean): string {
  const name = `joint_${type.replace(/-/g, '_')}`;
  return grounded ? `${name}_grounded` : name;
}

/**
 * The edits that take a joint from one type to another, in the order they have
 * to run.
 *
 * The slot goes on before the weld: a pin on a single bar becomes Prismatic by
 * starting to slide and then holding that bar to its slot, and asking for the
 * weld first would be asking a plain pin to hold something to a slot it does
 * not have. A weld comes off before the slot does, so what is left behind is a
 * plain pin rather than a weld with nothing to hold.
 */
export function stepsBetween(from: JointType, to: JointType): JointOperation[] {
  const was = bitsOf(from);
  const will = bitsOf(to);
  const steps: JointOperation[] = [];
  if (was.welded && !will.welded) steps.push('unweld');
  if (!was.slider && will.slider) steps.push('add-slider');
  if (was.slider && !will.slider) steps.push('remove-slider');
  if (!was.welded && will.welded) steps.push('weld');
  return steps;
}

/**
 * Why this joint cannot become `to`, in the refusal model's own words, or
 * `undefined` if it can.
 *
 * Each step is judged on the joint as the step before it leaves it, so the weld
 * that finishes a change is asked about the joint that change is making, not the
 * one it started from.
 */
export function refuseJointType(
  joint: RealJoint,
  to: JointType,
  context: JointOperationContext
): OperationRefusal | undefined {
  const from = jointTypeAt(joint, context);
  let before: JointOperation | undefined;
  for (const step of stepsBetween(from, to)) {
    const refused = refuseJointOperation(joint, step, context, before);
    if (refused) return refused;
    before = step;
  }
  // Prismatic to Welded runs no weld step -- both are welded, so the change is
  // only the slot coming off -- which leaves the one case no step can speak
  // for: a weld the change keeps, losing the body it was fusing to.
  if (bitsOf(from).welded && bitsOf(to).welded && before === 'remove-slider') {
    return weldOutlivesTheSlot(joint);
  }
  return undefined;
}

/** A refusal as the choice shows it: a few words, and the model's sentence on hover. */
export interface ChoiceRefusal {
  short: string;
  long: string;
}

/** What the choice draws, for one joint or for a group of them. */
export interface JointTypeChoice {
  /** The chosen type's place in `JOINT_TYPES`, or -1 when a group's joints disagree. */
  chosen: number;
  labels: readonly string[];
  icons: readonly string[];
  /** Why each type is refused, in `JOINT_TYPES` order; the chosen one never is. */
  refusals: readonly (ChoiceRefusal | undefined)[];
  disabledAt: readonly number[];
  reasons: readonly (string | undefined)[];
  /** The chosen type cannot stand as drawn: a block with nowhere to slide. */
  invalid: boolean;
}

export function jointTypeChoice(
  chosen: JointType | undefined,
  grounded: boolean,
  refusalOf: (type: JointType) => ChoiceRefusal | undefined,
  invalid = false
): JointTypeChoice {
  const refusals = JOINT_TYPES.map((type) => (type === chosen ? undefined : refusalOf(type)));
  return {
    chosen: chosen === undefined ? -1 : JOINT_TYPES.indexOf(chosen),
    labels: JOINT_TYPES.map((type) => JOINT_TYPE_LABEL[type]),
    icons: JOINT_TYPES.map((type) => jointTypeIcon(type, grounded)),
    refusals,
    disabledAt: refusals.flatMap((refusal, index) => (refusal ? [index] : [])),
    reasons: refusals.map((refusal) => refusal?.long),
    invalid: chosen !== undefined && invalid,
  };
}
