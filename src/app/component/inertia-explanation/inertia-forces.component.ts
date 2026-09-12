import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RealLink } from '../../model/link';
import { LengthUnit } from '../../model/unit-enums';
import { appliedMoments } from '../../model/applied-moments';
import { SettingsService } from '../../services/settings.service';
import { InertiaPreviewService } from '../../services/inertia-preview.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { EquationComponent } from '../equation/equation.component';
import { inertiaFormat } from './inertia-format';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

@Component({
  selector: 'app-inertia-forces',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CollapsibleSubsectionComponent, EquationComponent],
  templateUrl: './inertia-forces.component.html',
})
export class InertiaForcesComponent {
  readonly body = input.required<RealLink>();
  readonly point = input.required<{ x: number; y: number }>();
  readonly lengthUnit = input.required<LengthUnit>();
  protected readonly settings = inject(SettingsService);
  protected readonly preview = inject(InertiaPreviewService);
  private readonly nup = inject(NumberUnitParserService);
  protected readonly formula = [
    String.raw`M_{P,i}=\mathbf r_{P\to i}\times\mathbf F_i`,
    String.raw`r_x=x_i-x_P`,
    String.raw`r_y=y_i-y_P`,
    String.raw`M_{P,i}=r_xF_y-r_yF_x`,
    String.raw`\sum M_P=\sum_i M_{P,i}+\sum_i C_i`,
  ];
  protected get working() {
    const f = inertiaFormat(this.lengthUnit(), this.nup);
    const n = f.tex;
    const result = appliedMoments(
      this.body(),
      this.point(),
      this.lengthUnit(),
      this.settings.isGravity.value
    );
    const qty = (v: number, u: string) => String.raw`${n(v)}\,\mathrm{${u}}`;
    const moment = (v: number) => String.raw`${n(v)}\,\mathrm{N}\cdot\mathrm{m}`;
    return {
      rows: result.rows.map((row, i) => ({
        ...row,
        step: {
          title: `Load ${i + 1}: ${row.name}`,
          text: `${row.moment > 0 ? 'Positive: counterclockwise.' : row.moment < 0 ? 'Negative: clockwise.' : 'Zero moment.'} The arm is from P to the application point. All components are in the grid frame; calculations below use SI units.`,
          equations: [
            `x_i^{grid}=${f.length(row.application.x)}`,
            `y_i^{grid}=${f.length(row.application.y)}`,
            `x_P^{grid}=${f.length(this.point().x)}`,
            `y_P^{grid}=${f.length(this.point().y)}`,
            `r_x=${qty(row.rx, 'm')}`,
            `r_y=${qty(row.ry, 'm')}`,
            `F_x=${qty(row.fx, 'N')}`,
            `F_y=${qty(row.fy, 'N')}`,
            String.raw`M_{P,${i + 1}}=r_xF_y-r_yF_x`,
            String.raw`\begin{aligned}M_{P,${i + 1}}&=(${n(row.rx)})(${n(row.fy)})\\&\quad-(${n(row.ry)})(${n(row.fx)})\end{aligned}`,
            `M_{P,${i + 1}}=${moment(row.moment)}`,
          ],
        },
      })),
      sums: [
        String.raw`M_{loads}=\sum_i M_{P,i}`,
        ...result.rows.map((row, i) => `M_{P,${i + 1}}=${moment(row.moment)}`),
        `M_{loads}=${moment(result.total)}`,
      ],
    };
  }
}
