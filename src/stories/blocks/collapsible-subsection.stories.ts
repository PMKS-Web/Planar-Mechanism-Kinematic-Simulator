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

/** Nested steps keep the parent's content width; closing a step removes its controls from Tab order. */
export const Nested: Story = {
  render: () => ({
    template: `
      <collapsible-subsection titleLabel="Calculation" [expanded]="true">
        <collapsible-subsection titleLabel="1. Measure the Span" [nested]="true" [expanded]="true">
          <p>Use the farthest pair of joints.</p>
        </collapsible-subsection>
        <collapsible-subsection titleLabel="2. Distribute the Mass" [nested]="true">
          <p>Integrate along the full length.</p>
        </collapsible-subsection>
      </collapsible-subsection>
    `,
  }),
};
