import { FormControl, FormGroup } from '@angular/forms';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { CollapsibleSubsectionComponent } from '../../app/component/BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { InputComponent } from '../../app/component/BLOCKS/input/input.component';
import { inPanel } from '../support/frame';

/**
 * `collapsible-subsection`. The title and chevron are one button; anything
 * beside them goes in `[headerActions]`.
 */
const meta: Meta = {
  title: 'Structure/Collapsible Subsection',
  component: CollapsibleSubsectionComponent,
  tags: ['autodocs'],
  decorators: [inPanel(), moduleMetadata({ imports: [InputComponent] })],
  args: { titleLabel: 'Input Settings', expanded: true, hideHeader: false },
  render: (args) => ({
    props: {
      ...args,
      form: new FormGroup({ speed: new FormControl('10'), mass: new FormControl('1.5') }),
    },
    template: `
      <collapsible-subsection [titleLabel]="titleLabel" [expanded]="expanded" [hideHeader]="hideHeader">
        <input-block [formGroup]="form" _formControl="speed" unit="RPM" tooltip="How fast the input turns.">Speed</input-block>
        <input-block [formGroup]="form" _formControl="mass" unit="kg" tooltip="The mass of this link.">Mass</input-block>
      </collapsible-subsection>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Expanded: Story = {};

export const Collapsed: Story = { args: { expanded: false } };

export const LongTitle: Story = {
  args: { titleLabel: 'Center of Mass and Moment of Inertia' },
};

/** No header at all: the section cannot be opened or closed by the reader. */
export const WithoutHeader: Story = { args: { hideHeader: true } };

/** Nested analysis sections share the parent's inset, leaving room for tables and curves. */
export const NestedAnalysis: Story = {
  render: () => ({
    template: `
      <collapsible-subsection titleLabel="Instant Centers" [expanded]="true">
        <collapsible-subsection titleLabel="Center Selection" [inset]="false">
          <p>Select which centers appear on the canvas.</p>
        </collapsible-subsection>
        <collapsible-subsection titleLabel="IC Velocity Analysis" [expanded]="true" [inset]="false">
          <p>Known input A: 1 rad/s.</p>
          <collapsible-subsection titleLabel="Body BC · IC Calculation" [expanded]="true" [inset]="false">
            <p>vₓ = −ω rᵧ; vᵧ = ω rₓ.</p>
          </collapsible-subsection>
        </collapsible-subsection>
      </collapsible-subsection>
    `,
  }),
};
