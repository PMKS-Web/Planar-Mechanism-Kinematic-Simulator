import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { userEvent, within } from 'storybook/test';
import { FrictionPanelComponent } from '../../app/component/friction-panel/friction-panel.component';
import { LengthUnit } from '../../app/model/unit-enums';
import { INERTIA_FRICTION_REFUSAL } from '../../app/model/joint-friction';
import { inPanel } from '../support/frame';
import { frictionStoryState } from '../support/friction-stubs';

const meta: Meta<FrictionPanelComponent> = {
  title: 'Structure/Friction Panel',
  component: FrictionPanelComponent,
  tags: ['autodocs'],
  decorators: [inPanel(250, 0)],
  parameters: { controls: { disable: true } },
  args: { expanded: true },
  render: (args) => ({
    props: args,
    template: '<app-friction-panel [joint]="joint" [readOnly]="readOnly" [expanded]="expanded" />',
  }),
};
export default meta;
type Story = StoryObj<FrictionPanelComponent>;
function state(
  kind: 'guide' | 'pin',
  enabled = true,
  unit = LengthUnit.CM,
  disabled = false,
  stationary = false
): Story {
  const fixture = frictionStoryState(kind, enabled, unit, disabled, stationary);
  return {
    args: { joint: fixture.joint },
    decorators: [applicationConfig({ providers: fixture.providers })],
  };
}
export const Frictionless: Story = state('guide', false);
export const Prismatic: Story = state('guide');
export const Revolute: Story = state('pin');
export const RadiusInInches: Story = state('pin', true, LengthUnit.INCH);
export const PlaybackDisabled: Story = state('guide', true, LengthUnit.CM, true);
export const Stationary: Story = state('guide', true, LengthUnit.CM, false, true);
const inertiaState = frictionStoryState('guide');
inertiaState.service.reading = () => ({ message: INERTIA_FRICTION_REFUSAL });
export const InMotionUnavailable: Story = {
  args: { joint: inertiaState.joint, readOnly: true },
  decorators: [applicationConfig({ providers: inertiaState.providers })],
};
export const ReadOnly: Story = { ...state('pin'), args: { ...state('pin').args, readOnly: true } };
export const InvalidCoefficients: Story = {
  ...state('guide'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const kinetic = canvas.getByRole('textbox', { name: 'Kinetic Coefficient' });
    await userEvent.clear(kinetic);
    await userEvent.type(kinetic, '.4');
    await userEvent.click(canvas.getByRole('button', { name: 'Apply Friction' }));
  },
};
