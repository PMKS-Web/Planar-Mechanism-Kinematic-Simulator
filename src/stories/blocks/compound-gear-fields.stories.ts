import { FormControl, FormGroup } from '@angular/forms';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { GearFieldsComponent } from '../../app/component/gears/gear-fields.component';
import { GearShaftChoicesComponent } from '../../app/component/gears/gear-shaft-choices.component';
import { inPanel } from '../support/frame';

const meta: Meta = {
  title: 'Fields/Compound Gear Shaft',
  component: GearFieldsComponent,
  tags: ['autodocs'],
  decorators: [moduleMetadata({ imports: [GearShaftChoicesComponent] })],
  render: () => ({
    props: {
      form: new FormGroup({
        name: new FormControl('Gear C'),
        teeth: new FormControl('10'),
        diameter: new FormControl('1'),
        plane: new FormControl('2'),
      }),
      selectedId: 'GC',
      gears: [
        { id: 'GB', name: 'Gear B', hostLinkId: 'CD', teeth: 40 },
        { id: 'GC', name: 'Gear C', hostLinkId: 'CD', teeth: 10, plane: 1 },
      ],
    },
    template:
      '<app-gear-fields [form]="form" unit="cm" /><app-gear-shaft-choices [gears]="gears" [selectedId]="selectedId" (picked)="selectedId=$event" />',
  }),
};
export default meta;
type Story = StoryObj;
export const NarrowPanel: Story = { decorators: [inPanel(250)] };
export const PhonePanel: Story = { decorators: [inPanel(360)] };
