import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MobilityCount } from '../../model/mechanism/mobility-count';
import { WORLD } from '../../model/mechanism/bodies';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

/** Read the actual solver terms rather than maintaining a second educational calculation. */
@Component({
  selector: 'app-mobility-explanation',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CollapsibleSubsectionComponent],
  templateUrl: './mobility-explanation.component.html',
  styleUrl: './mobility-explanation.component.scss',
})
export class MobilityExplanationComponent {
  readonly count = input.required<MobilityCount>();
  readonly dof = input.required<number>();
  readonly hiddenFreedoms = input<number>();
  protected readonly world = WORLD;
}
