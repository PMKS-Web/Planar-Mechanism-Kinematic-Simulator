import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

/** Presentation only: this component never runs an optimizer or constructs mechanism entities. */
@Component({
  selector: 'app-path-synthesis-result',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent, CollapsibleSubsectionComponent],
  templateUrl: './path-synthesis-result.component.html',
  styleUrls: ['./path-synthesis-result.component.scss'],
})
export class PathSynthesisResultComponent {
  readonly busy = input(false);
  readonly message = input('');
  readonly refusal = input('');
  readonly createRefusal = input('');
  readonly evaluations = input(0);
  readonly metrics = input<{ rms: string; maximum: string; normalized: string }>();
  readonly partial = input(false);
  readonly synthesize = input<() => void>();
  readonly cancel = input<() => void>();
  readonly create = input<() => void>();
}
