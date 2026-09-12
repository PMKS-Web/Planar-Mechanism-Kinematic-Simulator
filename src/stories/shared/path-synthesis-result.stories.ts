import { type Meta, type StoryObj } from '@storybook/angular-vite';
import { PathSynthesisResultComponent } from '../../app/component/path-synthesis-result/path-synthesis-result.component';
import { inPanel } from '../support/frame';

const meta: Meta<PathSynthesisResultComponent> = {
  title: 'Feedback/Path synthesis',
  component: PathSynthesisResultComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400, 0)],
};
export default meta;
type Story = StoryObj<PathSynthesisResultComponent>;
export const Ready: Story = {};
export const InsufficientPoints: Story = {
  args: { refusal: 'Add at least three distinct path points.' },
};
export const Searching: Story = {
  args: { busy: true, message: 'Searching for a four-bar…', evaluations: 14000 },
};
export const Verified: Story = {
  args: {
    message: 'Four-bar found and verified with PMKS.',
    metrics: { rms: '0.04 cm', maximum: '0.09 cm', normalized: '1.20%' },
  },
};
export const FitNeedsImprovement: Story = {
  args: {
    ...Verified.args,
    message:
      'Search limit reached. The best verified four-bar is shown; its fit needs improvement.',
  },
};
export const NoFeasibleMechanism: Story = {
  args: {
    message: 'No feasible four-bar was found within the search budget. Try another target shape.',
  },
};
export const Created: Story = {
  args: {
    ...Verified.args,
    createRefusal: 'The mechanism was created. Use Edit to inspect it, or run a new search.',
  },
};
export const PartialSweep: Story = { args: { ...Verified.args, partial: true } };
