import { Force } from '../../app/model/force';
import { Coord } from '../../app/model/coord';
import { RevJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular-vite';
import { MassGeometryExampleComponent } from '../support/mass-geometry-example.component';
import { InertiaExplanationComponent } from '../../app/component/inertia-explanation/inertia-explanation.component';
import { uniformMassProperties } from '../../app/model/mass-properties';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { LengthUnit } from '../../app/model/unit-enums';
import { inPanel } from '../support/frame';

// Bodies alone, never a running mechanism or its root service.
function body(points: number[][], mass = 12): RealLink {
  const joints = points.map(
    ([x, y], i) => new RevJoint('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i], x * MODEL_SCALE, y * MODEL_SCALE)
  );
  const link = new RealLink(joints.map((j) => j.id).join(''), joints, mass);
  const properties = uniformMassProperties(link, 0.001 / MODEL_SCALE ** 2);
  link.massMoI = properties.moi;
  link.CoM = properties.com;
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
const compoundProperties = uniformMassProperties(compound, 0.001 / MODEL_SCALE ** 2);
compound.subset[1].name = 'BC';
compound.massMoI = compoundProperties.moi;
compound.CoM = compoundProperties.com;
compound.reComputeDPath();
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

const shiftedPlate = body([
  [2, 3],
  [8, 3],
  [8, 5],
  [2, 5],
]);
export const TranslatedPlate: Story = { render: show(shiftedPlate) };
export const AsymmetricTriangle: Story = {
  render: show(
    body([
      [2, 3],
      [6, 3],
      [3, 6],
    ])
  ),
};
const angle = 0.731;
export const RotatedPlate: Story = {
  render: show(
    body(
      [
        [2, 3],
        [8, 3],
        [8, 5],
        [2, 5],
      ].map(([x, y]) => [
        x * Math.cos(angle) - y * Math.sin(angle),
        x * Math.sin(angle) + y * Math.cos(angle),
      ])
    )
  ),
};
const loaded = body([
  [2, 3],
  [8, 3],
  [8, 5],
  [2, 5],
]);
loaded.forces = [
  new Force(
    'F1',
    loaded,
    new Coord(4 * MODEL_SCALE, 3 * MODEL_SCALE),
    new Coord(4 * MODEL_SCALE, 4 * MODEL_SCALE),
    false,
    true,
    2
  ),
  new Force(
    'F2',
    loaded,
    new Coord(7 * MODEL_SCALE, 3 * MODEL_SCALE),
    new Coord(7 * MODEL_SCALE, 2 * MODEL_SCALE),
    false,
    true,
    3
  ),
];
export const AppliedLoads: Story = { render: show(loaded) };

const comparison = (link: RealLink, caption: string, interior = false): Story => ({
  decorators: [moduleMetadata({ imports: [MassGeometryExampleComponent] })],
  render: () => ({
    props: { body: link, caption, interior },
    template:
      '<app-mass-geometry-example [body]="body" [caption]="caption" [interior]="interior" />',
  }),
});
export const SlenderRodEndpoint = comparison(
  rod(),
  'A 12 g rod, 5 cm long: 25 g·cm² about G, 100 g·cm² about either endpoint. Open Shift to an Endpoint for the worked result.'
);
export const InteriorJoint = comparison(
  body([
    [0, 0],
    [6, 0],
    [6, 2],
    [0, 2],
    [3, 1],
  ]),
  'A 12 g convex plate: hull area 12 cm² and centroidal inertia 40 g·cm². The fifth joint E adds no material.',
  true
);
export const VisibleOutline = comparison(
  body([
    [0, 0],
    [1, 0],
  ]),
  'A thick-looking rounded link is still an automatic slender rod. Its displayed width and caps add no mass extent.'
);
export const MemberDecomposition = comparison(
  compound,
  'The two numbered centerlines are separate welded members. The filled drawing between and around them is not a single integrated plate.'
);
export const CoincidentGeometry = comparison(
  body([
    [0, 0],
    [0, 0],
  ]),
  'Coincident joints define a point mass. The marker radius is for visibility only.'
);
