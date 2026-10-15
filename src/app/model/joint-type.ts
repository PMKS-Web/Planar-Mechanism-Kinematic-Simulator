/**
 * A joint's type, offered as one choice in the Edit panel and the right-click
 * menu: Revolute, Prismatic, Pin-in-slot or Welded.
 *
 * Nothing stores a type. Until a slider becomes one joint (Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`), what a joint is comes down to two
 * facts the drawing already records -- whether a sliding block rides it, and
 * whether the bodies meeting at it are welded -- and the four types are those
 * two facts' four combinations (D1): Revolute has neither, Pin-in-slot has the
 * block, Prismatic has the block welded to what rides it (the Slide), and
 * Welded has the weld alone. A change of type is therefore one or two of the
 * edits those facts already have, and this says which, in what order, and
 * whether the joint may take them.
 *
 * Pure, like the refusal model it asks: a spec, the panel and the menu put the
 * same question to the same drawing.
 */

import { RealJoint } from './joint';
import {
  JointOperation,
  JointOperationContext,
  OperationRefusal,
  refuseJointOperation,
  weldOutlivesBlock,
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

/** The type a joint is now, read the way the refusal model reads it. */
export function jointTypeAt(joint: RealJoint, context: JointOperationContext): JointType {
  return jointTypeOf({ slider: context.hasSlider(joint), welded: joint.isWelded });
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
 * A block goes on before a weld, because the block is a body of its own and a
 * weld needs two to fuse: a pin on a single bar becomes Prismatic by gaining
 * the block and then welding the bar to it. A weld comes off before a block
 * does, so the block leaves a plain pin behind rather than a weld with nothing
 * left to fuse.
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
 * Each step is judged on the joint as the step before it leaves it, so a weld
 * made in the same change as a new block counts the block. And a weld the
 * change keeps is asked whether it outlives the block: a Prismatic pin on one
 * bar, made Welded, would keep a weld with nothing left to fuse, which the
 * reconciler takes away -- and the reader who chose Welded would be handed a
 * Revolute without a word.
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
  if (bitsOf(from).welded && bitsOf(to).welded && before === 'remove-slider') {
    return weldOutlivesBlock(joint);
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
