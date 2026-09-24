import type { Meta, StoryObj } from '@storybook/angular-vite';
import { ForceDefinitionsComponent } from '../../app/component/solver-explanation/force-definitions.component';
import { inPanel } from '../support/frame';
const meta: Meta<ForceDefinitionsComponent> = {
  title: 'Analysis/Force Definitions',
  component: ForceDefinitionsComponent,
  tags: ['autodocs'],
  decorators: [inPanel(460)],
};
export default meta;
export const WithoutAMechanism: StoryObj<ForceDefinitionsComponent> = {};
