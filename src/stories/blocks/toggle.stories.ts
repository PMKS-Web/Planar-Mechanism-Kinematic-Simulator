import { FormControl, FormGroup } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ToggleComponent } from '../../app/component/BLOCKS/toggle/toggle.component';
import { inPanel } from '../support/frame';

/**
 * `toggle-block`: a labeled switch bound to a form control, optionally with a
 * short angle field beside it (the Slider row carries its slot's angle).
 * `disabled` grays the switch; `disableInput` is only about the field.
 */
const meta: Meta = {
  title: 'Blocks/Toggle',
  component: ToggleComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Grounded',
    tooltip: 'Whether this joint is pinned to the ground.',
    on: false,
    disabled: false,
    mixed: false,
    addInput: false,
    disableInput: false,
  },
  render: ({ on, disabled, disableInput, ...args }) => ({
    props: {
      ...args,
      disabled,
      disableInput,
      form: new FormGroup({
        state: new FormControl({ value: on, disabled }),
        angle: new FormControl({ value: '90.00', disabled: disableInput }),
      }),
    },
    template: `
      <toggle-block
        [formGroup]="form"
        _formControl="state"
        _formControlForInput="angle"
        [tooltip]="tooltip"
        [disabled]="disabled"
        [mixed]="mixed"
        [addInput]="addInput"
        [disableInput]="disableInput"
      >{{ label }}</toggle-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Off: Story = {};

export const On: Story = { args: { on: true } };

export const Disabled: Story = { args: { disabled: true } };

/** A multi-selection whose parts disagree. */
export const Mixed: Story = { args: { mixed: true } };

export const WithAngleField: Story = {
  args: { label: 'Slider', on: true, addInput: true },
};

export const AngleFieldDisabled: Story = {
  args: { label: 'Slider', on: false, addInput: true, disableInput: true },
};

export const LongLabel: Story = {
  args: { label: 'Show the Path Traced by This Joint', tooltip: 'Draw where this joint goes.' },
};
