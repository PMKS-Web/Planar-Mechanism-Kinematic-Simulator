import { RealLink } from '../../model/link';
import { MassProperties } from '../../model/mass-properties';
import { UniformBody } from '../../model/uniform-body';
import { MODEL_SCALE } from '../../model/render-scale';
import { InertiaFormat, InertiaStep } from './inertia-format';

type Plate = Extract<UniformBody['calculation'], { kind: 'plate' }>;

/** Display the integrator's unrounded edge terms, never integrate a second outline. */
export function plateSteps(c: Plate, properties: MassProperties, link: RealLink, f: InertiaFormat) {
  const n = (value: number, power = 1) => f.tex(value / MODEL_SCALE ** power);
  const q = (value: number, power = 1) => (power === 1 ? f.length(value) : f.power(value, power));
  const vertexName = (i: number) => {
    const v = c.vertices[i];
    const joint = link.joints.find(
      (j) => Math.hypot(j.x - c.origin.x - v.x, j.y - c.origin.y - v.y) < 1e-7
    );
    return `Vertex ${i + 1}${joint ? ` (Joint ${joint.name || joint.id})` : ''}`;
  };
  const vertices: InertiaStep[] = c.vertices.map((v, i) => ({
    title: vertexName(i),
    text:
      i === 0
        ? 'This vertex defines O. Its local coordinates are zero; its grid coordinates are shown separately.'
        : 'Local coordinates are measured from O, along the grid axes.',
    equations: [
      `x_{${i + 1}}^{local} = ${q(v.x)}`,
      `y_{${i + 1}}^{local} = ${q(v.y)}`,
      `x_{${i + 1}}^{grid} = ${q(v.x + c.origin.x)}`,
      `y_{${i + 1}}^{grid} = ${q(v.y + c.origin.y)}`,
    ],
  }));
  const boundary = (second: boolean): InertiaStep[] =>
    c.edges.map((e, i) => {
      const a = c.vertices[e.from],
        b = c.vertices[e.to];
      const equations = second
        ? [
            String.raw`Q_{x,i}=x_i^2+x_ix_j+x_j^2`,
            String.raw`\begin{aligned}Q_{x,${i + 1}}&=(${n(a.x)})^2\\&+(${n(a.x)})(${n(b.x)})\\&+(${n(b.x)})^2\end{aligned}`,
            `Q_{x,${i + 1}}=${q(e.qx, 2)}`,
            String.raw`Q_{y,i}=y_i^2+y_iy_j+y_j^2`,
            String.raw`\begin{aligned}Q_{y,${i + 1}}&=(${n(a.y)})^2\\&+(${n(a.y)})(${n(b.y)})\\&+(${n(b.y)})^2\end{aligned}`,
            `Q_{y,${i + 1}}=${q(e.qy, 2)}`,
            String.raw`\Delta J_{x,i}=\frac{c_iQ_{y,i}}{12}`,
            String.raw`\Delta J_{x,${i + 1}}=\frac{(${n(e.cross, 2)})(${n(e.qy, 2)})}{12}`,
            String.raw`\Delta J_{x,${i + 1}}=${q((e.cross * e.qy) / 12, 4)}`,
            String.raw`\Delta J_{y,i}=\frac{c_iQ_{x,i}}{12}`,
            String.raw`\Delta J_{y,${i + 1}}=\frac{(${n(e.cross, 2)})(${n(e.qx, 2)})}{12}`,
            String.raw`\Delta J_{y,${i + 1}}=${q((e.cross * e.qx) / 12, 4)}`,
            String.raw`\Delta J_{O,i}=\Delta J_{x,i}+\Delta J_{y,i}`,
            String.raw`\Delta J_{O,${i + 1}}=${q(e.polar / 12, 4)}`,
            String.raw`\Delta I_{O,i}=\frac{m}{A}\Delta J_{O,i}`,
            String.raw`\Delta I_{O,${i + 1}}=\frac{${f.tex(link.mass)}}{${n(c.area, 2)}}(${n(e.polar / 12, 4)})`,
            String.raw`\Delta I_{O,${i + 1}}=${f.inertia(((link.mass * e.polar) / (12 * c.area)) * f.factor)}`,
          ]
        : [
            String.raw`c_i=x_i y_j-x_j y_i`,
            String.raw`\begin{aligned}c_{${i + 1}}&=(${n(a.x)})(${n(b.y)})\\&\quad-(${n(b.x)})(${n(a.y)})\end{aligned}`,
            `c_{${i + 1}}=${q(e.cross, 2)}`,
            String.raw`A_i=\frac{c_i}{2}`,
            String.raw`A_{${i + 1}}=\frac{${n(e.cross, 2)}}{2}`,
            `A_{${i + 1}}=${q(e.cross / 2, 2)}`,
            String.raw`S_{x,i}=\frac{(x_i+x_j)c_i}{6}`,
            `u_x=(${n(a.x)})+(${n(b.x)})`,
            `u_x=${q(a.x + b.x)}`,
            String.raw`S_{x,${i + 1}}=\frac{(${n(a.x + b.x)})(${n(e.cross, 2)})}{6}`,
            `S_{x,${i + 1}}=${q(e.firstX / 6, 3)}`,
            String.raw`S_{y,i}=\frac{(y_i+y_j)c_i}{6}`,
            `u_y=(${n(a.y)})+(${n(b.y)})`,
            `u_y=${q(a.y + b.y)}`,
            String.raw`S_{y,${i + 1}}=\frac{(${n(a.y + b.y)})(${n(e.cross, 2)})}{6}`,
            `S_{y,${i + 1}}=${q(e.firstY / 6, 3)}`,
          ];
      return {
        title: `Edge ${e.from + 1} to ${e.to + 1}${e.to === 0 ? ' (Closing)' : ''}`,
        text: `${vertexName(e.from)} to ${vertexName(e.to)}. ${e.cross === 0 ? 'This edge contributes zero because it touches O; it is still included in the sum.' : 'Signed boundary contribution.'} Numeric substitutions use ${f.unit}; results carry the corresponding powers.`,
        equations,
      };
    });
  const sumRows = (symbol: string, values: number[], power: number) => [
    `${symbol}=${values.map((v) => `(${n(v, power)})`).join('+')}`,
  ];
  // Long sums are split into labeled terms rather than an unbounded display row.
  const total = (symbol: string, values: number[], power: number, value: number) => [
    ...(values.length <= 3
      ? sumRows(symbol, values, power)
      : [String.raw`${symbol}=\sum_i T_i`, ...values.map((v, i) => `T_{${i + 1}}=${q(v, power)}`)]),
    `${symbol}=${q(value, power)}`,
  ];
  const steps: InertiaStep[] = [
    {
      title: '1. Form the Outer Polygon',
      text: 'The mass geometry is the straight-edged convex hull of the joints. Rounded ends, fillets, display width, and disc outlines are drawing geometry only; no curved mass integration or tessellation is used.',
      equations: [],
      children: [
        {
          title: 'Coordinate Frame and Transform',
          text: 'O is the first hull vertex in the current pose. Local axes are parallel to the grid, not rotating body axes. The hull is counterclockwise; vertex ordering and O may change as the body turns. Subtracting O improves numerical stability.',
          equations: [
            `O_x^{grid}=${q(c.origin.x)}`,
            `O_y^{grid}=${q(c.origin.y)}`,
            String.raw`x_i^{local}=x_i^{grid}-O_x^{grid}`,
            String.raw`y_i^{local}=y_i^{grid}-O_y^{grid}`,
            String.raw`x_i^{grid}=O_x^{grid}+x_i^{local}`,
            String.raw`y_i^{grid}=O_y^{grid}+y_i^{local}`,
          ],
        },
        ...vertices,
      ],
    },
    {
      title: '2. Find Area and Centroid',
      text: 'Here x and y are local coordinates. j is the next vertex, wrapping to vertex 1. Sx is the integral of x over area; Sy is the integral of y over area.',
      equations: [],
      children: [
        {
          title: 'Formula',
          text: '',
          equations: [
            String.raw`A=\sum_i A_i`,
            String.raw`\bar{x}=\frac{\sum_i S_{x,i}}{A}`,
            String.raw`\bar{y}=\frac{\sum_i S_{y,i}}{A}`,
          ],
        },
        {
          title: 'Boundary Contributions',
          text: 'Expand an edge to inspect its coordinates, substitution, and signed contribution.',
          equations: [],
          children: boundary(false),
        },
        {
          title: 'Sum Area and First Moments',
          text: 'The sum uses unrounded terms. T labels individual terms when a sum is too long for one row.',
          equations: [
            ...total(
              'A',
              c.edges.map((e) => e.cross / 2),
              2,
              c.area
            ),
            ...total(
              'S_x',
              c.edges.map((e) => e.firstX / 6),
              3,
              c.sums.firstX / 6
            ),
            ...total(
              'S_y',
              c.edges.map((e) => e.firstY / 6),
              3,
              c.sums.firstY / 6
            ),
            String.raw`\bar{x}=\frac{${n(c.sums.firstX / 6, 3)}}{${n(c.area, 2)}}`,
            String.raw`\bar{x}=${q(c.centroidX)}`,
            String.raw`\bar{y}=\frac{${n(c.sums.firstY / 6, 3)}}{${n(c.area, 2)}}`,
            String.raw`\bar{y}=${q(c.centroidY)}`,
            String.raw`x_G^{grid}=O_x^{grid}+\bar{x}`,
            `x_G^{grid}=${q(properties.com.x)}`,
            String.raw`y_G^{grid}=O_y^{grid}+\bar{y}`,
            `y_G^{grid}=${q(properties.com.y)}`,
          ],
        },
      ],
    },
    {
      title: '3. Integrate About O',
      text: 'J denotes an area moment (length to the fourth power). Multiplying by uniform areal density gives mass moment I. The axis is perpendicular to the drawing through O.',
      equations: [],
      children: [
        {
          title: 'Formula',
          text: '',
          equations: [
            String.raw`J_O=\sum_i\Delta J_{O,i}`,
            String.raw`I_O=\frac{m}{A}J_O`,
            String.raw`k_O^2=\frac{J_O}{A}`,
          ],
        },
        {
          title: 'Inertia Contributions',
          text: 'Each edge supplies the same polynomial term accumulated by PMKS.',
          equations: [],
          children: boundary(true),
        },
        {
          title: 'Sum the Inertia Contributions',
          text: 'Sum the boundary area moments before multiplying by mass per area.',
          equations: [
            ...total(
              'J_O',
              c.edges.map((e) => e.polar / 12),
              4,
              c.sums.polar / 12
            ),
            `m=${f.mass(link.mass)}`,
            `A=${q(c.area, 2)}`,
            String.raw`I_O=\frac{${f.tex(link.mass)}}{${n(c.area, 2)}}(${n(c.sums.polar / 12, 4)})`,
            `I_O=${f.inertia(link.mass * c.polarOverMass * f.factor)}`,
            `k_O^2=${q(c.polarOverMass, 2)}`,
          ],
        },
      ],
    },
    {
      title: '4. Move to the Centroid',
      text: 'The barred centroid is measured from O. Subtract its parallel-axis term. Translation and planar rigid rotation preserve IG; a changed shape or mass need not.',
      equations: [
        String.raw`d_{OG}^2=\bar{x}^2+\bar{y}^2`,
        `d_{OG}^2=${q(c.centroidX ** 2 + c.centroidY ** 2, 2)}`,
        String.raw`I_G=I_O-md_{OG}^2`,
        String.raw`I_G=m(k_O^2-d_{OG}^2)`,
        String.raw`I_G=${f.tex(link.mass)}\left(${n(c.polarOverMass, 2)}-${n(c.centroidX ** 2 + c.centroidY ** 2, 2)}\right)`,
        `I_G=${f.inertia(properties.moi)}`,
      ],
    },
  ];
  return { title: 'Uniform plate', steps };
}
