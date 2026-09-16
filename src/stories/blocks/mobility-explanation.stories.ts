import '../../app/model/joint';
import { type Meta, type StoryObj } from '@storybook/angular-vite';
import { MobilityExplanationComponent } from '../../app/component/mobility-explanation/mobility-explanation.component';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
  redundantParallelCrankFixture,
} from '../../test-utils/verification/fixtures';
import { inPanel } from '../support/frame';

const fourBar = buildMechanism(teachingLabFourBarFixture()).mechanism;
const slider = buildMechanism(teachingLabSliderCrankFixture()).mechanism;
const redundant = buildMechanism(redundantParallelCrankFixture()).mechanism;

const meta: Meta<MobilityExplanationComponent> = {
  title: 'Feedback/Degrees of Freedom',
  component: MobilityExplanationComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { count: fourBar.mobilityCount!, dof: fourBar.dof },
};
export default meta;
type Story = StoryObj<MobilityExplanationComponent>;

export const FourBar: Story = {};
export const SliderCrank: Story = {
  args: { count: slider.mobilityCount!, dof: slider.dof },
};
export const RedundantConstraints: Story = {
  args: { count: redundant.mobilityCount!, dof: redundant.dof },
};
