import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ChipComponent } from '../../app/component/BLOCKS/chip/chip.component';
import { inPanel } from '../support/frame';

/**
 * `chip-block`: a small stated fact beside a heading — how many fixes a
 * mechanism needs, that it is ready, that a choice is the one in force.
 *
 * A label, not a control. It has no hover and no cursor of its own: inside a
 * mode tab the whole tab is one target, and a chip that lit up under the
 * pointer would read as a second thing to press.
 *
 * Red stops the analysis, amber lets it run with something worth reading,
 * green has nothing to say. `neutral` is a count with no verdict attached.
 */
const meta: Meta = {
  title: 'Feedback/Chip',
  component: ChipComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { kind: 'neutral', size: 'default', label: '2 fixes' },
  argTypes: {
    kind: { control: 'radio', options: ['neutral', 'blocker', 'warning', 'ok', 'on'] },
    size: { control: 'radio', options: ['default', 'small'] },
    label: { control: 'text' },
  },
  render: (args) => ({
    props: args,
    template: `<chip-block [kind]="kind" [size]="size">{{ label }}</chip-block>`,
  }),
};

export default meta;
type Story = StoryObj;

/** A count with no verdict attached — what force analysis shows when it cannot say. */
export const Neutral: Story = {};

/** Something stops the analysis from running at all. */
export const Blocker: Story = { args: { kind: 'blocker', label: '2 fixes' } };

/** It will run, but something is worth reading first. */
export const Warning: Story = { args: { kind: 'warning', label: '1 to check' } };

/** Nothing to say. */
export const Ready: Story = { args: { kind: 'ok', label: 'Ready' } };

/**
 * The one that is not a verdict: the choice in force, tinted the way the rest
 * of the synthesis panel tints what the reader has picked.
 */
export const InForce: Story = {
  args: { kind: 'on', size: 'small', label: 'Four-bar or six-bar' },
};

/**
 * A size down, for the synthesis panel's chooser — where a chip rides inside a
 * card rather than beside a heading, and the heading's size would crowd it.
 */
export const Small: Story = { args: { size: 'small', label: 'Not built yet' } };

/**
 * The three status colors together, which is how a reader meets them: the same
 * vocabulary in the mode tabs, the setup drawers and the tutorial card.
 */
export const EveryState: Story = {
  render: () => ({
    template: `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
        <chip-block kind="blocker">2 fixes</chip-block>
        <chip-block kind="warning">1 to check</chip-block>
        <chip-block kind="ok">Ready</chip-block>
        <chip-block kind="neutral">3 forces</chip-block>
      </div>
    `,
  }),
};
