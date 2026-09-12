import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ContextMenuComponent } from '../../app/component/context-menu/context-menu.component';
import { ContextMenuModel, MenuRow } from '../../app/component/context-menu/menu-model';
import { shortcutsStub } from '../support/stubs';

/**
 * `app-context-menu`: the right-click menu, rendered from a `ContextMenuModel`.
 *
 * It is a dumb renderer. Everything about what a row says, whether it can be
 * used and why not is decided by `ContextMenuBuilderService`, which reads the
 * answers out of the model that enforces them -- so a grayed row here carries
 * the model's own words in its right-hand slot, never a sentence written in
 * the template. The shape is fixed: a header naming what was clicked, a ladder
 * of groups, and a red footer that is always last.
 */
function joint(): ContextMenuModel {
  const noop = () => undefined;
  return {
    header: {
      title: 'Joint B',
      subtitle: 'Pin · Links AB, BC',
      crossing: { icon: 'insights', material: true, tip: 'Kinematic Analysis', action: noop },
    },
    groups: [
      {
        label: 'Attach',
        rows: [
          new MenuRow({ label: 'Link', icon: 'add', material: true, action: noop, hint: 'L' }),
          new MenuRow({ label: 'Force', icon: 'north_east', material: true, action: noop }),
          new MenuRow({
            label: 'Tracer Point',
            icon: 'timeline',
            material: true,
            action: noop,
            refusal: { short: 'on a link only', long: 'A tracer point rides a link, not a joint.' },
          }),
        ],
      },
      {
        label: 'State',
        rows: [
          new MenuRow({
            label: 'Grounded',
            icon: 'anchor',
            material: true,
            kind: 'toggle',
            checked: true,
            action: noop,
          }),
          new MenuRow({
            label: 'Driven Input',
            icon: 'bolt',
            material: true,
            kind: 'toggle',
            action: noop,
          }),
          new MenuRow({
            label: 'Welded',
            icon: 'join_full',
            material: true,
            kind: 'toggle',
            action: noop,
            refusal: {
              short: 'needs two links',
              long: 'Welding fuses two links at a joint; this one has none to fuse.',
            },
          }),
          new MenuRow({
            label: 'Locked',
            icon: 'lock',
            material: true,
            kind: 'toggle',
            action: noop,
            shortcut: 'K',
          }),
        ],
      },
      {
        rows: [
          new MenuRow({
            label: 'Delete Joint',
            icon: 'delete',
            material: true,
            destructive: true,
            action: noop,
            shortcut: '⌫',
          }),
        ],
      },
    ],
  };
}

const meta: Meta = {
  title: 'Feedback/Context Menu',
  component: ContextMenuComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [shortcutsStub()] })],
  parameters: { controls: { disable: true } },
  render: (args) => ({
    props: args,
    template: `<app-context-menu [model]="model"></app-context-menu>`,
  }),
};

export default meta;
type Story = StoryObj;

/** A joint's menu: the header, the Attach and State groups, the footer. */
export const Joint: Story = { args: { model: joint() } };

/** The same menu with the mechanism parked mid-cycle: the rows that would write a pose are grayed, and say so. */
export const PausedMidCycle: Story = {
  args: {
    model: (() => {
      const model = joint();
      const paused = {
        short: 'needs the start pose',
        long: 'Return to the start pose to change the mechanism.',
      };
      for (const group of model.groups.slice(0, 2))
        for (const row of group.rows) row.refusal ??= paused;
      return model;
    })(),
  },
};

/** Nothing to offer: the empty card, which the builder normally never opens. */
export const Empty: Story = { args: { model: { groups: [] } } };
