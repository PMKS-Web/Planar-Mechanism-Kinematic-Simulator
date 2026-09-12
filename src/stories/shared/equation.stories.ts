import { type Meta, type StoryObj } from '@storybook/angular-vite';
import { EquationComponent } from '../../app/component/equation/equation.component';
import { inPanel } from '../support/frame';

const meta: Meta<EquationComponent> = {
  title: 'Feedback/Equation',
  component: EquationComponent,
  tags: ['autodocs'],
  decorators: [inPanel(250)],
  args: { math: String.raw`I_G = \frac{mL^2}{12}` },
  parameters: {
    docs: {
      description: {
        component:
          'Display equations with stacked fractions and accessible MathML. Give each equation its own row; aligned terms can wrap a long expression.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<EquationComponent>;
export const Fraction: Story = {};
export const Integral: Story = {
  args: { math: String.raw`I_G = \int_{-\frac{L}{2}}^{\frac{L}{2}} r^2\,\mathrm{d}m` },
};
export const WrappedTerms: Story = {
  args: {
    math: String.raw`\begin{aligned}M_t &= m r_x a_{G,y}\\ &\quad - m r_y a_{G,x}\end{aligned}`,
  },
};
