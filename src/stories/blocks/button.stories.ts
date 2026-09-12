import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ButtonComponent } from '../../app/component/BLOCKS/button/button.component';
import { SETTINGS_AT_START_ONLY } from '../../app/model/edit-permission';
import { inPanel } from '../support/frame';

/**
 * `button-block`: the panel's stroked button. Its label is projected content;
 * the icon is either a Material ligature (`icon`) or one of the app's SVGs
 * (`customIcon`). The tooltip hangs on the row rather than the button, so it
 * still opens while the button is disabled -- which is when a reason is needed.
 */
const meta: Meta = {
  title: 'Actions/Button',
  component: ButtonComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: {
    label: 'Add Tracer Point',
    icon: 'add',
    customIcon: undefined,
    color: 'primary',
    disabled: false,
    tooltip: undefined,
    inline: false,
    filled: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <button-block
        [icon]="icon"
        [customIcon]="customIcon"
        [color]="color"
        [disabled]="disabled"
        [tooltip]="tooltip"
        [inline]="inline"
        [filled]="filled"
      >{{ label }}</button-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

export const AppIcon: Story = {
  args: { icon: undefined, customIcon: 'add_force', label: 'Attach Force' },
};

/** Disabled, with the reason on hover -- quoted from the permission model, not written here. */
export const DisabledWithReason: Story = {
  args: {
    label: 'Change Units',
    icon: 'straighten',
    disabled: true,
    tooltip: SETTINGS_AT_START_ONLY.long,
  },
};

export const Warn: Story = {
  args: {
    label: 'Delete Mechanism',
    icon: undefined,
    customIcon: 'delete_mechanism',
    color: 'warn',
  },
};

export const LongLabel: Story = {
  args: { label: 'Attach Tracer Point to Every Selected Link' },
};

/**
 * Sized to its own label rather than to the panel, for a button that sits in a
 * row with something else: the analysis setup drawer's "Go To Joint B" inside
 * a check, the synthesis panel's action beside a section heading. Both drew
 * their own button before this, at 32px and 28px.
 */
export const Inline: Story = {
  args: { inline: true, label: 'Go To Joint B', icon: 'my_location' },
};

/**
 * Filled, for the one action a panel is steering the reader towards. Stroked
 * stays the default: a panel with two filled buttons has told the reader
 * nothing.
 */
export const Filled: Story = {
  args: { inline: true, filled: true, label: 'Add position 1', icon: 'ads_click' },
};

/** The two side by side, which is how the synthesis panel's heading shows them. */
export const InlinePair: Story = {
  render: () => ({
    template: `
      <div style="display: flex; align-items: center; gap: 6px">
        <button-block inline filled icon="ads_click">Add position 1</button-block>
        <button-block inline icon="content_copy"></button-block>
      </div>
    `,
  }),
};
