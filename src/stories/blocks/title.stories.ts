import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TitleBlock } from '../../app/component/BLOCKS/title/title.component';
import { inPanel } from '../support/frame';

/**
 * `title-block`: a card's heading, with an optional description line and an
 * optional icon button on the right. It shares its inputs with
 * `subtitle-block`, which differs only in type size; see the Reuse backlog.
 */
const meta: Meta = {
  title: 'Structure/Title',
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

export const WithIcon: Story = { args: { text: 'Input Settings', icon: 'expand_less' } };

export const WithButton: Story = {
  args: { text: 'Mechanisms', icon: 'add', buttonLabel: 'Add' },
};

export const LongTitle: Story = {
  args: { text: 'Kinematic Analysis Setup for Mechanism M2' },
};
