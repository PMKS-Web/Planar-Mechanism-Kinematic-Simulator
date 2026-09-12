import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { EditBannerComponent } from '../../app/component/edit-panel/edit-banner.component';
import { LockBannerComponent } from '../../app/component/edit-panel/lock-banner.component';
import { PanelSectionComponent } from '../../app/component/BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../../app/component/BLOCKS/title/title.component';
import { EditRefusal, SETTINGS_AT_START_ONLY } from '../../app/model/edit-permission';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { atWidth } from '../support/frame';
import {
  editPermissionStub,
  gridUtilsStub,
  linkSelectionStub,
  mechanismStub,
  settingsStub,
  tabsStub,
} from '../support/stubs';

/**
 * The panel's second line: why it cannot be typed into right now, said once,
 * with the way out as a word inside the sentence.
 *
 * `app-edit-banner` states an `EditRefusal` -- by default the one the
 * permission model gives it, or one the caller hands in. `app-lock-banner` is
 * the same strip for a link every joint of which a Lock holds. Both sit in
 * `panel-section`'s attached slot, above the contents the freeze covers, and
 * share one stylesheet, so a message is the same two lines in every state.
 */
const paused: EditRefusal = {
  short: 'needs the start pose',
  glyph: 'pause_circle',
  lead: 'Paused mid-cycle.',
  action: 'Back to start',
  tail: 'to change the mechanism.',
  actionKind: 'backToStart',
  backToStartHelps: true,
  long: 'Paused mid-cycle. Back to start to change the mechanism.',
};

const inAnalysis: EditRefusal = {
  short: 'not in analysis',
  glyph: 'insights',
  lead: 'Analyzing.',
  action: 'Switch to Edit',
  tail: 'to change the mechanism.',
  actionKind: 'toEdit',
  long: 'Analyzing. Switch to Edit to change the mechanism.',
};

function bar(): RealLink {
  return new RealLink('AB', [new RealJoint('A', 0, 0), new RealJoint('B', 4, 3)]);
}

const meta: Meta = {
  title: 'Feedback/Banners',
  component: EditBannerComponent,
  tags: ['autodocs'],
  decorators: [
    atWidth(250),
    applicationConfig({
      providers: [editPermissionStub(), mechanismStub(), settingsStub(), tabsStub()],
    }),
  ],
  parameters: { controls: { disable: true } },
  render: (args) => ({
    props: args,
    moduleMetadata: { imports: [PanelSectionComponent, TitleBlock, EditBannerComponent] },
    template: `
      <panel-section>
        <title-block>Link AB</title-block>
        <app-edit-banner panelAttached [refusal]="refusal"></app-edit-banner>
        <div style="padding: 12px; color: var(--text-secondary)">The fields the freeze covers.</div>
      </panel-section>
    `,
  }),
};

export default meta;
type Story = StoryObj;

/** The mechanism is parked away from its start: the way out is to go back there. */
export const PausedMidCycle: Story = { args: { refusal: paused } };

/** An analysis mode: the way out is the Edit tab. */
export const InAnalysis: Story = { args: { refusal: inAnalysis } };

/** The Settings drawer's own refusal, said through the same strip rather than a second one. */
export const SettingsAtStartOnly: Story = { args: { refusal: SETTINGS_AT_START_ONLY } };

/** No refusal, no strip: the panel is its usual height. */
export const Nothing: Story = { args: { refusal: null } };

/** A link every joint of which a Lock holds. The padlocks in its fields step aside for this. */
export const LockedInPlace: Story = {
  decorators: [
    applicationConfig({
      providers: [linkSelectionStub(bar()), gridUtilsStub(['A', 'B']), mechanismStub()],
    }),
  ],
  render: () => ({
    moduleMetadata: { imports: [PanelSectionComponent, TitleBlock, LockBannerComponent] },
    template: `
      <panel-section>
        <title-block>Link AB</title-block>
        <app-lock-banner panelAttached></app-lock-banner>
        <div style="padding: 12px; color: var(--text-secondary)">Length and angle, both already held.</div>
      </panel-section>
    `,
  }),
};
