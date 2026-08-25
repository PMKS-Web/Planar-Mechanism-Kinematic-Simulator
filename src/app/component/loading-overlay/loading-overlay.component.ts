import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../../services/loading.service';

/**
 * The cover itself. Rendered last in the app shell so it is over everything,
 * and only while `LoadingService` says the thread is about to be taken.
 */
@Component({
  selector: 'app-loading-overlay',
  templateUrl: './loading-overlay.component.html',
  styleUrls: ['./loading-overlay.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class LoadingOverlayComponent {
  readonly loading = inject(LoadingService);
}
