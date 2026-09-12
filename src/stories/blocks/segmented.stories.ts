import type { Meta, StoryObj } from '@storybook/angular-vite';
import { SegmentedComponent } from '../../app/component/BLOCKS/segmented/segmented.component';
import { inPanel } from '../support/frame';

/**
 * `segmented-block`: the one control for every pick-one in the app. Index in,
 * index out; the pill slides to a choice the reader makes, and snaps into
 * place when the control first appears.
 */
const meta: Meta = {
  title: 'Choices/Segmented',
  component: SegmentedComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    options: ['Magnitude', 'X & Y'],
    selected: 0,
    disabled: false,
    disabledAt: [],
    compact: false,
    fill: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <segmented-block
        [options]="options"
        [selected]="selected"
        (selectedChange)="selected = $event"
        [disabled]="disabled"
        [disabledAt]="disabledAt"
        [compact]="compact"
        [fill]="fill"
      ></segmented-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

/** Each option as wide as its label, for a control at the end of a settings row. */
export const Fit: Story = { args: { options: ['X', 'Y', 'Magnitude'], fill: false } };

export const Compact: Story = { args: { compact: true } };

export const Disabled: Story = { args: { disabled: true } };

/** One choice grayed in place, so the reader can see it exists. */
export const OneUnavailable: Story = {
  args: { options: ['CSV', 'DXF', 'Report'], disabledAt: [1] },
};

export const LongLabels: Story = {
  args: { options: ['Position', 'Velocity', 'Acceleration'], selected: 2 },
};
