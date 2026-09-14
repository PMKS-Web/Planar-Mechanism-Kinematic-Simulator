import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { ViewportService } from '../../services/viewport.service';

@Component({
  selector: 'app-empty-selection',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
  templateUrl: './empty-selection.component.html',
})
export class EmptySelectionComponent {
  readonly empty = input(false);
  readonly frozen = input(false);
  protected readonly viewport = inject(ViewportService);
  protected get press() {
    return this.viewport.isTouch() ? 'Press and hold' : 'Right-click';
  }
}
