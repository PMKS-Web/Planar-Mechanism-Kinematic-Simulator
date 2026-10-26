import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { PartLinkComponent } from '../../app/component/BLOCKS/part-link/part-link.component';
import { ProseComponent } from '../../app/component/BLOCKS/prose/prose.component';
import { jointRef, linkRef, prose } from '../../app/model/prose';
import { inPanel } from '../support/frame';
import { fourBarParts, partLinkStub } from '../support/part-links';

/**
 * `part-link`: a joint or link named in text, as a link to it. Pointing at it
 * lights the part on the grid, and pressing it selects the part so its panel
 * opens.
 *
 * The block names the part and hands the gestures on to `PART_LINK_TARGET`; the
 * app supplies `PartNavigationService`, and this gallery supplies a stand-in
 * that says what it was asked in the Actions panel. So any panel can name a part
 * this way without knowing where the drawing is.
 *
 * Sits inline in a sentence and never breaks across a line. The words are the
 * sentence's own ("joint C", "link DE"); the tint is what says they can be
 * pressed. A button, so it takes focus and Enter, and focus lights the part as
 * pointing does.
 */
const meta: Meta = {
  title: 'Actions/Part Link',
  component: PartLinkComponent,
  tags: ['autodocs'],
  decorators: [inPanel(), applicationConfig({ providers: [partLinkStub()] })],
  args: { label: 'joint C' },
  render: (args) => ({
    props: { ...args, part: fourBarParts().c },
    template: `<part-link [part]="part">{{ label }}</part-link>`,
  }),
};

export default meta;
type Story = StoryObj;

export const Joint: Story = {};

/** A link, named the way its own panel titles it. */
export const Link: Story = {
  args: { label: 'link DE' },
  render: (args) => ({
    props: { ...args, part: fourBarParts().de },
    template: `<part-link [part]="part">{{ label }}</part-link>`,
  }),
};

/** In the sentence it belongs to, where it keeps the sentence's size and line. */
export const InASentence: Story = {
  render: () => ({
    props: fourBarParts(),
    template: `
      <p style="margin: 0; font-size: 12px; line-height: 20px; color: var(--text-secondary)">
        With the input held still, <part-link [part]="bc">link BC</part-link> and
        <part-link [part]="cd">link CD</part-link> can still move.
      </p>`,
  }),
};

/**
 * A sentence built with `prose` and drawn by `prose-block`: the parts arrive
 * as parts, so nothing parses a sentence to find them. This is how any panel
 * should name a part it wants the reader to be able to find.
 */
export const FromProse: Story = {
  render: () => {
    const { c, cd } = fourBarParts();
    return {
      moduleMetadata: { imports: [ProseComponent] },
      props: {
        sentence: prose`${jointRef(c)} holds ${linkRef(cd, [])} to the ground.`,
      },
      template: `<prose-block [sentence]="sentence" />`,
    };
  },
};
