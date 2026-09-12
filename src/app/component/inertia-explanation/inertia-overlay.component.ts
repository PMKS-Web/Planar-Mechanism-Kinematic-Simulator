import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ModelFrameDirective, UprightDirective } from '../../model-frame.directive';
import { InertiaPreviewService } from '../../services/inertia-preview.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { MODEL_SCALE } from '../../model/render-scale';
import { MassGeometryPreviewService } from '../../services/mass-geometry-preview.service';
import { MassGeometryComponent } from './mass-geometry.component';

@Component({
  selector: 'g[app-inertia-overlay]',
  imports: [ModelFrameDirective, UprightDirective, MassGeometryComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './inertia-overlay.component.html',
  styleUrl: './inertia-overlay.component.scss',
  host: { 'pointer-events': 'none' },
})
export class InertiaOverlayComponent {
  protected readonly massPreview = inject(MassGeometryPreviewService);
  protected readonly preview = inject(InertiaPreviewService);
  protected readonly grid = inject(SvgGridService);
  private readonly settings = inject(SettingsService);
  private readonly nup = inject(NumberUnitParserService);
  protected get view() {
    const selection = this.preview.selection();
    if (!selection) return undefined;
    const p =
      selection.key === 'grid'
        ? { x: 0, y: 0 }
        : selection.body.joints.find((j) => j.id === selection.key);
    if (!p) return undefined;
    const g = selection.body.CoM;
    return {
      p,
      g,
      force: selection.force,
      mid: { x: (p.x + g.x) / 2, y: (p.y + g.y) / 2 },
      distance:
        (Math.hypot(p.x - g.x, p.y - g.y) / MODEL_SCALE).toPrecision(4) +
        ' ' +
        this.nup.unitLabel(this.settings.lengthUnit.value),
    };
  }
}
