import type { Meta, StoryObj } from '@storybook/angular-vite';
import { WorksheetChoicesComponent } from '../../app/component/solver-explanation/worksheet-choices.component';
import { inPanel } from '../support/frame';

const meta: Meta<WorksheetChoicesComponent> = {
  title: 'Analysis/Equation Conventions',
  component: WorksheetChoicesComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400)],
  args: {
    choices: [
      {
        key: 'Bx',
        label: 'X Direction on ABH',
        description: 'The direction on BCFG is opposite.',
        options: ['+X →', '−X ←'],
        selected: 0,
      },
      {
        key: 'By',
        label: 'Y Direction on ABH',
        description: 'The direction on BCFG is opposite.',
        options: ['+Y ↑', '−Y ↓'],
        selected: 0,
      },
    ],
  },
  render: (args) => ({
    props: {
      ...args,
      choose: function (event: { key: string; index: number }) {
        this['choices'] = this['choices'].map((c: { key: string }) =>
          c.key === event.key ? { ...c, selected: event.index } : c
        );
      },
    },
    template:
      '<app-worksheet-choices [choices]="choices" (chosen)="choose($event)"></app-worksheet-choices>',
  }),
};
export default meta;
type Story = StoryObj<WorksheetChoicesComponent>;
export const Default: Story = {};
export const Reversed: Story = {
  args: { choices: [{ ...meta.args!.choices![0], selected: 1 }, meta.args!.choices![1]] },
};
export const AngularDirection: Story = {
  args: {
    choices: [
      {
        key: 'angular',
        label: 'Positive Angular Direction',
        description: 'Applies to angular velocity and acceleration, including the known input.',
        options: ['Counterclockwise', 'Clockwise'],
        selected: 1,
      },
    ],
  },
};
export const LongBodyNames: Story = {
  args: {
    choices: [
      {
        key: 'J',
        label: 'Joint J · Couple',
        description: 'The reaction on the connected body has the opposite sign.',
        options: ['+ on ABCDEFGH', '− on ABCDEFGH'],
        selected: 0,
      },
    ],
  },
};
