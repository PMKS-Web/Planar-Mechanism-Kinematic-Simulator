import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CorrespondenceMode } from '../../model/synthesis/path-types';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

/** Presentation only: this component never runs an optimizer or constructs mechanism entities. */
@Component({
  selector: 'app-path-synthesis-result',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ButtonComponent, CollapsibleSubsectionComponent, SegmentedComponent],
  templateUrl: './path-synthesis-result.component.html',
  styleUrls: ['./path-synthesis-result.component.scss'],
})
export class PathSynthesisResultComponent {
  readonly mode = input<CorrespondenceMode>('monotone-free-timing');
  readonly modeChange = output<CorrespondenceMode>();
  readonly timingSummary = input('');
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
