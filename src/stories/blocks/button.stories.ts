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
