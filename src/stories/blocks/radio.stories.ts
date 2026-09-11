import { FormControl, FormGroup } from '@angular/forms';
import type { Meta, StoryObj } from '@storybook/angular-vite';
import { RadioComponent } from '../../app/component/BLOCKS/radio/radio.component';
import { inPanel } from '../support/frame';

/**
 * `radio-block`: a labeled pick-one bound to a form control. It draws the same
 * pill as `segmented-block`; the control holds the chosen index as a string.
 */
const meta: Meta = {
  title: 'Blocks/Radio',
  component: RadioComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Force Frame',
    tooltip: 'Whether this force keeps its direction on the page or turns with its link.',
    option1: 'Global',
    option2: 'Local',
    option3: undefined,
    disabled: false,
  },
  render: (args) => ({
    props: { ...args, form: new FormGroup({ choice: new FormControl('0') }) },
    template: `
      <radio-block
        [formGroup]="form"
        _formControl="choice"
        [tooltip]="tooltip"
        [option1]="option1"
        [option2]="option2"
        [option3]="option3"
        [disabled]="disabled"
      >{{ label }}</radio-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const TwoOptions: Story = {};

export const ThreeOptions: Story = {
  args: {
    label: 'Unit System',
    tooltip: 'The units every length, mass and force is shown in.',
    option1: 'Metric',
    option2: 'English',
    option3: 'SI',
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const LongLabels: Story = {
  args: {
    label: 'Graph',
    tooltip: 'What the chart plots.',
    option1: 'Position',
    option2: 'Velocity',
    option3: 'Acceleration',
  },
};
