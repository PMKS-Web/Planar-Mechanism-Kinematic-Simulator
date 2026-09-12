import type { Meta, StoryObj } from '@storybook/angular-vite';
import { GearMeshSummaryComponent } from '../../app/component/gears/gear-mesh-summary.component';
import { inPanel } from '../support/frame';

const meta: Meta<GearMeshSummaryComponent> = {
  title: 'Feedback/Gear Mesh',
  component: GearMeshSummaryComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    a: {
      id: 'G1',
      name: 'Input gear',
      hostLinkId: 'AB',
      centerJointId: 'A',
      referenceJointId: 'B',
      teeth: 20,
      module: 20,
    },
    b: {
      id: 'G2',
      name: 'Dependent gear',
      hostLinkId: 'CD',
      centerJointId: 'C',
      referenceJointId: 'D',
      teeth: 40,
      module: 20,
    },
    actual: 3,
    required: 3,
    unit: 'cm',
    canCommit: true,
  },
};
export default meta;
type Story = StoryObj<GearMeshSummaryComponent>;
export const Valid: Story = {};
export const InvalidSpacing: Story = {
  args: {
    actual: 4,
    diagnostics: ['External gear centers must be separated by the sum of pitch radii.'],
  },
};
export const IncompatibleModule: Story = {
  args: { diagnostics: ['Meshed gears must have matching module.'] },
};
export const DependentGear: Story = { args: { canCommit: false } };
export const Disabled: Story = { args: { disabled: true } };
export const UnsupportedHost: Story = {
  args: { diagnostics: ['V1 requires a grounded revolute gear center.'] },
};
