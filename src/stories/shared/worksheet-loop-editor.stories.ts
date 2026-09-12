import type { Meta, StoryObj } from '@storybook/angular-vite';
import { WorksheetLoopEditorComponent } from '../../app/component/solver-explanation/worksheet-loop-editor.component';
import { inPanel } from '../support/frame';

const path = 'A → B → C → D → A';
const reverse = 'A → D → C → B → A';
const option = (value: string) => ({ value, label: value, disabled: false });
const meta: Meta<WorksheetLoopEditorComponent> = {
  title: 'Analysis/Loop Path',
  component: WorksheetLoopEditorComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400)],
  args: { path, options: [option(path), option(reverse)], limited: false },
  render: (args) => ({
    props: args,
    template: `<app-worksheet-loop-editor [path]="path" [options]="options" [limited]="limited" (applied)="path = $event" (reversed)="path = options[path === options[0].value ? 1 : 0].value" />`,
  }),
};
export default meta;
type Story = StoryObj<WorksheetLoopEditorComponent>;
export const Default: Story = {};
export const Reversed: Story = { args: { path: reverse } };
export const Dependent: Story = {
  args: {
    options: [
      option(path),
      option(reverse),
      { value: 'A → E → C → D → A', label: 'A → E → C → D → A (dependent)', disabled: true },
    ],
  },
};
export const Limited: Story = { args: { limited: true } };
export const LongPath: Story = {
  args: {
    path: 'O → A → B → C → E → D → G → O',
    options: [option('O → A → B → C → E → D → G → O'), option('O → G → D → E → C → B → A → O')],
  },
};
