import { RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { type Meta, type StoryObj } from '@storybook/angular-vite';
import { InertiaExplanationComponent } from '../../app/component/inertia-explanation/inertia-explanation.component';
import { uniformMassProperties } from '../../app/model/mass-properties';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { LengthUnit } from '../../app/model/unit-enums';
import { inPanel } from '../support/frame';

// Bodies alone, never a running mechanism or its root service.
function body(points: number[][], mass = 12): RealLink {
  const joints = points.map(
    ([x, y], i) => new RevJoint('ABCD'[i], x * MODEL_SCALE, y * MODEL_SCALE)
  );
  const link = new RealLink(joints.map((j) => j.id).join(''), joints, mass);
  link.massMoI = uniformMassProperties(link, 0.001 / MODEL_SCALE ** 2).moi;
  return link;
}
const rod = () =>
  body([
    [0, 0],
    [3, 4],
  ]);
const custom = rod();
custom.massMoI = 0.075;
custom.moiIsCustom = true;
const offset = rod();
offset.comIsCustom = true;
offset.CoM.x += MODEL_SCALE;
const disc = rod();
disc.isCircle = true;
const compound = body(
  [
    [0, 0],
    [4, 0],
    [4, 3],
  ],
  24
);
compound.subset = [
  body([
    [0, 0],
    [4, 0],
  ]),
  body([
    [4, 0],
    [4, 3],
  ]),
];
compound.massMoI = uniformMassProperties(compound, 0.001 / MODEL_SCALE ** 2).moi;
// Keep cyclic geometry out of Storybook args: Docs serializes controls to JSON.
const show = (link: RealLink | SliderBlock) => (args: Record<string, unknown>) => ({
  props: { ...args, body: link },
  template:
    '<app-inertia-explanation [body]="body" [lengthUnit]="lengthUnit" [expanded]="expanded" />',
});
const meta: Meta = {
  title: 'Feedback/Inertia Explanation',
  component: InertiaExplanationComponent,
  tags: ['autodocs'],
  decorators: [inPanel(250, 0)],
  args: { lengthUnit: LengthUnit.CM, expanded: true },
  argTypes: { body: { control: false } },
  render: show(rod()),
  parameters: {
    docs: {
      source: {
        code: '<app-inertia-explanation [body]="selectedLink" [lengthUnit]="lengthUnit" />',
      },
      description: {
        component:
          'The working shown beside Mass Settings. Uses the same uniform-body and compound calculation as the app, in the current project units. Custom inertia is retained; its shape estimate is labeled as a comparison.',
      },
    },
  },
};
export default meta;
type Story = StoryObj;
export const Rod: Story = {};
export const Collapsed: Story = { args: { expanded: false } };
export const Plate: Story = {
  render: show(
    body([
      [0, 0],
      [6, 0],
      [6, 2],
      [0, 2],
    ])
  ),
};
export const Collinear: Story = {
  render: show(
    body([
      [0, 0],
      [2, 0],
      [5, 0],
    ])
  ),
};
export const Compound: Story = { render: show(compound) };
export const Custom: Story = { render: show(custom) };
export const CustomCenter: Story = { render: show(offset) };
export const Disc: Story = { render: show(disc) };
export const ZeroMass: Story = {
  render: show(
    body(
      [
        [0, 0],
        [3, 4],
      ],
      0
    )
  ),
};
export const PointMass: Story = {
  render: show(new SliderBlock('A', [new RevJoint('A', 0, 0)], 12)),
};
const si = rod();
si.massMoI = 25;
export const SI: Story = { render: show(si), args: { lengthUnit: LengthUnit.METER } };
const english = rod();
english.massMoI = 25;
export const English: Story = { render: show(english), args: { lengthUnit: LengthUnit.INCH } };
