// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import './joint';
import { PrisJoint, RealJoint, RevJoint } from './joint';
import { RealLink } from './link';
import { cylindersIn } from './cylinder';
import { JointOperation, JointOperationContext } from './joint-operation-permission';
import {
  JOINT_TYPES,
  JointType,
  JointTypeBits,
  bitsOf,
  jointTypeAt,
  jointTypeChoice,
  jointTypeIcon,
  jointTypeOf,
  refuseJointType,
  stepsBetween,
} from './joint-type';

/** The facts the Edit panel's services hand the model, read straight off the joint. */
const context: JointOperationContext = {
  cylinders: [],
  isDriven: (joint) => joint.input,
  // A slider is the joint, not something hanging off it (Stage 1 of
  // `docs/joint-type-and-cylinder-plan.md`).
  hasSlider: (joint) => joint instanceof PrisJoint,
};

/** Joint B at the end of `bars` bars, sliding, welded or driven as asked. */
function pinOn(bars: number, { block = false, welded = false, driven = false } = {}): RealJoint {
  // The joint *is* the slider when it slides, so which class B is depends on
  // what is being asked for -- there is no second joint to hang a block from.
  const b: RealJoint = block ? new PrisJoint('B', 0, 0) : new RevJoint('B', 0, 0);
  for (let i = 0; i < bars; i++) {
    const other = new RevJoint(String.fromCharCode(67 + i), i + 1, 1);
    b.links.push(new RealLink(`B${other.id}`, [b, other]));
  }
  // A slider records a weld as `rotates`: its riders cannot turn against the
  // slot. Every other joint records it as `isWelded`.
  if (b instanceof PrisJoint) b.rotates = !welded;
  else b.isWelded = welded;
  b.input = driven;
  return b;
}

/** Where a joint's bits end up after the edits, applied one by one. */
function apply(bits: JointTypeBits, steps: JointOperation[]): JointTypeBits {
  return steps.reduce(
    (now, step) => ({
      slider: step === 'add-slider' ? true : step === 'remove-slider' ? false : now.slider,
      welded: step === 'weld' ? true : step === 'unweld' ? false : now.welded,
    }),
    bits
  );
}

