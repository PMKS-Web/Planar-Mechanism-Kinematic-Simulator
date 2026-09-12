import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ShortcutTipDirective } from '../../app/component/BLOCKS/shortcut-tip/shortcut-tip.directive';
import { shortcutsStub } from '../support/stubs';

/**
 * `appShortcutTip`: a tooltip whose keyboard shortcut is drawn as a key cap
 * rather than written as words in brackets.
 *
 * `matTooltip` takes a string and nothing else, so "Undo (Cmd-Z)" arrived as
 * one run of identical text and the reader had to parse the brackets to find
 * the shortcut — harder than it sounds when the keys are not last, as in
 * "Play / Pause (Space)" beside "Step back one frame". Drawn as a key cap, in
 * the same type the Help panel uses for the same keys, it is a different kind
 * of thing at a glance and needs no parsing.
 *
 * **Only for controls that have a shortcut.** Everything else keeps
 * `matTooltip`, which is one dependency and one behavior fewer.
 *
 * The tip opens after a 400ms rest, matching Material's own delay, and closes
 * on leave, blur or click — a tip explaining the thing that just happened is
 * noise.
 *
 * *Hover a button below and wait a moment.*
 */
const meta: Meta = {
  title: 'Feedback/Shortcut Tip',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [shortcutsStub('Ctrl-Z')] })],
  render: () => ({
    moduleMetadata: { imports: [ShortcutTipDirective] },
    template: `
      <style>
        .sb-tipRow { display: flex; gap: 8px; align-items: center }
        .sb-tipRow button {
          height: 36px; padding: 0 12px; border: none; border-radius: 6px;
          background: var(--surface-field); color: var(--text-primary);
          font: inherit; cursor: pointer;
        }
        .sb-tipRow button:hover { background: var(--surface-hover) }
      </style>
      <div class="sb-tipRow">
        <button appShortcutTip="Undo" shortcutTipFor="edit.undo">Undo</button>
        <button appShortcutTip="Redo" shortcutTipFor="edit.redo">Redo</button>
        <button appShortcutTip="A control with no shortcut">Plain</button>
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

/** Disabled, for a control whose tip would be describing something it cannot do. */
export const Disabled: Story = {
  render: () => ({
    moduleMetadata: { imports: [ShortcutTipDirective] },
    template: `
      <button
        style="height: 36px; padding: 0 12px; border: none; border-radius: 6px;
               background: var(--surface-field); color: var(--text-disabled); font: inherit"
        appShortcutTip="Undo"
        shortcutTipFor="edit.undo"
        [shortcutTipDisabled]="true"
      >No tip</button>
    `,
  }),
};
