import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ViewButtonComponent } from '../../app/component/BLOCKS/view-button/view-button.component';
import { shortcutsStub } from '../support/stubs';

/**
 * `app-view-button`: one button of the view controls, in both kinds it comes
 * in. A **switch** says whether something is on the grid and draws the grid as
 * it is (the crossed-out glyph means hidden); a **plain action** names one
 * thing and keeps its glyph. Six of these used to be written out six times and
 * drifted; this is the one place the rules live now, and the natural home for
 * the other icon toggles the app still hand-rolls (see the Reuse backlog).
 */
const meta: Meta = {
  title: 'Actions/View Button',
  component: ViewButtonComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [shortcutsStub('P')] })],
  args: {
    noun: 'Traced Paths',
    shownIcon: 'show_path',
    hiddenIcon: 'hide_path',
    shown: true,
    disabled: false,
  },
  argTypes: {
    icon: { table: { disable: true } },
    svg: { table: { disable: true } },
    tooltip: { table: { disable: true } },
    shortcut: { table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="sb-view-controls">
        <app-view-button
          [noun]="noun"
          [shownIcon]="shownIcon"
          [hiddenIcon]="hiddenIcon"
          [shown]="shown"
          [disabled]="disabled"
          shortcut="view.paths"
        ></app-view-button>
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj;

/** A switch that is on: the plain glyph, and the tint that says so. */
export const SwitchOn: Story = {};

/** The same switch off: the crossed-out glyph, since the glyph draws the grid as it is. */
export const SwitchOff: Story = { args: { shown: false } };

/** Nothing to show or hide, so pressing it would change nothing. */
export const Disabled: Story = { args: { shown: false, disabled: true } };

/** Plain actions: a name, a glyph, no state. Material ligatures on the left, the app's own SVGs on the right. */
export const PlainActions: Story = {
  render: () => ({
    template: `
      <div class="sb-view-controls">
        <app-view-button icon="zoom_out" tooltip="Zoom Out"></app-view-button>
        <app-view-button icon="zoom_in" tooltip="Zoom In"></app-view-button>
        <app-view-button svg="fit_linkage" tooltip="Fit to view"></app-view-button>
        <app-view-button svg="fit_motion" tooltip="Fit to full motion"></app-view-button>
      </div>
    `,
  }),
};

/** The whole strip as the app lays it out: three switches, then the four view actions. */
export const TheStrip: Story = {
  render: () => ({
    template: `
      <div class="sb-view-controls">
        <app-view-button noun="Center of Mass" shownIcon="com" hiddenIcon="com_off" [shown]="false"></app-view-button>
        <app-view-button noun="Joint IDs" shownIcon="abc" hiddenIcon="abc_off" [shown]="true"></app-view-button>
        <app-view-button noun="Traced Paths" shownIcon="show_path" hiddenIcon="hide_path" [shown]="false"></app-view-button>
        <app-view-button icon="zoom_out" tooltip="Zoom Out"></app-view-button>
        <app-view-button icon="zoom_in" tooltip="Zoom In"></app-view-button>
        <app-view-button svg="fit_linkage" tooltip="Fit to view"></app-view-button>
        <app-view-button svg="fit_motion" tooltip="Fit to full motion"></app-view-button>
      </div>
    `,
  }),
};
