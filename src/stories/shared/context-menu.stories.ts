import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ContextMenuComponent } from '../../app/component/context-menu/context-menu.component';
import {
  ContextMenuModel,
  MenuRefusal,
  MenuRow,
} from '../../app/component/context-menu/menu-model';
import { shortcutsStub } from '../support/stubs';

/**
 * `app-context-menu`: the right-click menu, rendered from a `ContextMenuModel`.
 *
 * It is a dumb renderer. Everything about what a row says, whether it can be
 * used and why not is decided by `ContextMenuBuilderService`, which reads the
 * answers out of the model that enforces them -- so a grayed row here carries
 * the model's own words in its right-hand slot, never a sentence written in
 * the template. The shape is fixed: a header naming what was clicked, the
 * ladder of groups (Attach, State, Traces), and a red footer that is always
 * last. The models below are the builder's rows for a joint and for a link,
 * icon for icon, with the app's own SVG glyphs.
 */
const noop = () => undefined;

const crossing = {
  icon: 'query_stats',
  material: true,
  tip: 'Kinematic Analysis (3)',
  action: noop,
};

/** The rows every joint gets, in the builder's order. */
function jointMenu(): ContextMenuModel {
  return {
    header: { title: 'Joint B', subtitle: 'Pin · Links AB, BC', crossing },
    groups: [
      {
        label: 'Attach',
        rows: [
          new MenuRow({ label: 'Link', icon: 'new_link', action: noop }),
          new MenuRow({ label: 'Cylinder', icon: 'add_cylinder', action: noop }),
          new MenuRow({
            label: 'Force',
            icon: 'add_force',
            action: noop,
            refusal: {
              short: '2 links share it',
              long: 'A load applied where several bodies meet does not say which one carries it. Attach it to the link instead.',
            },
          }),
        ],
      },
      {
        label: 'State',
        rows: [
          new MenuRow({
            label: 'Grounded',
            icon: 'add_ground',
            kind: 'toggle',
            checked: true,
            action: noop,
          }),
          new MenuRow({ label: 'Driven Input', icon: 'add_input', kind: 'toggle', action: noop }),
          new MenuRow({ label: 'Slider', icon: 'add_slider', kind: 'toggle', action: noop }),
          new MenuRow({
            label: 'Welded',
            icon: 'weld_joint',
            kind: 'toggle',
            action: noop,
            refusal: {
              short: 'needs two links',
              long: 'A weld fuses two links at a joint; this one has two, but one of them is grounded.',
            },
          }),
          new MenuRow({
            label: 'Locked',
            icon: 'lock',
            kind: 'toggle',
            action: noop,
            shortcut: 'K',
          }),
        ],
      },
      {
        label: 'Traces',
        rows: [
          new MenuRow({ label: 'Trace path', icon: 'show_path', kind: 'toggle', action: noop }),
          new MenuRow({
            label: 'Velocity Vectors',
            icon: 'vector_velocity',
            kind: 'toggle',
            action: noop,
          }),
          new MenuRow({
            label: 'Acceleration Vectors',
            icon: 'vector_acceleration',
            kind: 'toggle',
            action: noop,
          }),
        ],
      },
      {
        rows: [
          new MenuRow({
            label: 'Delete Joint',
            icon: 'remove',
            destructive: true,
            action: noop,
            shortcut: '⌫',
          }),
          new MenuRow({
            label: 'Delete entire mechanism',
            icon: 'delete_mechanism',
            destructive: true,
            action: noop,
          }),
        ],
      },
    ],
  };
}

