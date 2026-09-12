import type { Meta, StoryObj } from '@storybook/angular-vite';
import { CloseButtonComponent } from '../../app/component/BLOCKS/close-button/close-button.component';
import { atWidth } from '../support/frame';

/**
 * `close-button`: the button that closes a card, a drawer or a dialog.
 *
 * There were five of these and they agreed on nothing — 32px round in the
 * tutorial card and the right drawer, 36px with 6px corners in the release
 * notes, and Material's 40px icon button in the library and the CAD export
 * dialog. Even the two round ones washed differently on hover, at 4% and 6%.
 *
 * One look now: the 32px round one the drawer and the tutorial already shared,
 * washing on hover at the 4% every other icon button in the app uses.
 *
 * Its host is `display: contents`, so it sits in its parent's layout exactly
 * where a bare `<button>` did — a caller that has to place it, as the drawer
 * does, writes one rule against `.closeButton`.
 */
const meta: Meta = {
  title: 'Actions/Close Button',
  component: CloseButtonComponent,
  tags: ['autodocs'],
  decorators: [atWidth(250)],
  args: { label: 'Close', tooltip: '' },
  render: (args) => ({
    props: args,
    template: `<close-button [label]="label" [tooltip]="tooltip"></close-button>`,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

/** Where more than one thing is closable, it says which. */
export const NamesWhatItCloses: Story = { args: { label: 'Close tutorial' } };

/** A tooltip is off by default: most of these sit beside their own title. */
export const WithTooltip: Story = { args: { tooltip: 'Close' } };

/**
 * In the corner of a card, which is where four of the five callers put it.
 *
 * Note what the placing rule targets: the host is `display: contents` and so
 * cannot be positioned itself — a caller positions `.closeButton`, exactly as
 * the right drawer and the tutorial card do.
 */
export const OnACard: Story = {
  render: () => ({
    template: `
      <style>
        .sb-card { position: relative; padding: 16px; border-radius: 8px;
                   background: var(--surface); box-shadow: var(--card-shadow) }
        .sb-card .closeButton { position: absolute; top: 8px; right: 8px }
      </style>
      <div class="sb-card">
        <div style="font-size: 20px; font-weight: 500">A card with a title</div>
        <p style="margin: 6px 0 0; color: var(--text-secondary)">
          The button takes the corner, clear of the title's own line.
        </p>
        <close-button label="Close card"></close-button>
      </div>
    `,
  }),
};
