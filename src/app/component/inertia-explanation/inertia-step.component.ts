import { Component, input, forwardRef } from '@angular/core';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { EquationComponent } from '../equation/equation.component';
import { InertiaStep } from './inertia-format';

/** Each boundary piece can be inspected without opening every other piece. */
@Component({
  selector: 'app-inertia-step',
  imports: [
    CollapsibleSubsectionComponent,
    EquationComponent,
    forwardRef(() => InertiaStepComponent),
  ],
  template: `
    <collapsible-subsection [nested]="true" [titleLabel]="step().title">
      @if (step().text) {
        <p>{{ step().text }}</p>
      }
      @for (equation of step().equations; track $index) {
        <app-equation [math]="equation" />
      }
      @for (child of step().children; track $index) {
        <app-inertia-step [step]="child" />
      }
    </collapsible-subsection>
  `,
  styles: ':host { display: block; } p { margin: 0; }',
})
export class InertiaStepComponent {
  readonly step = input.required<InertiaStep>();
}
