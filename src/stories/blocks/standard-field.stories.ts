import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { StandardFieldDirective } from '../../app/component/BLOCKS/standard-field/standard-field.directive';
import { inPanel } from '../support/frame';

/**
 * `appStandardField`: a directive, not a component. It gives a hand-written
 * `<input>` the two manners every block field has: clicking selects the whole
 * value, and Enter commits by blurring. It adds no styling. Click the field,
 * then press Enter.
 */
const meta: Meta = {
  title: 'Blocks/Standard Field',
  tags: ['autodocs'],
  decorators: [inPanel(), moduleMetadata({ imports: [StandardFieldDirective] })],
  render: () => ({
    template: `
      <label style="display: flex; gap: 8px; align-items: center">
        Pose 1 X
        <input appStandardField value="12.50" style="width: 80px" />
      </label>
    `,
  }),
};

export default meta;

export const Default: StoryObj = {};
