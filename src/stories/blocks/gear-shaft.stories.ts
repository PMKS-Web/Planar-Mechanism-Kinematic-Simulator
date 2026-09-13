import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { GearShaftDrawingComponent } from '../../app/component/gears/gear-shaft-drawing.component';
import { ModelFrameDirective } from '../../app/model-frame.directive';

const rear = {
  id: 'GB',
  name: 'Gear B',
  hostLinkId: 'CD',
  centerJointId: 'C',
  referenceJointId: 'D',
  teeth: 40,
  module: 5,
};
const front = { ...rear, id: 'GC', name: 'Gear C', teeth: 10, plane: 1 };
const meta: Meta = {
  title: 'Canvas/Gear Shaft',
  component: GearShaftDrawingComponent,
  tags: ['autodocs'],
  decorators: [moduleMetadata({ imports: [ModelFrameDirective] })],
  args: { gears: [rear, front], selectedId: undefined, invalidIds: [], detail: true },
  render: (args) => ({
    props: args,
    template:
      '<svg viewBox="-130 -130 260 260" width="320" height="320"><g modelFrame><g appGearShaftDrawing [gears]="gears" [selectedId]="selectedId" [invalidIds]="invalidIds" [detail]="detail" [headingDegrees]="20" [labelSize]="12" (picked)="selectedId=$event" /></g></svg>',
  }),
};
export default meta;
type Story = StoryObj;
export const CompoundPair: Story = {};
export const SelectedFront: Story = { args: { selectedId: 'GC' } };
export const SelectedRear: Story = { args: { selectedId: 'GB' } };
export const ThreeGearShaft: Story = {
  args: { gears: [rear, front, { ...rear, id: 'GE', name: 'Gear E', teeth: 24, plane: 2 }] },
};
export const CoincidentOutlines: Story = {
  args: { gears: [rear, { ...front, teeth: 40 }], selectedId: 'GC' },
};
export const InvalidOverlap: Story = {
  args: { gears: [rear, { ...front, plane: 0 }], invalidIds: ['GB', 'GC'] },
};
export const LowDetail: Story = { args: { detail: false } };
