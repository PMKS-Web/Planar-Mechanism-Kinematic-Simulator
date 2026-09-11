import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { EditableTitleComponent } from '../../app/component/BLOCKS/editable-title/editable-title.component';
import { inPanel } from '../support/frame';
import { mechanismStub, selectionStub } from '../support/stubs';

/**
 * `editable-title-block`: the Edit panel's heading, with Rename, Lock and
 * Delete. It reads the selected object itself, so the stories hand it a stub
 * selection named `A` and a stub mechanism; Rename works against those, and
 * Lock and Delete press nothing real.
 */
const meta: Meta = {
  title: 'Blocks/Editable Title',
  component: EditableTitleComponent,
  tags: ['autodocs'],
  decorators: [
    // Straight on the card, as in the Edit panel: the block brings its own padding.
    inPanel(250, 0),
    applicationConfig({ providers: [mechanismStub(), selectionStub('A')] }),
  ],
  args: {
    kind: 'Joint',
    displayName: 'A',
    lockState: false,
    renamable: true,
    deleteLabel: undefined,
    deleteDisabled: false,
  },
  render: (args) => ({
    props: { ...args, noop: () => undefined },
    template: `
      <editable-title-block
        [displayName]="displayName"
        [deleteAction]="noop"
        [toggleLockAction]="noop"
        [lockState]="lockState"
        [renamable]="renamable"
        [deleteLabel]="deleteLabel"
        [deleteDisabled]="deleteDisabled"
      >{{ kind }}</editable-title-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Joint: Story = {};

export const Locked: Story = { args: { lockState: true } };

/** A group: no one name to change, so Delete takes the row's spare width and a label. */
export const Group: Story = {
  args: {
    kind: 'Selection',
    displayName: '8 parts',
    renamable: false,
    lockState: 'mixed',
    deleteLabel: 'Delete 8 Parts',
  },
};

/** Delete grayed. The block takes no reason; the panel's strip above it carries one. */
export const DeleteDisabled: Story = { args: { deleteDisabled: true } };

export const LongName: Story = {
  args: { kind: 'Link', displayName: 'CouplerExtensionArm' },
};
