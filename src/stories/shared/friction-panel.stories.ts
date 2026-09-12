import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { userEvent, within } from 'storybook/test';
import { FrictionPanelComponent } from '../../app/component/friction-panel/friction-panel.component';
import { LengthUnit } from '../../app/model/unit-enums';
import { INERTIA_FRICTION_REFUSAL } from '../../app/model/joint-friction';
import { inPanel } from '../support/frame';
import { frictionStoryState } from '../support/friction-stubs';
import { FRICTION_REWIND_MESSAGE } from '../../app/services/friction.service';
import { RealLink } from '../../app/model/link';
import { RealJoint, RevJoint } from '../../app/model/joint';

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
inertiaState.settings.forceAnalysisMode.next('dynamic');
inertiaState.service.reading = () => ({ state: 'Unavailable', message: INERTIA_FRICTION_REFUSAL });
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
    await userEvent.click(canvas.getByRole('button', { name: 'Save Friction Settings' }));
  },
};
export const SliderAnalysis: Story = {
  ...state('guide'),
  args: { ...state('guide').args, readOnly: true },
};
export const BearingAnalysis: Story = {
  ...state('pin'),
  args: { ...state('pin').args, readOnly: true },
};
export const SavedSettings: Story = {
  ...state('guide'),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Save Friction Settings' })
    );
  },
};
export const CollapsedEnabled: Story = {
  ...state('guide'),
  args: { ...state('guide').args, expanded: false },
};
export const ExpandedCalculation: Story = {
  ...SliderAnalysis,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('How Friction Is Calculated'));
  },
};
export const ExpandedInputEffort: Story = {
  ...SliderAnalysis,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Input Effort Details' })
    );
  },
};
const rewindState = frictionStoryState('guide');
rewindState.service.reading = () => ({ state: 'Unavailable', message: FRICTION_REWIND_MESSAGE });
export const PlaybackRewind: Story = {
  args: { joint: rewindState.joint, readOnly: true },
  decorators: [applicationConfig({ providers: rewindState.providers })],
};
const unsupportedState = frictionStoryState('guide');
const block = unsupportedState.joint.links[0];
const welded = block.joints.find((j) => j !== unsupportedState.joint) as RealJoint;
welded.isWelded = true;
const end = new RevJoint('C', 400, 0);
const rider = new RealLink('BC', [welded, end]);
welded.links.push(rider);
end.links = [rider];
export const UnsupportedGuide: Story = {
  args: { joint: unsupportedState.joint, readOnly: true },
  decorators: [applicationConfig({ providers: unsupportedState.providers })],
};
