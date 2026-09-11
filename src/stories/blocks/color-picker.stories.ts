import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { ColorPickerComponent } from '../../app/component/BLOCKS/color-picker/color-picker.component';
import { inPanel } from '../support/frame';
import { mechanismStub } from '../support/stubs';

/**
 * `color-picker`: the swatches for a link, a joint or a force. The palette
 * comes from the real `ColorService`; the part being painted is not given
 * here, so a press moves the tick and paints nothing. It has no disabled
 * state.
 */
const meta: Meta = {
  title: 'Blocks/Color Picker',
  component: ColorPickerComponent,
  tags: ['autodocs'],
  decorators: [inPanel(), applicationConfig({ providers: [mechanismStub()] })],
  args: { type: 'link', label: 'Link Color', tooltip: 'The color of this link.' },
  argTypes: { type: { control: 'inline-radio', options: ['link', 'joint', 'force'] } },
  render: (args) => ({
    props: args,
    template: `<color-picker [type]="type" [tooltip]="tooltip">{{ label }}</color-picker>`,
  }),
};

export default meta;
type Story = StoryObj;

export const LinkColors: Story = {};

/** Joint families: hover a swatch for its name. */
export const JointColors: Story = {
  args: { type: 'joint', label: 'Joint Color', tooltip: 'The color of this joint.' },
};

export const ForceColors: Story = {
  args: { type: 'force', label: 'Force Color', tooltip: 'The color of this force.' },
};

export const WithoutHelp: Story = { args: { tooltip: undefined } };
