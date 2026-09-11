import type { Meta, StoryObj } from '@storybook/angular-vite';
import { DualButtonComponent } from '../../app/component/BLOCKS/dual-button/dual-button.component';
import { inPanel } from '../support/frame';

/**
 * `dual-button`: two stroked buttons sharing a row, each with an app SVG icon.
 * Only the second can be disabled, and the block has no input for a reason --
 * a caller that disables it owes the reader one nearby.
 */
const meta: Meta = {
  title: 'Blocks/Dual Button',
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
        [but2Text]="but2Text"
        [but2Icon]="but2Icon"
        [but2Action]="noop"
        [btn2Disabled]="btn2Disabled"
      ></dual-button>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Pair: Story = {};

export const SecondDisabled: Story = { args: { btn2Disabled: true } };

export const Single: Story = { args: { but2Text: undefined } };

export const LongLabels: Story = {
  args: {
    but1Text: 'Show Path',
    but1Icon: 'show_path',
    but2Text: 'Hide Every Path',
    but2Icon: 'hide_path',
  },
};
