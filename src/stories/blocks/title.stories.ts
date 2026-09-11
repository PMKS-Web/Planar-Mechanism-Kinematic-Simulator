import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TitleBlock } from '../../app/component/BLOCKS/title/title.component';
import { inPanel } from '../support/frame';

/**
 * `title-block`: a card's heading. With `expand_less` or `expand_more` as its
 * icon the button swaps chevrons on press, which is how
 * `panel-section-collapsible` opens and closes.
 */
const meta: Meta = {
  title: 'Blocks/Title',
  component: TitleBlock,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { text: 'Joint A', description: undefined, icon: undefined, buttonLabel: undefined },
  render: (args) => ({
    props: args,
    template: `
      <title-block [description]="description" [icon]="icon" [buttonLabel]="buttonLabel"
        >{{ text }}</title-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Plain: Story = {};

export const WithDescription: Story = {
  args: { description: 'Grounded, and driven at 10 RPM.' },
};

export const Collapsible: Story = { args: { text: 'Input Settings', icon: 'expand_less' } };

export const WithButton: Story = {
  args: { text: 'Mechanisms', icon: 'add', buttonLabel: 'Add' },
};

export const LongTitle: Story = {
  args: { text: 'Kinematic Analysis Setup for Mechanism M2' },
};
