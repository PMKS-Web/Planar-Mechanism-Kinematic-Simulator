import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { IssueComponent } from '../../app/component/BLOCKS/issue/issue.component';
import { SetupIssue } from '../../app/model/mechanism/setup-issue';
import { jointRef, linkRef, prose, sliderRef } from '../../app/model/prose';
import { inPanel } from '../support/frame';
import { fourBarParts, partLinkStub } from '../support/part-links';

/**
 * `issue-block`: one thing standing between a drawing and its analysis, as the
 * setup drawers list it (`docs/setup-issues-spec.md`).
 *
 * What is wrong is always on screen: the title names the problem and the
 * summary the one fact that makes it a problem in this drawing. How to fix it
 * waits behind "Show fixes": the rule behind the problem, a label saying
 * whether the fixes are required, and the fixes themselves. The panel opens
 * directly under the button that asked for it.
 *
 * Color is the icon's alone: red stops the analysis, amber does not, gray is
 * geometry the analysis leaves out. Parts named in the summary or a fix are
 * `part-link`s. One fix is a sentence; two or three are a list with a dot
 * each, and never an "or" on a line of its own.
 */
const parts = fourBarParts();

const issues: Record<string, SetupIssue> = {
  oneFix: {
    severity: 'blocker',
    title: "Joint C can't be the input",
    summary: prose`${jointRef(parts.c)} is welded, so the links it joins can't move against each other.`,
    explain:
      'An input makes two links move against each other. A weld locks them together, so there is nothing for the input to turn.',
    fixes: [prose`Set ${jointRef(parts.c)} to Revolute`],
  },
  someFixes: {
    severity: 'blocker',
    title: '2 degrees of freedom, needs 1',
    summary: prose`With the input held still, ${linkRef(parts.cd, [])} and ${linkRef(parts.de, [])} can still move.`,
    explain:
      'One input drives one motion. With more degrees of freedom than inputs, part of the mechanism can move on its own.',
    fixes: [
      prose`Ground ${jointRef(parts.d)}`,
      prose`Delete ${linkRef(parts.de, [])}`,
      prose`Attach Link at ${jointRef(parts.d)}, then ground its far end`,
    ],
  },
  slider: {
    severity: 'blocker',
    title: 'Slider D has no slot',
    summary: prose`With no slot and no ground, ${sliderRef(parts.d)} has no direction to move in.`,
    explain:
      'A slider moves along a line, either a slot cut into a link or a fixed direction on the ground.',
    fixes: [
      prose`Drag ${sliderRef(parts.d)} onto a link to cut a slot`,
      prose`Ground ${sliderRef(parts.d)} to fix its direction`,
    ],
  },
  noteOnly: {
    severity: 'warning',
    title: 'Passes through a toggle',
    summary: prose`Near dead-center, a small input move gives a large output move.`,
    explain:
      'At a toggle, two links line up and the input has almost no leverage over the output. Clamps use this on purpose.',
    fixes: [],
    note: 'Nothing to change. Expect sharp peaks in the velocity and acceleration graphs.',
  },
  unassigned: {
    severity: 'unassigned',
    title: 'Link AB is attached to nothing',
    summary: prose`${linkRef(parts.ab, [])} reaches neither ground nor the rest of the drawing.`,
    explain:
      'Analysis only solves chains that are grounded somewhere. A link joined to nothing has nothing to move against.',
    fixes: [prose`Ground ${jointRef(parts.a)}`, prose`Delete ${linkRef(parts.ab, [])}`],
  },
};

const meta: Meta = {
  title: 'Feedback/Issue',
  component: IssueComponent,
  tags: ['autodocs'],
  decorators: [inPanel(370, 15), applicationConfig({ providers: [partLinkStub()] })],
  args: { issue: issues['oneFix'], startOpen: false },
  argTypes: { issue: { control: false } },
  render: (args) => ({
    props: args,
    template: `<issue-block [issue]="issue" [startOpen]="startOpen" />`,
  }),
};

export default meta;
type Story = StoryObj;

/** As a list shows it: what is wrong, and the way to the fixes. */
export const Closed: Story = {};

/** A blocker with one fix: a sentence, not a list of one. */
export const OneFix: Story = { args: { startOpen: true } };

/** Two or three fixes, each a suggestion, most likely first. */
export const SomeFixes: Story = { args: { issue: issues['someFixes'], startOpen: true } };

/** A slider with nowhere to slide: the part named in the summary and in both fixes. */
export const Slider: Story = { args: { issue: issues['slider'], startOpen: true } };

/** A warning with nothing to change: "Show more", and a note instead of fixes. */
export const NoteOnly: Story = { args: { issue: issues['noteOnly'], startOpen: true } };

/** Geometry the analysis leaves out: gray, and optional. */
export const Unassigned: Story = { args: { issue: issues['unassigned'], startOpen: true } };
