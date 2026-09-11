import { FormControl, FormGroup } from '@angular/forms';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular-vite';
import { HoldFieldComponent } from '../../app/component/BLOCKS/hold-field/hold-field.component';
import { RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { inPanel } from '../support/frame';
import { gridUtilsStub, mechanismStub } from '../support/stubs';

/**
 * `hold-field-block`: a bar's Length and Angle, each with a padlock that fixes
 * that value against edits. The link is a real two-joint `RealLink`, so the
 * block's own `holdableBar` check runs; the mechanism and the Lock marks are
 * stubs, so a padlock press changes the stub's hold and nothing else.
 */
function bar(): RealLink {
  return new RealLink('AB', [new RealJoint('A', 0, 0), new RealJoint('B', 4, 3)]);
}

const meta: Meta = {
  title: 'Blocks/Hold Field',
  component: HoldFieldComponent,
  tags: ['autodocs'],
  decorators: [inPanel()],
  args: { only: undefined, disabled: false, angleHelp: undefined },
  render: (args) => ({
    props: {
      ...args,
      link: bar(),
      form: new FormGroup({ length: new FormControl('5.00'), angle: new FormControl('36.87') }),
    },
    template: `
      <hold-field-block
        [formGroup]="form"
        [link]="link"
        [only]="only"
        [disabled]="disabled"
        [angleHelp]="angleHelp"
      ></hold-field-block>
    `,
  }),
};

export default meta;
type Story = StoryObj;

const withHold = (hold: 'length' | 'angle' | undefined, frozen: string[] = []) => [
  applicationConfig({ providers: [mechanismStub(hold), gridUtilsStub(frozen)] }),
];

export const Free: Story = { decorators: withHold(undefined) };

export const LengthFixed: Story = { decorators: withHold('length') };

export const AngleFixed: Story = { decorators: withHold('angle') };

/** A cylinder's row: an angle to hold, and no length, because its length is the stroke. */
export const AngleOnly: Story = {
  decorators: withHold(undefined),
  args: {
    only: 'angle',
    angleHelp: 'The direction this cylinder points, measured from the positive x axis.',
  },
};

/** Both ends locked in place: the padlocks step aside, since both values are already held. */
export const LockedInPlace: Story = { decorators: withHold(undefined, ['A', 'B']) };

/** A body of three or more joints has no single length or angle. */
export const Disabled: Story = { decorators: withHold(undefined), args: { disabled: true } };
