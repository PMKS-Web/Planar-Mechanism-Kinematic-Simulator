import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SegmentedComponent } from '../../app/component/BLOCKS/segmented/segmented.component';
import { inPanel } from '../support/frame';

/**
 * `segmented-block`: the one control for every pick-one in the app. Index in,
 * index out; the pill slides to a choice the reader makes, and snaps into
 * place when the control first appears. Wrapped into two columns with a glyph
 * on each option, under a row that names it, it is how a joint's type is
 * chosen.
 */
const meta: Meta = {
  title: 'Choices/Segmented',
  component: SegmentedComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    options: ['Magnitude', 'X & Y'],
    selected: 0,
    disabled: false,
    disabledAt: [],
    reasons: [],
    compact: false,
    fill: true,
    wrap: false,
    icons: [],
    invalid: false,
    label: '',
    tooltip: '',
    mixed: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <segmented-block
        [options]="options"
        [selected]="selected"
        (selectedChange)="selected = $event"
        [disabled]="disabled"
        [disabledAt]="disabledAt"
        [reasons]="reasons"
        [compact]="compact"
        [fill]="fill"
        [wrap]="wrap"
        [icons]="icons"
        [invalid]="invalid"
        [label]="label"
        [tooltip]="tooltip"
        [mixed]="mixed"
      ></segmented-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

/** Each option as wide as its label, for a control at the end of a settings row. */
export const Fit: Story = { args: { options: ['X', 'Y', 'Magnitude'], fill: false } };

export const Compact: Story = { args: { compact: true } };

export const Disabled: Story = { args: { disabled: true } };

/** One choice grayed in place, so the reader can see it exists. */
export const OneUnavailable: Story = {
  args: { options: ['CSV', 'DXF', 'Report'], disabledAt: [1] },
};

export const LongLabels: Story = {
  args: { options: ['Position', 'Velocity', 'Acceleration'], selected: 2 },
};

const FLOATING = ['joint_revolute', 'joint_prismatic', 'joint_pin_in_slot', 'joint_welded'];

/** A joint's type, as the Edit panel offers it. */
const jointType = {
  label: 'Joint Type',
  tooltip: 'How the bodies meeting at this joint move against each other.',
  options: ['Revolute', 'Prismatic', 'Pin-in-slot', 'Welded'],
  icons: FLOATING,
  wrap: true,
};

/** Four options with glyphs, wrapped into two columns under the row that names them. */
export const JointType: Story = { args: { ...jointType, selected: 0 } };

/**
 * Chosen, not chosen, and refused: on a driven pin every other type is grayed,
 * and pointing at one gives the model's reason.
 *
 * Which side the reason opens on is the row it belongs to: Prismatic is on the
 * top row and opens above the control, Pin-in-slot and Welded are on the bottom
 * row and open below it. That way a reason is never over one of the four, which
 * is what it was: read why Welded is grayed, and the sentence sat over Revolute
 * and Prismatic until the pointer left it.
 */
export const JointTypeRefused: Story = {
  args: {
    ...jointType,
    selected: 0,
    disabledAt: [1, 2, 3],
    reasons: [
      undefined,
      'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
      'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
      'A weld says these bodies do not move relative to each other, and an input says they do. Remove the input first.',
    ],
  },
};

/**
 * One grayed option on the bottom row, which is the case that was reported: a
 * grounded slider with one link cannot be welded. Its reason opens *below* the
 * control, clear of Revolute and Prismatic, so that reading it and then pressing
 * one of them is one movement rather than a wait.
 */
export const JointTypeWeldRefused: Story = {
  args: {
    ...jointType,
    selected: 2,
    disabledAt: [3],
    reasons: [
      undefined,
      undefined,
      undefined,
      'A weld fuses the links that meet at a joint, and without its slot only one meets here.',
    ],
  },
};

/** Grounded: every glyph swaps to the set that stands on the frame. */
export const JointTypeGrounded: Story = {
  args: {
    ...jointType,
    icons: FLOATING.map((name) => `${name}_grounded`),
    selected: 2,
  },
};

/** The chosen value is not valid as it stands: a slider with nowhere to slide, in the refusal ink. */
export const JointTypeInvalid: Story = { args: { ...jointType, selected: 2, invalid: true } };

/** Joints that disagree: no option is chosen, and the row says Mixed. */
export const JointTypeMixed: Story = { args: { ...jointType, selected: -1, mixed: true } };
