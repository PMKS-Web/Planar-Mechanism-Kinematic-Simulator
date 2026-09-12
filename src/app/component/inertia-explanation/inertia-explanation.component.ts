import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Link, RealLink } from '../../model/link';
import { uniformMassProperties } from '../../model/mass-properties';
import { MODEL_SCALE } from '../../model/render-scale';
import { siUnitFactors } from '../../model/unit-conversions';
import { LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

/** Read-only working beside the mass field. The calculation is shared with the
 * mechanism; only units and prose belong here. Read mutable links afresh while
 * open so a mass edit, an undo or a new selection cannot leave stale working. */
@Component({
  selector: 'app-inertia-explanation',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CollapsibleSubsectionComponent],
  templateUrl: './inertia-explanation.component.html',
  styleUrl: './inertia-explanation.component.scss',
})
export class InertiaExplanationComponent {
  readonly body = input.required<Link>();
  readonly lengthUnit = input<LengthUnit>(LengthUnit.CM);
  readonly expanded = input(false);
  protected readonly open = signal(false);
  private readonly nup = inject(NumberUnitParserService);

  protected get working() {
    const link = this.body();
    const length = this.lengthUnit();
    const unit = this.nup.unitLabel(length);
    const massUnit = this.nup.unitLabel(this.nup.massUnitFor(length));
    const inertiaUnit = this.nup.unitLabel(this.nup.displayInertiaUnit(length));
    const n = (value: number) =>
      Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : 'unavailable';
    const inertia = (value: number) =>
      `${n(this.nup.convertInertia(value, this.nup.storedInertiaUnit(length), this.nup.displayInertiaUnit(length)))} ${inertiaUnit}`;
    const steps: { title: string; text: string; formula: string }[] = [];
    const notes: string[] = [];
    const units = siUnitFactors(unit);
    const factor =
      (units.massToKg * units.distanceToM ** 2) / units.inertiaToKgM2 / MODEL_SCALE ** 2;
    if (!(link instanceof RealLink)) {
      return {
        title: 'Point mass',
        used: `0 ${inertiaUnit}`,
        derived: '',
        steps,
        notes: [
          'The slider block is modeled as a point mass: I = 0. Its mass still contributes to translation and gravity.',
        ],
      };
    }
    const properties = uniformMassProperties(link, factor);
    const shape = properties.shape;
    const calculation = shape?.calculation;
    const xy = (point: { x: number; y: number }) =>
      `(${n(point.x / MODEL_SCALE)}, ${n(point.y / MODEL_SCALE)}) ${unit}`;
    let title = 'Point mass';
    if (calculation?.kind === 'rod') {
      title = 'Uniform slender rod';
      steps.push({
        title: '1. Measure the span',
        text: 'L is the distance between the farthest joints. Collinear extra joints use the same rod model.',
        formula: `L = ${n(Math.sqrt(calculation.lengthSq) / MODEL_SCALE)} ${unit}`,
      });
      steps.push({
        title: '2. Distribute the mass uniformly',
        text: 'Integrate r² dm along the rod, from −L/2 to L/2, with dm = (m/L) dr.',
        formula: 'I = (m/L) ∫ r² dr = mL²/12',
      });
      steps.push({
        title: '3. Substitute this link’s values',
        text: `Mass m = ${n(link.mass)} ${massUnit}. The centroid is at ${xy(properties.com)}.`,
        formula: `I = ${n(link.mass)} × ${n(calculation.lengthSq / MODEL_SCALE ** 2)} / 12 = ${inertia(properties.moi)}`,
      });
    } else if (calculation?.kind === 'plate') {
      title = 'Uniform plate';
      const area = calculation.area / MODEL_SCALE ** 2;
      const polar = calculation.polarOverMass / MODEL_SCALE ** 2;
      const cx = calculation.centroidX / MODEL_SCALE;
      const cy = calculation.centroidY / MODEL_SCALE;
      steps.push({
        title: '1. Form the outer polygon',
        text: 'Use the convex hull of the joints with uniform mass per area. Interior joints add no material. The following vertices run counterclockwise, relative to O.',
        formula: `O = ${xy(calculation.origin)}; vertices: ${calculation.vertices.map(xy).join('; ')}`,
      });
      steps.push({
        title: '2. Find area and centroid',
        text: 'For each edge i → j (including the closing edge), let cᵢ = xᵢyⱼ − xⱼyᵢ. A = Σcᵢ/2, x̄ = Σ(xᵢ + xⱼ)cᵢ/(6A), and ȳ = Σ(yᵢ + yⱼ)cᵢ/(6A).',
        formula: `A = ${n(area)} ${unit}²; (x̄, ȳ) = (${n(cx)}, ${n(cy)}) ${unit}`,
      });
      steps.push({
        title: '3. Integrate about O',
        text: 'Iₒ/m = Σ[cᵢ(xᵢ² + xᵢxⱼ + xⱼ² + yᵢ² + yᵢyⱼ + yⱼ²)]/(12A). This is the polar area moment divided by area; multiplying by mass gives mass moment of inertia.',
        formula: `Iₒ/m = ${n(polar)} ${unit}²`,
      });
      steps.push({
        title: '4. Move the axis to the centroid',
        text: 'Subtract the parallel-axis term: I = Iₒ − m(x̄² + ȳ²).',
        formula: `I = ${n(link.mass)} × (${n(polar)} − ${n(cx ** 2 + cy ** 2)}) = ${inertia(properties.moi)}`,
      });
    } else if (properties.parts.length) {
      title = 'Welded compound';
      steps.push({
        title: '1. Find the combined center',
        text: 'Use each member’s mass and center of mass: G = Σ(mᵢGᵢ)/Σmᵢ. A member with custom properties contributes those values.',
        formula: `G = ${xy(properties.com)}`,
      });
      properties.parts.forEach((part, i) => {
        const distanceSq =
          ((part.com.x - properties.com.x) ** 2 + (part.com.y - properties.com.y) ** 2) /
          MODEL_SCALE ** 2;
        steps.push({
          title: `${i + 2}. Add ${part.body.name || part.body.id}`,
          text: `Iᵢ ${part.body.moiIsCustom ? 'is set by you' : 'comes from this member’s uniform shape'}. dᵢ is the distance from its center ${xy(part.com)} to G.`,
          formula: `Iᵢ + mᵢdᵢ² = ${inertia(part.moi)} + ${n(part.mass)} ${massUnit} × ${n(distanceSq)} ${unit}² = ${inertia(part.moi + part.mass * distanceSq * MODEL_SCALE ** 2 * factor)}`,
        });
      });
      steps.push({
        title: 'Sum the contributions',
        text: 'Each welded member retains its own mass distribution; empty space between members adds no material.',
        formula: `I = Σ(Iᵢ + mᵢdᵢ²) = ${inertia(properties.moi)}`,
      });
    }
    if (link.moiIsCustom)
      notes.push(
        'The value used is set by you or a saved file. The working below is a shape estimate for comparison; it does not replace your value. Clear the custom inertia field to use the shape estimate.'
      );
    if (link.comIsCustom)
      notes.push(
        'The center of mass is custom. PMKS keeps the shape estimate about the uniform centroid; moving the center of mass does not shift this estimate. Enter a matching custom inertia for your actual mass distribution.'
      );
    if (!(link.mass > 0))
      notes.push('Zero mass gives zero inertia. Gravity and inertia skip this body.');
    if (calculation?.kind === 'point')
      notes.push(
        'All joints coincide, so the idealized mass has zero distance from its centroid and I = 0.'
      );
    notes.push(
      'The joint geometry defines this idealization. Display width, rounded ends and drawing a link as a disc do not change it.'
    );
    return { title, used: inertia(link.massMoI), derived: inertia(properties.moi), steps, notes };
  }
}
