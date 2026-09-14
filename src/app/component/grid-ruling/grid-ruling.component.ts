import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CHROME_SETTINGS } from '../../services/chrome/chrome-tokens';
import { SvgGridService } from '../../services/svg-grid.service';
import { MODEL_SCALE } from '../../model/render-scale';

@Component({
  selector: 'g[appGridRuling]',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './grid-ruling.component.html',
  styleUrl: './grid-ruling.component.scss',
})
export class GridRulingComponent {
  protected readonly settings = inject(CHROME_SETTINGS);
  protected readonly svgGrid = inject(SvgGridService);
  protected ready(): boolean {
    return this.svgGrid.panZoomObject !== undefined;
  }
  protected axisLabel(line: number): number {
    return Math.round((line / MODEL_SCALE) * 1e6) / 1e6;
  }
}
