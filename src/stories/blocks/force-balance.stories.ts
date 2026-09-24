import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ForceBalanceComponent } from '../../app/component/solver-explanation/force-balance.component';
import { inPanel } from '../support/frame';
const points = [
  { x: 0, y: 0, label: 'A', reference: true },
  { x: 200, y: 0, label: 'B' },
  { x: 100, y: 0, label: 'CoM' },
];
const loads = [
  { from: points[0], to: { x: 45, y: 0 }, label: 'Ax', balanceAxes: [0] },
  { from: points[0], to: { x: 0, y: 60 }, label: 'Ay', balanceAxes: [1] },
  { from: points[1], to: { x: 245, y: 0 }, label: 'Bx', balanceAxes: [0] },
  { from: points[1], to: { x: 200, y: 60 }, label: 'By', balanceAxes: [1, 2] },
  { from: points[2], to: { x: 100, y: -60 }, label: 'W', balanceAxes: [1, 2] },
];
const meta: Meta<ForceBalanceComponent> = {
  title: 'Analysis/From FBD to Equations',
  component: ForceBalanceComponent,
  tags: ['autodocs'],
  decorators: [inPanel(940)],
  args: {
    name: 'AB',
    reference: 'A',
    assumed: true,
    dynamic: false,
    diagram: {
      points,
      momentLabel: 'A',
      framingPoints: [
        { x: -80, y: -100 },
        { x: 280, y: 100 },
      ],
      lines: [
        { from: points[0], to: points[1], width: 3 },
        ...loads.map((l) => ({ ...l, arrow: true, color: 'var(--warning)' })),
      ],
    },
    equations: [
      { label: 'Force · x', symbolic: 'A_x+B_x=0' },
      { label: 'Force · y', symbolic: 'A_y+B_y-W=0' },
      { label: 'Moment about A · z', symbolic: 'L B_y-\\frac{L}{2}W=0' },
    ],
  },
};
export default meta;
type Story = StoryObj<ForceBalanceComponent>;
export const Static: Story = {};
export const InMotion: Story = {
  args: {
    dynamic: true,
    equations: [
      { label: 'Force · x', symbolic: 'A_x+B_x=m a_{\\mathrm{CoM},x}' },
      { label: 'Force · y', symbolic: 'A_y+B_y-W=m a_{\\mathrm{CoM},y}' },
      {
        label: 'Moment about A · z',
        symbolic: 'L B_y-\\frac{L}{2}W=I_{\\mathrm{CoM}}\\alpha+\\frac{L}{2}m a_{\\mathrm{CoM},y}',
      },
    ],
  },
};
