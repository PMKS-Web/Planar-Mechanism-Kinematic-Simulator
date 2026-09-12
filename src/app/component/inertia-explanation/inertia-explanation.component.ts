import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Link, RealLink } from '../../model/link';
import { uniformMassProperties } from '../../model/mass-properties';
import { LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { EquationComponent } from '../equation/equation.component';
import { InertiaAxisComponent } from './inertia-axis.component';
import { inertiaFormat, InertiaStep } from './inertia-format';
import { InertiaStepComponent } from './inertia-step.component';
import { inertiaSteps } from './inertia-steps';
import { InertiaMassModelComponent } from './inertia-mass-model.component';

/** Read mutable links afresh: a mass edit, undo or new selection must update the
 * worked values even when the input still holds the same object. */
@Component({
  selector: 'app-inertia-explanation',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CollapsibleSubsectionComponent,
    EquationComponent,
    InertiaAxisComponent,
    InertiaStepComponent,
    InertiaMassModelComponent,
  ],
  templateUrl: './inertia-explanation.component.html',
  styleUrl: './inertia-explanation.component.scss',
})
export class InertiaExplanationComponent {
  readonly body = input.required<Link>();
  readonly lengthUnit = input<LengthUnit>(LengthUnit.CM);
  readonly expanded = input(false);
  protected readonly axisOpen = signal(false);
  protected readonly open = signal<boolean | undefined>(undefined);
  private readonly nup = inject(NumberUnitParserService);
  protected get realBody(): RealLink | undefined {
    const body = this.body();
    return body instanceof RealLink ? body : undefined;
  }
  protected get working() {
    const link = this.realBody;
    const f = inertiaFormat(this.lengthUnit(), this.nup);
    if (!link)
      return {
        title: 'Point mass',
        used: f.inertiaText(0),
        derived: '',
        steps: [] as InertiaStep[],
        notes: [
          'The slider block is modeled as a point mass with zero rotational inertia. Its mass still contributes to translation and gravity.',
        ],
      };
    const properties = uniformMassProperties(link, f.factor);
    const shape = inertiaSteps(link, properties, f);
    const notes = [
      'Joint geometry defines the uniform-body idealization. Display width, rounded ends and drawing a link as a disc do not change it.',
    ];
    if (link.comIsCustom)
      notes.push(
        'The center of mass is custom. The shape estimate stays about the uniform centroid; moving the center does not shift it. Enter a matching custom inertia for your actual mass distribution.'
      );
    return {
      ...shape,
      used: f.inertiaText(link.massMoI),
      derived: f.inertiaText(properties.moi),
      notes,
    };
  }
}
