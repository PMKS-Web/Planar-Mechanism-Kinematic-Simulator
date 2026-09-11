import { FormControl, FormGroup } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { StateInputComponent } from '../../app/component/BLOCKS/state-input/state-input.component';
import { inPanel } from '../support/frame';

/**
 * `state-input`: a bare field with a marker for where its value came from. A
 * hollow dot follows the shape; a filled dot with a clear button was typed.
 */
const meta: Meta = {
  title: 'Blocks/State Input',
  component: StateInputComponent,
  tags: ['autodocs'],
  decorators: [inPanel(120)],
  args: { state: 'none', value: '2.00' },
  argTypes: { state: { control: 'inline-radio', options: ['none', 'auto', 'custom'] } },
  render: ({ value, ...args }) => ({
    props: { ...args, form: new FormGroup({ value: new FormControl(value) }) },
    template: `<state-input [formGroup]="form" _formControl="value" [state]="state"></state-input>`,
  }),
};

export default meta;
type Story = StoryObj;

export const NoMarker: Story = {};

export const FollowsShape: Story = { args: { state: 'auto' } };

export const Typed: Story = { args: { state: 'custom', value: '2.35' } };
