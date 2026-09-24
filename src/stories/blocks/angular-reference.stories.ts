import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SolverDiagramComponent } from '../../app/component/solver-explanation/solver-diagram.component';
import { inPanel } from '../support/frame';
const points = [
  { x: 0, y: 0, label: 'A' },
  { x: 200, y: 40, label: 'B' },
  { x: 100, y: 180, label: 'H' },
];
const diagram = {
  points,
  outlines: [points],
  lines: [],
  framingPoints: [
    { x: -70, y: -70 },
    { x: 270, y: 250 },
  ],
  rotations: [{ x: 100, y: 73, sign: 1, label: 'ABH' }],
  legend: 'Arrows define positive ω and α',
};
const meta: Meta<SolverDiagramComponent> = {
  title: 'Analysis/Angular Reference',
  component: SolverDiagramComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400)],
  args: { diagram, label: 'Positive angular direction on link ABH' },
};
export default meta;
type Story = StoryObj<SolverDiagramComponent>;
export const Counterclockwise: Story = {};
export const Clockwise: Story = {
  args: { diagram: { ...diagram, rotations: [{ ...diagram.rotations[0], sign: -1 }] } },
};
