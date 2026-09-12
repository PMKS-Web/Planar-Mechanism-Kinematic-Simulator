import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SubtitleComponent } from '../../app/component/BLOCKS/subtitle/subtitle.component';
import { inPanel } from '../support/frame';

/** `subtitle-block`: a heading inside a card, with an optional description and button. */
const meta: Meta = {
  title: 'Structure/Subtitle',
  component: SubtitleComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { text: 'Traces', description: undefined, icon: undefined, buttonLabel: undefined },
  render: (args) => ({
    props: { ...args, noop: () => undefined },
    template: `
      <subtitle-block
        [description]="description"
        [icon]="icon"
        [buttonLabel]="buttonLabel"
        [click]="noop"
      >{{ text }}</subtitle-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Plain: Story = {};

export const WithDescription: Story = {
  args: { description: 'Paths drawn by points on the moving links.' },
};

export const WithButton: Story = { args: { icon: 'add', buttonLabel: 'Add' } };

export const IconButton: Story = { args: { icon: 'more_vert' } };

export const LongText: Story = {
  args: {
    text: 'Reaction Forces at Every Grounded Joint',
    description: 'Solved at each sample, in the units chosen in Settings.',
  },
};
