import { FormControl, FormGroup } from '@angular/forms';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { InputComponent } from '../../app/component/BLOCKS/input/input.component';
import { PanelSectionCollapsibleComponent } from '../../app/component/BLOCKS/panel-section-collapsible/panel-section-collapsible.component';
import { TitleBlock } from '../../app/component/BLOCKS/title/title.component';
import { inPanel } from '../support/frame';

/**
 * `panel-section-collapsible`: a card section whose `[alwaysShown]` title-block
 * opens and closes the rest. The chevron on the title is what toggles it.
 */
const meta: Meta = {
  title: 'Blocks/Panel Section Collapsible',
  component: PanelSectionCollapsibleComponent,
  tags: ['autodocs'],
  decorators: [inPanel(), moduleMetadata({ imports: [TitleBlock, InputComponent] })],
  args: { expanded: true, warning: false, title: 'Input Settings' },
  render: (args) => ({
    props: { ...args, form: new FormGroup({ speed: new FormControl('10') }) },
    template: `
      <panel-section-collapsible [expanded]="expanded" [warning]="warning">
        <title-block alwaysShown [icon]="expanded ? 'expand_less' : 'expand_more'">{{ title }}</title-block>
        <input-block [formGroup]="form" _formControl="speed" unit="RPM" tooltip="How fast the input turns.">Speed</input-block>
      </panel-section-collapsible>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Expanded: Story = {};

export const Collapsed: Story = { args: { expanded: false } };

/** The warning color, for a section whose contents need attention. */
export const Warning: Story = { args: { warning: true, title: 'Not Ready' } };
