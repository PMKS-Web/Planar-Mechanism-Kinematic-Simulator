import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { GearFieldsComponent } from '../../app/component/gears/gear-fields.component';
import { inPanel } from '../support/frame';

const meta: Meta = {
  title: 'Fields/Gear Properties',
  component: GearFieldsComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { name: 'Output gear', teeth: '40', diameter: '4', unit: 'cm', disabled: false },
  render: ({ name, teeth, diameter, disabled, ...args }) => ({
    props: {
      ...args,
      form: new FormGroup({
        name: new FormControl({ value: name, disabled }),
        teeth: new FormControl({ value: teeth, disabled }, [
          Validators.min(1),
          Validators.pattern(/^\d+$/),
        ]),
        diameter: new FormControl({ value: diameter, disabled }, Validators.min(Number.MIN_VALUE)),
      }),
    },
    template: '<app-gear-fields [form]="form" [unit]="unit" />',
  }),
};
export default meta;
type Story = StoryObj;
export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = { args: { teeth: '-1', diameter: '0' } };
export const DenseValues: Story = {
  args: {
    name: 'Output gear attached to the crank of the closed four-bar',
    teeth: '1000000',
    diameter: '100000.25',
    unit: 'in',
  },
};
