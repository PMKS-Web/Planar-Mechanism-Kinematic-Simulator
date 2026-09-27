import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ContextMenuComponent } from '../../app/component/BLOCKS/context-menu/context-menu.component';
import {
  ContextMenuModel,
  MenuChoice,
  MenuRefusal,
  MenuRow,
} from '../../app/component/BLOCKS/context-menu/menu-model';
import { shortcutsStub } from '../support/stubs';

/**
 * `app-context-menu`: the right-click menu, rendered from a `ContextMenuModel`.
 *
 * It is a dumb renderer. Everything about what a row says, whether it can be
 * used and why not is decided by `ContextMenuBuilderService`, which reads the
 * answers out of the model that enforces them -- so a grayed row here carries
 * the model's own words in its right-hand slot, never a sentence written in
 * the template. The shape is fixed: a header naming what was clicked, the
 * choice of what the part can be, the ladder of groups (Attach, State,
 * Traces), and a red footer that is always last. The models below are the
 * builder's for a joint and for a link, icon for icon, with the app's own SVG
 * glyphs.
 */
const noop = () => undefined;

const crossing = {
  icon: 'query_stats',
  material: true,
  tip: 'Kinematic Analysis (3)',
  action: noop,
};

const TYPES = ['Revolute', 'Prismatic', 'Pin-in-slot', 'Welded'];
const GLYPHS = ['joint_revolute', 'joint_prismatic', 'joint_pin_in_slot', 'joint_welded'];

/** The four things a joint can be, as the card's top block. */
function jointType(chosen: number, extra: Partial<MenuChoice> = {}): MenuChoice {
  return {
    label: 'Joint Type',
    chosen,
    posePolicy: 'start',
    options: TYPES.map((label, index) => ({ label, icon: GLYPHS[index], action: noop })),
    ...extra,
  };
}

