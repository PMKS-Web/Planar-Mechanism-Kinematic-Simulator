import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { expect, userEvent, within } from 'storybook/test';
import { MeasurementComparisonComponent } from '../../app/component/measurement-comparison/measurement-comparison.component';
import { inPanel } from '../support/frame';
import { measurementStubs } from '../support/stubs';

/** Real comparison controls with four synthetic samples: X = 0, 1, 2, 3 cm. */
const meta: Meta<MeasurementComparisonComponent> = {
  title: 'Feedback/Measurement Comparison',
  component: MeasurementComparisonComponent,
  tags: ['autodocs'],
  decorators: [inPanel(400, 0), applicationConfig({ providers: measurementStubs() })],
  args: {
    analysis: 'kinematic',
    analysisType: 'joint',
    mechProp: 'Linear Joint Pos',
    mechPart: 'B',
    reactionLinkId: '',
    unit: 'cm',
    names: ['X', 'Y'],
  },
};

export default meta;
type Story = StoryObj<MeasurementComparisonComponent>;

async function open(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Compare Measurements' }));
  await canvas.findByRole('textbox', { name: /Measured Values/ });
  return canvas;
}

async function calculate(canvasElement: HTMLElement, data: string) {
  const canvas = await open(canvasElement);
  await userEvent.type(canvas.getByRole('textbox', { name: /Measured Values/ }), data);
  await userEvent.click(canvas.getByRole('button', { name: 'Calculate RMSE' }));
  return canvas;
}

export const Collapsed: Story = {};

/** Instructions explain the expected data while calculation is disabled. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await open(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Calculate RMSE' })).toBeDisabled();
  },
};

export const InvalidTimes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await calculate(canvasElement, '0,1\n0,2');
    await expect(await canvas.findByRole('alert')).toHaveTextContent('no duplicates');
  },
};

/** Three errors of +2 cm; the fourth measurement is outside the sampled interval. */
export const Compared: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await calculate(canvasElement, '0,2\n0.1,3\n0.2,4\n1,8');
    await expect(await canvas.findByText('RMSE: 2 cm')).toBeVisible();
    await expect(canvas.getByText('3 compared · 1 excluded')).toBeVisible();
  },
};

export const Unsolved: Story = {
  decorators: [applicationConfig({ providers: measurementStubs(false) })],
  play: async ({ canvasElement }) => {
    const canvas = await calculate(canvasElement, '0,1');
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Solve this mechanism');
  },
};

/** A single angular quantity at the narrow card width, including the wrapping explanation. */
export const NarrowAngularQuantity: Story = {
  decorators: [inPanel(300, 0)],
  args: { mechProp: 'Angular Link Pos', names: ['Angle'], unit: 'deg' },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
  },
};
