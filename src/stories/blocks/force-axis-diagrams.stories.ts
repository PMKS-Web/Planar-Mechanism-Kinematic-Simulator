import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SolverDiagramComponent } from '../../app/component/solver-explanation/solver-diagram.component';
import { momentArmDiagram } from '../../app/component/solver-explanation/force-axis-diagrams';
import { inPanel } from '../support/frame';

const meta: Meta<SolverDiagramComponent> = {
  title: 'Analysis/Force Axes and Moment Arms',
  component: SolverDiagramComponent,
  decorators: [inPanel(440)],
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<SolverDiagramComponent>;
export const RotatedAxes: Story = {
  args: {
    diagram: momentArmDiagram([0, 0], [180, 90], 'A', 'P1', 30),
    label: 'Moment arm in a frame rotated 30 degrees',
  },
};
export const NegativeComponents: Story = {
  args: { diagram: momentArmDiagram([100, 120], [-80, 10], 'CoM', 'B', 0) },
};
export const CrowdedLabels: Story = {
  args: {
    diagram: {
      points: [
        { x: 0, y: 0, label: 'A' },
        { x: 0, y: 0, label: 'CoM' },
        { x: 1, y: 0, label: 'P1' },
      ],
      framingPoints: [
        { x: -60, y: -60 },
        { x: 60, y: 60 },
      ],
      lines: [
        { from: { x: 0, y: 0 }, to: { x: 30, y: 30 }, label: 'Ax', arrow: true },
        { from: { x: 1, y: 0 }, to: { x: 30, y: 30 }, label: 'F_1', arrow: true },
      ],
    },
  },
};
