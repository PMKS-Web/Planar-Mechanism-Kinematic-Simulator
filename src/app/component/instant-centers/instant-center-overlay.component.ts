import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InstantCenterService } from '../../services/instant-center.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ModelFrameDirective, UprightDirective } from '../../model-frame.directive';

@Component({
  selector: '[appInstantCenterOverlay]',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ModelFrameDirective, UprightDirective],
  host: { style: 'pointer-events: none' },
  template: `
    @if (ic.show.value && tabs.getCurrentTab() === analyze) {
      <svg:g modelFrame>
        @for (drawing of ic.displayed(); track drawing.machine) {
          @for (center of drawing.geometry.centers; track center.id) {
            @if (ic.point(drawing.geometry, center); as point) {
              <svg:g class="icMarker" [attr.data-center]="center.id" [upright]="point">
                <svg:path [attr.d]="center.kind === 'secondary' ? diamond : cross" />
                <svg:text
                  [attr.x]="size * 1.5"
                  [attr.y]="-size * 1.5"
                  [attr.font-size]="size * 1.6"
                >
                  {{ ic.displayed().length > 1 ? drawing.machine + ' ' : '' }}{{ ic.label(center) }}
                </svg:text>
              </svg:g>
            }
          }
        }
      </svg:g>
    }
  `,
  styles: `
    .icMarker {
      stroke: var(--text-primary);
      fill: var(--text-primary);
    }
    path {
      fill: none;
      stroke-width: 1.5px;
      vector-effect: non-scaling-stroke;
    }
    text {
      stroke: var(--surface);
      stroke-width: 3px;
      paint-order: stroke;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
  `,
})
export class InstantCenterOverlayComponent {
  protected readonly ic = inject(InstantCenterService);
  protected readonly tabs = inject(SelectedTabService);
  private readonly settings = inject(SettingsService);
  protected readonly analyze = TabID.ANALYZE;
  protected get size() {
    return this.settings.objectScale * 0.12;
  }
  protected get cross() {
    const r = this.size;
    return `M ${-r} 0 H ${r} M 0 ${-r} V ${r}`;
  }
  protected get diamond() {
    const r = this.size;
    return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`;
  }
}