/** The rows every joint gets, in the builder's order. */
function jointMenu(): ContextMenuModel {
  return {
    header: { title: 'Joint B', subtitle: 'Pin · Links AB, BG', crossing },
    choice: jointType(0),
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

/**
 * The joint a cylinder slides on: the square drawn mid-skin.
 *
 * Prismatic at full ink and the other three closed in the model's four words;
 * nothing attaches; the ground goes on one of the joints at the ends instead.
 * The drive is live, because the cylinder's drive is this joint's.
 */
function cylinderSealMenu(): ContextMenuModel {
  const inside: MenuRefusal = {
    short: 'inside a cylinder',
    long: 'This joint is inside a cylinder, which places it rather than solving for it, so a third body arriving here would have nothing holding it. Attach at one of the joints at its ends instead.',
  };
  return {
    header: { title: 'Joint B', subtitle: 'Slider · Cylinder AC', crossing },
    // Every value but the chosen one is closed in the same four words, each
    // with the sentence its own step is refused by.
    choice: jointType(1, {
      options: TYPES.map((label, index) => ({
        label,
        icon: GLYPHS[index],
        action: noop,
        refusal:
          index === 1
            ? undefined
            : {
                short: inside.short,
                long:
                  index === 3
                    ? 'This joint is inside a cylinder, and its sliding is what the part is. Delete the cylinder instead.'
                    : 'This weld is what holds a cylinder together as one part, so it cannot be undone. Delete the cylinder instead.',
              },
      })),
    }),
    groups: [
      {
        label: 'Attach',
        rows: [
          new MenuRow({ label: 'Link', icon: 'new_link', action: noop, refusal: inside }),
          new MenuRow({ label: 'Cylinder', icon: 'add_cylinder', action: noop, refusal: inside }),
          new MenuRow({ label: 'Force', icon: 'add_force', action: noop, refusal: inside }),
        ],
      },
      {
        label: 'State',
        rows: [
          new MenuRow({
            label: 'Grounded',
            icon: 'add_ground',
            kind: 'toggle',
            action: noop,
            refusal: {
              short: 'ground an end joint instead',
              long: 'A cylinder is held in place at the joints at its two ends, so this joint cannot be grounded. Ground one of those instead.',
            },
          }),
          new MenuRow({
            label: 'Driven Input',
            icon: 'add_input',
            kind: 'toggle',
            checked: true,
            action: noop,
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
        ],
      },
      {
        rows: [
          new MenuRow({
            label: 'Delete Joint (and Cylinder)',
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
            hint: '3 joints',
          }),
        ],
      },
    ],
  };
}

/** One half of a cylinder: its own length, the whole part's angle, and a delete that takes both halves. */
function cylinderMemberMenu(): ContextMenuModel {
  return {
    header: { title: 'Barrel AB', subtitle: 'Cylinder AC', crossing },
    groups: [
      {
        label: 'State',
        rows: [
          new MenuRow({
            label: 'Fixed Length',
            icon: 'straighten',
            material: true,
            kind: 'toggle',
            action: noop,
            hint: '6.00 cm',
            tip: 'Fix this half of the cylinder at its current length. A mount dragged past a stop then takes it all out of the other half.',
          }),
          new MenuRow({
            label: 'Fixed Angle',
            icon: 'architecture',
            material: true,
            kind: 'toggle',
            checked: true,
            action: noop,
            tip: 'Hold this cylinder at the angle it points now. Dragging a mount slides it along that line.',
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
        ],
      },
      {
        rows: [
          new MenuRow({
            label: 'Delete Cylinder',
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
            hint: '3 joints',
          }),
        ],
      },
    ],
  };
}

/** Parked mid-cycle: every row and value that would write a pose carries the same reason, and the traces stay live. */
function paused(model: ContextMenuModel): ContextMenuModel {
  const reason: MenuRefusal = {
    short: 'needs the start pose',
    long: 'Return to the start pose to change the mechanism.',
  };
  for (const option of model.choice?.options ?? []) option.refusal ??= reason;
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

/** A joint's menu: the type it is, then Attach, State and Traces, then the footer. Force is grayed because two links meet here. */
export const Joint: Story = { args: { model: jointMenu() } };

/** A grounded slider: every value wears the glyph that stands on the frame, and Pin-in-slot is chosen. */
export const JointGroundedSlider: Story = {
  args: {
    model: {
      ...jointMenu(),
      header: { title: 'Joint C', subtitle: 'Slider · Link BC', crossing },
      choice: jointType(2, {
        options: TYPES.map((label, index) => ({
          label,
          icon: `${GLYPHS[index]}_grounded`,
          action: noop,
        })),
      }),
    },
  },
};

/** The chosen value cannot stand as drawn: a block with nowhere to slide, in the refusal ink, with the way out on hover. */
export const JointNowhereToSlide: Story = {
  args: {
    model: {
      ...jointMenu(),
      header: { title: 'Joint F', subtitle: 'Slider · Link EF', crossing },
      choice: jointType(2, {
        fault: {
          short: 'nowhere to slide',
          long: 'Nowhere to slide. Drag it onto a link to cut its slot, or ground it.',
        },
      }),
    },
  },
};

/**
 * A driven pin can be nothing else: every other value is grayed with the
 * model's reason.
 *
 * A reason opens on the side its column is on -- the left column to the left of
 * the card, the right column to its right -- so that it clears the card
 * entirely and lies over neither the value beside it nor the ladder below.
 * Opening them all to the right, as they used to, put the left column's reason
 * squarely over the right column, and a press meant for a value there landed on
 * the sentence instead.
 */
export const JointTypeRefused: Story = {
  args: {
    model: {
      ...jointMenu(),
      choice: jointType(0, {
        options: TYPES.map((label, index) => ({
          label,
          icon: GLYPHS[index],
          action: noop,
          refusal:
            index === 0
              ? undefined
              : {
                  short: 'it is driven',
                  long:
                    index === 3
                      ? 'A weld says these bodies do not move relative to each other, and an input says they do. Remove the input first.'
                      : 'A block is a body of its own, so adding one to a driven joint would put three there. Remove the input first.',
                },
        })),
      }),
    },
  },
};

/** A bar's menu, with its length held: the two hold rows carry the value each would fix. */
export const Link: Story = { args: { model: linkMenu() } };

/** The joint a cylinder slides on: Prismatic at full ink, nothing attaches, and the drive lives here. */
export const CylinderSeal: Story = { args: { model: cylinderSealMenu() } };

/** One of a cylinder's two end joints: a pin like any other, named by the member it is on. */
export const CylinderEndJoint: Story = {
  args: {
    model: (() => {
      const model = jointMenu();
      model.header = { title: 'Joint A', subtitle: 'Ground pin · Barrel AB', crossing };
      model.choice = jointType(0, {
        options: TYPES.map((label, index) => ({
          label,
          icon: `${GLYPHS[index]}_grounded`,
          action: noop,
        })),
      });
      // The only thing a cylinder changes about this card: the delete names
      // what the click takes with the joint.
      const footer = model.groups[model.groups.length - 1].rows[0];
      footer.label = 'Delete Joint (and Cylinder)';
      return model;
    })(),
  },
};

/** A cylinder's barrel: one half of the part, with its own length and the part's angle. */
export const CylinderMember: Story = { args: { model: cylinderMemberMenu() } };

/** The joint's menu with the mechanism parked mid-cycle. */
export const JointPausedMidCycle: Story = { args: { model: paused(jointMenu()) } };

/** Nothing to offer: the empty card, which the builder normally never opens. */
export const Empty: Story = {
  args: { model: { groups: [] } },
  parameters: { docs: { story: { inline: false, iframeHeight: 160 } } },
};
