import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FrictionOverlayService } from '../../services/friction-overlay.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ModelFrameDirective, UprightDirective } from '../../model-frame.directive';
import { VECTOR_INK } from '../../model/vector-trace';

@Component({
  selector: 'g[app-friction-overlay]',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ModelFrameDirective, UprightDirective],
  templateUrl: './friction-overlay.component.html',
  styleUrl: './friction-overlay.component.scss',
})
export class FrictionOverlayComponent {
  protected readonly overlay = inject(FrictionOverlayService);
  protected readonly grid = inject(SvgGridService);
  protected readonly tabs = inject(SelectedTabService);
  protected readonly forceTab = TabID.FORCE;
  protected readonly ink = VECTOR_INK.force;
}
