import { FormControl, FormGroup } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DualInputComponent } from '../../app/component/BLOCKS/dual-input/dual-input.component';
import { inPanel } from '../support/frame';

/**
 * `dual-input-block`: a label with its help, then two short fields. The glyph
 * captions `L`, `D`, `M` and `⊾` are read aloud by name.
 */
const meta: Meta = {
  title: 'Blocks/Dual Input',
  component: DualInputComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Joint Position',
    tooltip: 'Where this joint is, measured from the origin.',
    label1: 'X',
    label2: 'Y',
    first: '2.50',
    second: '-1.25',
    disabled: false,
    noHeader: false,
    placeholder1: '',
    placeholder2: '',
  },
  render: ({ first, second, disabled, ...args }) => ({
    props: {
      ...args,
      disabled,
      form: new FormGroup({
        first: new FormControl({ value: first, disabled }),
        second: new FormControl({ value: second, disabled }),
      }),
    },
    template: `
      <dual-input-block
        [formGroup]="form"
        formControl1="first"
        formControl2="second"
        [label1]="label1"
        [label2]="label2"
        [tooltip]="tooltip"
        [disabled]="disabled"
        [noHeader]="noHeader"
        [placeholder1]="placeholder1"
        [placeholder2]="placeholder2"
      >{{ label }}</dual-input-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Position: Story = {};

export const LengthAndAngle: Story = {
  args: {
    label: 'Bar',
    tooltip: 'The distance between the two joints, and the angle from the positive x axis.',
    label1: 'L',
    label2: '⊾',
    first: '5.00',
    second: '36.87',
  },
};

/** Grayed with its help icon inert: a body of three or more joints has no single length. */
export const Disabled: Story = { args: { disabled: true } };

/** A multi-selection whose values differ: empty fields that say so. */
export const MixedValues: Story = {
  args: { first: '', second: '', placeholder1: 'Mixed', placeholder2: 'Mixed' },
};

/** Fields only, for a pair whose caption is the row above it. */
export const WithoutHeader: Story = { args: { noHeader: true } };
