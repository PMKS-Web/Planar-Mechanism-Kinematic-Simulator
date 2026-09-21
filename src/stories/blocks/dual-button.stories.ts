import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DualButtonComponent } from '../../app/component/BLOCKS/dual-button/dual-button.component';
import { inPanel } from '../support/frame';

/**
 * `dual-button`: two stroked buttons sharing a row, each with an app SVG icon.
 * Either half can be disabled. Its tooltip remains reachable through the
 * wrapper because a disabled native button does not receive hover events.
 */
const meta: Meta = {
  title: 'Actions/Dual Button',
  component: DualButtonComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    but1Text: 'Weld Joint',
    but1Icon: 'weld_joint',
    but2Text: 'Unweld Joint',
    but2Icon: 'unweld_joint',
    btn2Disabled: false,
  },
  render: (args) => ({
    props: { ...args, noop: () => undefined },
    template: `
      <dual-button
        [but1Text]="but1Text"
        [but1Icon]="but1Icon"
        [but1Action]="noop"
        [btn1Disabled]="btn1Disabled"
        [btn1Tooltip]="btn1Tooltip"
        [but1WidthText]="but1WidthText"
        [but2Text]="but2Text"
        [but2Icon]="but2Icon"
        [but2Action]="noop"
        [btn2Disabled]="btn2Disabled"
        [btn2Tooltip]="btn2Tooltip"
      ></dual-button>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Pair: Story = {};

export const SecondDisabled: Story = { args: { btn2Disabled: true } };

export const FirstDisabled: Story = {
  args: { btn1Disabled: true, btn1Tooltip: 'This action is unavailable.' },
};

export const RefusedPair: Story = {
  args: {
    but1Text: 'Add Input',
    but1Icon: 'add_input',
    btn1Disabled: true,
    btn1Tooltip: 'This joint cannot be driven.',
    but2Text: 'Split Joint',
    but2Icon: 'joint_split',
    btn2Disabled: true,
    btn2Tooltip: 'Only one link is on this joint, so there is nothing to split.',
  },
};

export const StableChangingLabel: Story = {
  args: {
    but1Text: 'Add Input',
    but1WidthText: 'Remove Input',
    but1Icon: 'add_input',
    but2Text: 'Split Joint',
    but2Icon: 'joint_split',
  },
};

export const Single: Story = { args: { but2Text: undefined } };

export const LongLabels: Story = {
  args: {
    but1Text: 'Show Path',
    but1Icon: 'show_path',
    but2Text: 'Hide Every Path',
    but2Icon: 'hide_path',
  },
};
