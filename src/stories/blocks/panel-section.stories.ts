import { FormControl, FormGroup } from '@angular/forms';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { CollapsibleSubsectionComponent } from '../../app/component/BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { InputComponent } from '../../app/component/BLOCKS/input/input.component';
import { PanelSectionComponent } from '../../app/component/BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../../app/component/BLOCKS/title/title.component';
import { SETTINGS_AT_START_ONLY } from '../../app/model/edit-permission';
import { atWidth } from '../support/frame';

/**
 * `panel-section`: the card a panel is built on. Three slots -- the title, an
 * attached strip (`[panelAttached]`), the contents -- and a fourth,
 * `[panelLive]`, for what stays editable while the card is frozen.
 *
 * Composed the way the Edit panel composes it: fields inside a
 * `collapsible-subsection`, which is what gives them their padding. The
 * attached strip in the app is the Edit panel's own refusal strip, which is not
 * a block; here it is a plain line quoting the same model.
 */
const meta: Meta = {
  title: 'Structure/Panel Section',
  component: PanelSectionComponent,
  tags: ['autodocs'],
  decorators: [
    atWidth(250),
    moduleMetadata({ imports: [TitleBlock, InputComponent, CollapsibleSubsectionComponent] }),
  ],
  args: { frozen: false },
  render: (args) => ({
    props: {
      ...args,
      refusal: SETTINGS_AT_START_ONLY.long,
      form: new FormGroup({
        x: new FormControl('2.50'),
        y: new FormControl('-1.25'),
        mass: new FormControl('1.50'),
      }),
    },
    template: `
      <panel-section [frozen]="frozen">
        <title-block description="Two links meet here.">Joint A</title-block>
        @if (frozen) {
          <p panelAttached style="margin: 0; padding: 8px 15px; font-size: 13px; line-height: 18px">{{ refusal }}</p>
        }
        <collapsible-subsection titleLabel="Position" [expanded]="true">
          <input-block [formGroup]="form" _formControl="x" tooltip="Distance from the origin, along x.">X</input-block>
          <input-block [formGroup]="form" _formControl="y" tooltip="Distance from the origin, along y.">Y</input-block>
        </collapsible-subsection>
        <div panelLive>
          <collapsible-subsection titleLabel="Mass" [expanded]="true">
            <input-block [formGroup]="form" _formControl="mass" unit="kg" tooltip="The mass of this joint.">Mass</input-block>
          </collapsible-subsection>
        </div>
      </panel-section>
    `,
  }),
};

export default meta;
type Story = StoryObj;

export const Default: Story = {};

/**
 * Frozen: the contents are `inert`, while the attached strip says why and the
 * live slot (Mass) stays usable. The sentence comes from the permission model.
 */
export const Frozen: Story = { args: { frozen: true } };
