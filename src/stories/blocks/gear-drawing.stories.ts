import type { Meta, StoryObj } from '@storybook/angular-vite';
import { GearDrawingComponent } from '../../app/component/gears/gear-drawing.component';

const meta: Meta = {
  title: 'Canvas/Gear',
  component: GearDrawingComponent,
  tags: ['autodocs'],
  args: {
    gear: {
      id: 'G1',
      hostLinkId: 'AB',
      centerJointId: 'A',
      referenceJointId: 'B',
      teeth: 40,
      module: 5,
    },
    selected: false,
    invalid: false,
    detail: true,
  },
  render: (args) => ({
    props: args,
    template:
      '<svg viewBox="-120 -120 240 240" width="280" height="280"><g appGearDrawing [gear]="gear" [detail]="detail" [class.selected]="selected" [class.invalid]="invalid" /></svg>',
  }),
};
export default meta;
type Story = StoryObj;
export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Invalid: Story = { args: { invalid: true } };
export const LowDetail: Story = { args: { detail: false } };
export const LargeToothCount: Story = {
  args: {
    gear: {
      id: 'G1',
      hostLinkId: 'AB',
      centerJointId: 'A',
      referenceJointId: 'B',
      teeth: 100000,
      module: 0.002,
    },
  },
};
