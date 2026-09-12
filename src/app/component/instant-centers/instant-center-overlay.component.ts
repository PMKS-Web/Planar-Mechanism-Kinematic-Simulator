import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InstantCenterDrawing, InstantCenterService } from '../../services/instant-center.service';
import { SettingsService } from '../../services/settings.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ModelFrameDirective, UprightDirective } from '../../model-frame.directive';
import { SvgGridService } from '../../services/svg-grid.service';
import { instantCenterLines } from './instant-center-lines';

@Component({
  selector: '[appInstantCenterOverlay]',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ModelFrameDirective, UprightDirective],
  host: { style: 'pointer-events: none' },
  template: `
    @if ((ic.show.value || ic.showConstruction.value) && tabs.getCurrentTab() === analyze) {
      <svg:g modelFrame>
        @for (drawing of ic.displayed(); track drawing.machine) {
          @if (ic.showConstruction.value) {
            @for (line of lines(drawing); track line.id) {
              <svg:line
                class="icConstruction"
                [attr.data-machine]="drawing.machine"
                [attr.data-sources]="line.id"
                [attr.x1]="line.start.x"
                [attr.y1]="line.start.y"
                [attr.x2]="line.end.x"
                [attr.y2]="line.end.y"
              />
            }
          }
          @if (ic.show.value) {
            @for (center of ic.selectedCenters(drawing); track center.id) {
              @if (ic.point(drawing.geometry, center); as point) {
                <svg:g
                  class="icMarker"
                  [attr.data-machine]="drawing.machine"
                  [attr.data-center]="center.id"
                  [upright]="point"
                >
                  <svg:path [attr.d]="center.kind === 'secondary' ? diamond : cross" />
                  <svg:text
                    [attr.x]="size * 1.5"
                    [attr.y]="-size * 1.5"
                    [attr.font-size]="size * 1.6"
                  >
                    {{ ic.displayed().length > 1 ? drawing.machine + ' ' : ''
                    }}{{ ic.label(center) }}
                  </svg:text>
                </svg:g>
              }
            }
          }
        }
      </svg:g>
    }
  `,
  styles: `
    .icConstruction {
      stroke: var(--canvas-ink);
      stroke-width: 1.5px;
      stroke-dasharray: 7 5;
      vector-effect: non-scaling-stroke;
      opacity: 0.65;
    }
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
  private readonly grid = inject(SvgGridService);
  protected readonly analyze = TabID.ANALYZE;
  protected lines(drawing: InstantCenterDrawing) {
    return instantCenterLines(
      drawing.geometry,
      this.grid.screenToModelFromXY(0, 0),
      this.grid.screenToModelFromXY(window.innerWidth, window.innerHeight),
      new Set(this.ic.selectedCenters(drawing).map((center) => center.id))
    );
  }
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
