import type { Meta, StoryObj } from '@storybook/angular-vite';
import { WorksheetLoopVisualComponent } from '../../app/component/solver-explanation/worksheet-loop-visual.component';
import { inPanel } from '../support/frame';

const points = [
  { id: 'A', label: 'A', x: 0, y: 0, ground: true },
  { id: 'B', label: 'B', x: 100, y: 140 },
  { id: 'C', label: 'C', x: 360, y: 110 },
  { id: 'D', label: 'D', x: 480, y: 0, ground: true },
  { id: 'E', label: 'E', x: 260, y: 240 },
];
const edges = [0, 1, 2, 3].map((i) => ({
  from: points[i],
  to: points[(i + 1) % 4],
  kind: i === 3 ? 'ground' : 'link',
}));
const mechanism = {
  points,
  lines: [
    { from: points[0], to: points[1] },
    { from: points[2], to: points[3] },
  ],
  outlines: [[points[1], points[2], points[4]]],
};
const meta: Meta<WorksheetLoopVisualComponent> = {
  title: 'Analysis/Trace a Loop',
  component: WorksheetLoopVisualComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400)],
  args: { mechanism, edges, unit: 'cm' },
};
export default meta;
type Story = StoryObj<WorksheetLoopVisualComponent>;
export const WholeMechanism: Story = {};
export const Reversed: Story = {
  args: { edges: [...edges].reverse().map((e) => ({ ...e, from: e.to, to: e.from })) },
};
