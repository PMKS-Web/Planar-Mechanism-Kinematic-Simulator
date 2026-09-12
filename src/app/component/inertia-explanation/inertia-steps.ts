import { plateSteps } from './polygon-working';
import { RealLink } from '../../model/link';
import { MassProperties } from '../../model/mass-properties';
import { MODEL_SCALE } from '../../model/render-scale';
import { InertiaFormat, InertiaStep } from './inertia-format';

/** Every equation is its own display row, including the numeric substitution. */
export function inertiaSteps(
  link: RealLink,
  properties: MassProperties,
  f: InertiaFormat
): { title: string; steps: InertiaStep[] } {
  const calculation = properties.shape?.calculation;
  if (calculation?.kind === 'rod')
    return {
      title: 'Uniform slender rod',
      steps: [
        {
          title: '1. Measure the Span',
          text: 'Use the farthest pair of joints. Collinear extra joints use the same rod model.',
          equations: [
            `L = ${f.length(Math.sqrt(calculation.lengthSq))}`,
            `m = ${f.mass(link.mass)}`,
            `x_G = ${f.length(properties.com.x)}`,
            `y_G = ${f.length(properties.com.y)}`,
          ],
        },
        {
          title: '2. Distribute the Mass',
          text: 'Let r measure position along the rod from its midpoint. Integrate the uniform mass distribution along its full length.',
          equations: [
            String.raw`\mathrm{d}m = \frac{m}{L}\,\mathrm{d}r`,
            String.raw`I_G = \int_{-\frac{L}{2}}^{\frac{L}{2}} r^2\,\mathrm{d}m`,
            String.raw`I_G = \frac{m}{L}\left[\frac{r^3}{3}\right]_{-\frac{L}{2}}^{\frac{L}{2}}`,
            String.raw`I_G = \frac{mL^2}{12}`,
          ],
        },
        {
          title: '3. Substitute the Values',
          text: 'Use the mass and length in the current project units.',
          equations: [
            `I_G = \\frac{${f.tex(link.mass)}\\times ${f.tex(calculation.lengthSq / MODEL_SCALE ** 2)}}{12}`,
            `I_G = ${f.inertia(properties.moi)}`,
          ],
        },
      ],
    };
  if (calculation?.kind === 'plate') return plateSteps(calculation, properties, link, f);
  if (properties.parts.length) return compoundSteps(properties, f);
  return {
    title: 'Point mass',
    steps: [
      {
        title: 'Zero Radius',
        text: 'All joints coincide. The mass has zero distance from its centroid.',
        equations: ['I_G = 0'],
      },
    ],
  };
}

function compoundSteps(properties: MassProperties, f: InertiaFormat) {
  const steps: InertiaStep[] = [
    {
      title: '1. Find the Combined Center',
      text: 'Weight each member’s center by its mass. A member with custom properties contributes those values.',
      equations: [
        String.raw`x_G = \frac{\sum_i m_i x_{G_i}}{\sum_i m_i}`,
        `x_G = ${f.length(properties.com.x)}`,
        String.raw`y_G = \frac{\sum_i m_i y_{G_i}}{\sum_i m_i}`,
        `y_G = ${f.length(properties.com.y)}`,
      ],
    },
  ];
  properties.parts.forEach((part, i) => {
    const d2 = (part.com.x - properties.com.x) ** 2 + (part.com.y - properties.com.y) ** 2;
    steps.push({
      title: `${i + 2}. Add ${part.body.name || part.body.id}`,
      text: `The member’s inertia ${part.body.moiIsCustom ? 'is set by you' : 'comes from its uniform shape'}. Measure its center’s distance to G, then add the parallel-axis term.`,
      equations: [
        `m_i = ${f.mass(part.mass)}`,
        `d_i^2 = ${f.square(d2)}`,
        `I_i = ${f.inertia(part.moi)}`,
        String.raw`I_{i,G} = I_i + m_i d_i^2`,
        `I_{i,G} = ${f.inertia(part.moi + part.mass * d2 * f.factor)}`,
      ],
    });
  });
  steps.push({
    title: 'Sum the Contributions',
    text: 'Each member retains its own mass distribution. Empty space between members adds no material.',
    equations: [String.raw`I_G = \sum_i I_{i,G}`, `I_G = ${f.inertia(properties.moi)}`],
  });
  return { title: 'Welded compound', steps };
}
