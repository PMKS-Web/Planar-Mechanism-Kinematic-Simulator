import type { Meta, StoryObj } from '@storybook/angular-vite';
import { WorksheetLoopEditorComponent } from '../../app/component/solver-explanation/worksheet-loop-editor.component';
import { inPanel } from '../support/frame';

const meta: Meta<WorksheetLoopEditorComponent> = {
  title: 'Analysis/Loop Path',
  component: WorksheetLoopEditorComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400)],
  args: {
    path: 'A → B → C → D → A',
    validate: (path) => {
      const joints = path
        .trim()
        .split(/[\s,→]+/)
        .filter(Boolean);
      return joints.length >= 3 && joints[0] === joints.at(-1)
        ? undefined
        : 'Close the path by repeating its first joint at the end.';
    },
  },
};
export default meta;
type Story = StoryObj<WorksheetLoopEditorComponent>;
export const Default: Story = {};
export const Reversed: Story = { args: { path: 'A → D → C → B → A' } };
export const Dependent: Story = {
  args: {
    validate: () =>
      'This path repeats information in the other loops. Choose a different path so every independent closure is retained.',
  },
};
export const Disconnected: Story = {
  args: {
    path: 'A → C → D → A',
    validate: () => 'A and C have no connecting link or guide. Add the joint between them.',
  },
};
export const LongPath: Story = { args: { path: 'O → A → B → C → E → D → G → O' } };
