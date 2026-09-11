import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { InputComponent } from '../../app/component/BLOCKS/input/input.component';
import { inPanel } from '../support/frame';

/**
 * `input-block`: a label, its help, and one field with an optional unit. The
 * label is projected content; the value is a reactive form control.
 */
const meta: Meta = {
  title: 'Blocks/Input',
  component: InputComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Mass',
    tooltip: 'The mass of this link.',
    value: '1.50',
    unit: 'kg',
    disabled: false,
    stacked: false,
    wide: false,
    placeholder: '',
  },
  render: ({ value, disabled, ...args }) => ({
    props: {
      ...args,
      form: new FormGroup({ value: new FormControl({ value, disabled }) }),
    },
    template: `
      <input-block
        [formGroup]="form"
        _formControl="value"
        [unit]="unit"
        [tooltip]="tooltip"
        [stacked]="stacked"
        [wide]="wide"
        [placeholder]="placeholder"
      >{{ label }}</input-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const WithUnit: Story = {};

export const Disabled: Story = { args: { disabled: true } };

/**
 * Material's own invalid state, shown by any control with a failing validator
 * once it has been touched. The app's panels mostly refuse a bad value with a
 * notification on blur instead, and put the old value back.
 */
export const Invalid: Story = {
  render: (args) => {
    const control = new FormControl('1.5.0', Validators.pattern(/^-?\d*\.?\d+$/));
    control.markAsTouched();
    return {
      props: { ...args, form: new FormGroup({ value: control }) },
      template: `
        <input-block [formGroup]="form" _formControl="value" [unit]="unit" [tooltip]="tooltip"
          >{{ label }}</input-block>
      `,
    };
  },
};

/** A label too long to share its line with the field. */
export const StackedLongLabel: Story = {
  args: {
    label: 'Moment of Inertia',
    tooltip: 'How hard this link is to turn about its center of mass.',
    value: '12.40',
    unit: 'kg·cm²',
    stacked: true,
  },
};

/** A multi-selection whose values differ. */
export const MixedValues: Story = { args: { value: '', placeholder: 'Mixed' } };

/** A unit the reader picks rather than types. */
export const UnitPicker: Story = {
  render: (args) => ({
    props: {
      ...args,
      units: [
        { value: 'N', label: 'N' },
        { value: 'kgf', label: 'kgf' },
      ],
      form: new FormGroup({ value: new FormControl('9.81'), unit: new FormControl('N') }),
    },
    template: `
      <input-block
        [formGroup]="form"
        _formControl="value"
        [unitOptions]="units"
        unitFormControl="unit"
        tooltip="How hard this force pushes."
        wide
      >Magnitude</input-block>
    `,
  }),
};