describe('joint type', () => {
  it('is the two facts a joint already carries, and back', () => {
    for (const type of JOINT_TYPES) expect(jointTypeOf(bitsOf(type))).toBe(type);
    expect(bitsOf('pin-in-slot')).toEqual({ slider: true, welded: false });
    expect(bitsOf('prismatic')).toEqual({ slider: true, welded: true });
  });

  it('reaches every type from every other in one edit per fact that changes', () => {
    for (const from of JOINT_TYPES) {
      for (const to of JOINT_TYPES) {
        const steps = stepsBetween(from, to);
        const was = bitsOf(from);
        const will = bitsOf(to);
        const changes = Number(was.slider !== will.slider) + Number(was.welded !== will.welded);
        expect(steps.length, `${from} to ${to}`).toBe(changes);
        expect(apply(was, steps), `${from} to ${to}`).toEqual(will);
      }
    }
  });

  it('puts a block on before a weld, and takes a weld off before a block', () => {
    expect(stepsBetween('revolute', 'prismatic')).toEqual(['add-slider', 'weld']);
    expect(stepsBetween('prismatic', 'revolute')).toEqual(['unweld', 'remove-slider']);
    expect(stepsBetween('welded', 'pin-in-slot')).toEqual(['unweld', 'add-slider']);
    expect(stepsBetween('pin-in-slot', 'welded')).toEqual(['remove-slider', 'weld']);
  });

  it('lets a pin on one bar become Prismatic, because its block is the second body to fuse', () => {
    const pin = pinOn(1);
    expect(refuseJointType(pin, 'pin-in-slot', context)).toBeUndefined();
    expect(refuseJointType(pin, 'prismatic', context)).toBeUndefined();
    expect(refuseJointType(pin, 'welded', context)?.short).toBe('needs 2 links');
  });

  it('refuses Welded where taking the block away would leave the weld one link', () => {
    // A Pin-in-slot: the block goes first, and then there is one bar to fuse.
    expect(refuseJointType(pinOn(1, { block: true }), 'welded', context)?.code).toBe(
      'weld.needs-two-links'
    );
    // A Prismatic keeps its weld, but nothing is left for it to hold the bar to.
    const slide = pinOn(1, { block: true, welded: true });
    expect(refuseJointType(slide, 'welded', context)?.long).toContain('without its slot');
    // With a second bar the weld still has two links once the block has gone.
    expect(refuseJointType(pinOn(2, { block: true, welded: true }), 'welded', context)).toBe(
      undefined
    );
    // And once welded, those two bars are one compound link, counted by its
    // pieces: counting links saw one, and refused a weld the block's leaving
    // keeps.
    const slideOnTwo = pinOn(0, { block: true, welded: true });
    const c = new RevJoint('C', 1, 1);
    const d = new RevJoint('D', 2, 1);
    const compound = new RealLink('BCD', [slideOnTwo, c, d]);
    compound.subset = [new RealLink('BC', [slideOnTwo, c]), new RealLink('BD', [slideOnTwo, d])];
    slideOnTwo.links.unshift(compound);
    expect(refuseJointType(slideOnTwo, 'welded', context)).toBeUndefined();
  });

  it('leaves a cylinder’s seal Prismatic, and refuses the other three', () => {
    // The square mid-skin is joint S, and selecting it shows this choice
    // (decision D9). Prismatic is what it is; the other three would take the
    // part apart, and each says so in the model's own words.
    const seal = new PrisJoint('C', 6, 0);
    seal.isSealed = true;
    seal.rotates = false;
    const mountA = new RevJoint('A', 0, 0);
    const inner = new RevJoint('B', 6, 0);
    const mountB = new RevJoint('D', 10, 0);
    const barrel = new RealLink('AB', [mountA, inner]);
    const rod = new RealLink('CD', [seal, mountB]);
    [mountA, inner].forEach((joint) => joint.links.push(barrel));
    [seal, mountB].forEach((joint) => joint.links.push(rod));
    seal.slideOn(barrel, mountA, inner);
    const sealed: JointOperationContext = {
      ...context,
      cylinders: cylindersIn([mountA, inner, seal, mountB]),
    };

    expect(sealed.cylinders, 'the fixture really is a cylinder').toHaveLength(1);
    expect(jointTypeAt(seal, sealed)).toBe('prismatic');
    expect(refuseJointType(seal, 'prismatic', sealed)).toBeUndefined();
    for (const type of ['revolute', 'pin-in-slot', 'welded'] as const) {
      expect(refuseJointType(seal, type, sealed)?.short, type).toBe('inside a cylinder');
    }
  });

  it('refuses a block and a weld on a driven pin, each in its own words', () => {
    const driven = pinOn(2, { driven: true });
    expect(refuseJointType(driven, 'pin-in-slot', context)?.code).toBe('slider.is-driven');
    expect(refuseJointType(driven, 'prismatic', context)?.code).toBe('slider.is-driven');
    expect(refuseJointType(driven, 'welded', context)?.code).toBe('weld.is-driven');
    expect(refuseJointType(driven, 'revolute', context)).toBeUndefined();
  });

  it('draws the grounded set on every option of a grounded joint', () => {
    expect(jointTypeIcon('pin-in-slot', false)).toBe('joint_pin_in_slot');
    expect(jointTypeIcon('pin-in-slot', true)).toBe('joint_pin_in_slot_grounded');
    expect(jointTypeChoice('revolute', true, () => undefined).icons).toEqual([
      'joint_revolute_grounded',
      'joint_prismatic_grounded',
      'joint_pin_in_slot_grounded',
      'joint_welded_grounded',
    ]);
  });

  it('never refuses the type a joint already is, and chooses nothing for a group in two minds', () => {
    const refused = { short: 'no', long: 'Never.' };
    const welded = jointTypeChoice('welded', false, () => refused);
    expect(welded.chosen).toBe(JOINT_TYPES.indexOf('welded'));
    expect(welded.disabledAt).toEqual([0, 1, 2]);
    expect(welded.reasons).toEqual(['Never.', 'Never.', 'Never.', undefined]);

    const mixed = jointTypeChoice(undefined as JointType | undefined, false, () => undefined, true);
    expect(mixed.chosen).toBe(-1);
    expect(mixed.invalid).toBe(false);
  });
});
