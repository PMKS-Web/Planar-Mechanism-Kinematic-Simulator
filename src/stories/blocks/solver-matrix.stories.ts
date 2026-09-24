import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SolverMatrixComponent } from '../../app/component/solver-explanation/solver-matrix.component';
import { inPanel } from '../support/frame';
const meta: Meta<SolverMatrixComponent> = {
  title: 'Analysis/Numbered Force Matrix',
  component: SolverMatrixComponent,
  tags: ['autodocs'],
  decorators: [inPanel(700)],
  args: {
    title: 'Force Matrix and Solution',
    numbered: true,
    expanded: true,
    system: {
      A: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 2, 1],
      ],
      b: [10, 20, 50],
      x: [10, 20, 10],
      unknowns: [
        { label: 'A_x', unit: 'N' },
        { label: 'A_y', unit: 'N' },
        { label: 'M_{\\mathrm{in}}', unit: 'N·m' },
      ],
      rows: ['Body AB · Force x', 'Body AB · Force y', 'Body AB · Moment'],
    },
  },
};
export default meta;
export const Expanded: StoryObj<SolverMatrixComponent> = {};
export const Phone: StoryObj<SolverMatrixComponent> = { decorators: [inPanel(340)] };