/** A bar's menu: Tracer Point and Duplicate join Attach, and the holds join State with the value each would fix. */
function linkMenu(): ContextMenuModel {
  return {
    header: { title: 'Link AB', subtitle: 'Bar · Joints A, B', crossing },
    groups: [
      {
        label: 'Attach',
        rows: [
          new MenuRow({ label: 'Link', icon: 'new_link', action: noop }),
          new MenuRow({ label: 'Cylinder', icon: 'add_cylinder', action: noop }),
          new MenuRow({ label: 'Tracer Point', icon: 'add_tracer', action: noop }),
          new MenuRow({ label: 'Force', icon: 'add_force', action: noop }),
          new MenuRow({
            label: 'Duplicate Link',
            icon: 'content_copy',
            material: true,
            action: noop,
            tip: 'Set a free-standing copy of this link down beside it.',
          }),
        ],
      },
      {
        label: 'State',
        rows: [
          new MenuRow({
            label: 'Drawn as a Disc',
            icon: 'make_circular',
            kind: 'toggle',
            action: noop,
            refusal: {
              short: 'needs a fixed pin',
              long: 'A disc is the shape a link sweeps about a fixed pin, and this link turns about none.',
            },
          }),
          new MenuRow({
            label: 'Fixed Length',
            icon: 'straighten',
            material: true,
            kind: 'toggle',
            checked: true,
            action: noop,
            hint: '5.00 cm',
          }),
          new MenuRow({
            label: 'Fixed Angle',
            icon: 'architecture',
            material: true,
            kind: 'toggle',
            action: noop,
            hint: '36.87°',
            tip: 'A link fixes one or the other, never both. Choosing this releases the one already fixed.',
          }),
          new MenuRow({
            label: 'Locked',
            icon: 'lock',
            kind: 'toggle',
            action: noop,
            shortcut: 'K',
          }),
        ],
      },
      {
        label: 'Traces',
        rows: [
          new MenuRow({
            label: 'Velocity Vectors',
            icon: 'vector_velocity',
            kind: 'toggle',
            action: noop,
          }),
          new MenuRow({
            label: 'Force Vectors',
            icon: 'vector_force',
            kind: 'toggle',
            action: noop,
          }),
        ],
      },
      {
        rows: [
          new MenuRow({
            label: 'Delete Link',
            icon: 'remove',
            destructive: true,
            action: noop,
            shortcut: '⌫',
          }),
          new MenuRow({
            label: 'Delete entire mechanism',
            icon: 'delete_mechanism',
            destructive: true,
            action: noop,
          }),
        ],
      },
    ],
  };
}

/** Parked mid-cycle: every row that would write a pose carries the same reason, and the traces stay live. */
function paused(model: ContextMenuModel): ContextMenuModel {
  const reason: MenuRefusal = {
    short: 'needs the start pose',
    long: 'Return to the start pose to change the mechanism.',
  };
  for (const group of model.groups) {
    if (group.label === 'Traces') continue;
    for (const row of group.rows) row.refusal ??= reason;
  }
  return model;
}

const meta: Meta = {
  title: 'Feedback/Context Menu',
  component: ContextMenuComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [shortcutsStub()] })],
  parameters: {
    controls: { disable: true },
    // The card is positioned fixed, as the CDK overlay places it in the app,
    // so drawn inline on the docs page it escapes its frame and lands in the
    // page corner: each story gets its own iframe, as the notification stack
    // does. And the snippet is the template, since the models are built by
    // functions Storybook cannot turn into a static example.
    docs: {
      story: { inline: false, iframeHeight: 600 },
      source: { language: 'html', code: '<app-context-menu [model]="model"></app-context-menu>' },
    },
  },
  render: (args) => ({
    props: args,
    template: `<app-context-menu [model]="model"></app-context-menu>`,
  }),
};

export default meta;
type Story = StoryObj;

/** A joint's menu: Attach, State and Traces, then the footer. Force is grayed because two links meet here. */
export const Joint: Story = { args: { model: jointMenu() } };

/** A bar's menu, with its length held: the two hold rows carry the value each would fix. */
export const Link: Story = { args: { model: linkMenu() } };

/** The joint's menu with the mechanism parked mid-cycle. */
export const JointPausedMidCycle: Story = { args: { model: paused(jointMenu()) } };

/** Nothing to offer: the empty card, which the builder normally never opens. */
export const Empty: Story = {
  args: { model: { groups: [] } },
  parameters: { docs: { story: { inline: false, iframeHeight: 160 } } },
};
