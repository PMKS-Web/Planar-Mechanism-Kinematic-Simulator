import type { Meta, StoryObj } from '@storybook/angular-vite';
import { TabsComponent } from '../../app/component/BLOCKS/tabs/tabs.component';
import { inPanel } from '../support/frame';

/** Underline navigation for 2–4 panel views. Arrow keys, Home and End select and
 * focus a tab; the caller owns the matching labelled tabpanels and their contents. */
const meta: Meta = {
  title: 'Structure/Tabs',
  component: TabsComponent,
  tags: ['autodocs'],
  decorators: [inPanel(420, 0)],
  args: {
    options: ['Rotation', 'Center of mass'],
    selected: 0,
    tooltips: [],
    label: 'Link kinematics',
    idPrefix: 'gallery',
  },
  render: (args) => ({
    props: {
      ...args,
      panelIds: args['options'].map((_: string, i: number) => `gallery-panel-${i}`),
    },
    template: `
      <app-tabs-block [options]="options" [selected]="selected" [tooltips]="tooltips"
        [label]="label" [idPrefix]="idPrefix" [panelIds]="panelIds"
        (selectedChange)="selected = $event"></app-tabs-block>
      @for (option of options; track $index) {
        <div role="tabpanel" [id]="panelIds[$index]"
          [attr.aria-labelledby]="idPrefix + '-tab-' + $index" [hidden]="selected !== $index"
          style="padding: 15px; font-size: 13.5px;">{{option}} panel content</div>
      }
    `,
  }),
};
export default meta;
type Story = StoryObj;
export const TwoTabs: Story = {};
export const ForceModes: Story = {
  args: {
    options: ['Static', 'In-motion'],
    label: 'Force analysis type',
    tooltips: ['Holds the mechanism still', 'Includes the forces of movement'],
  },
};
export const ThreeTabs: Story = { args: { options: ['Position', 'Velocity', 'Acceleration'] } };
export const FourTabs: Story = {
  args: { options: ['Position', 'Velocity', 'Acceleration', 'Force'] },
};
export const LongLabels: Story = {
  args: {
    options: ['Center of mass position', 'Center of mass velocity', 'Center of mass acceleration'],
    selected: 1,
  },
};
