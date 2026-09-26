import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismOverviewService } from '../../services/mechanism-overview.service';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

/**
 * Which machine a machine panel is about, when the grid holds several: one
 * choice per machine, by its name or its code. Choosing one picks it, as its
 * row in the playback bar does, and the other machines step back on the grid.
 */
@Component({
  selector: 'app-mechanism-switcher',
  template: `@if (overview.choices().length > 1) {
    <segmented-block
      class="mechanismSwitcher"
      label="Mechanism"
      [options]="overview.choices()"
      [selected]="index()"
      [wrap]="overview.choices().length > 3"
      (selectedChange)="pick($event)"
    />
  }`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SegmentedComponent],
})
export class MechanismSwitcherComponent {
  protected overview = inject(MechanismOverviewService);
  private activeObj = inject(ActiveObjService);

  readonly index = input.required<number>();

  protected pick(index: number): void {
    this.activeObj.selectMechanism(index);
  }
}
