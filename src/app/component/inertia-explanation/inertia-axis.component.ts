import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { inertiaAboutPoint } from '../../model/inertia-about-point';
import { LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { EquationComponent } from '../equation/equation.component';
import { inertiaFormat } from './inertia-format';

@Component({
  selector: 'app-inertia-axis',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CollapsibleSubsectionComponent, EquationComponent],
  templateUrl: './inertia-axis.component.html',
  styleUrl: './inertia-explanation.component.scss',
})
export class InertiaAxisComponent {
  readonly body = input.required<RealLink>();
  readonly lengthUnit = input.required<LengthUnit>();
  protected readonly selected = signal<string | undefined>(undefined);
  private readonly nup = inject(NumberUnitParserService);
  protected readonly parallel = String.raw`I_P = I_G + md^2`;
  protected readonly general = [
    String.raw`\sum M_P = I_G\alpha + M_t`,
    String.raw`\begin{aligned}M_t &= m r_x a_{G,y}\\ &\quad - m r_y a_{G,x}\end{aligned}`,
  ];
  protected readonly fixed = String.raw`\sum M_P = I_P\alpha`;
  protected readonly moving = [
    String.raw`\sum M_P = I_P\alpha + M_a`,
    String.raw`\begin{aligned}M_a &= m r_x a_{P,y}\\ &\quad - m r_y a_{P,x}\end{aligned}`,
  ];

  protected get working() {
    const body = this.body();
    const f = inertiaFormat(this.lengthUnit(), this.nup);
    const joint = body.joints.find((j) => j.id === this.selected()) ?? body.joints[0];
    const atGrid = this.selected() === 'grid';
    const point = atGrid ? { x: 0, y: 0 } : joint;
    if (!point) return undefined;
    const result = inertiaAboutPoint(body, point, f.factor);
    const equations = [
      `x_P = ${f.length(point.x)}`,
      `y_P = ${f.length(point.y)}`,
      `x_G = ${f.length(body.CoM.x)}`,
      `y_G = ${f.length(body.CoM.y)}`,
    ];
    if (result.available)
      equations.push(
        String.raw`r_x = x_G - x_P`,
        `r_x = ${f.length(result.dx)}`,
        String.raw`r_y = y_G - y_P`,
        `r_y = ${f.length(result.dy)}`,
        String.raw`d^2 = r_x^2 + r_y^2`,
        `d^2 = ${f.square(result.distanceSq)}`,
        `I_G = ${f.inertia(body.massMoI)}`,
        `m = ${f.mass(body.mass)}`,
        `md^2 = ${f.inertia(result.shift)}`,
        `I_P = ${f.inertiaNumber(body.massMoI)} + ${f.inertiaNumber(result.shift)}`,
        `I_P = ${f.inertia(result.inertia)}`
      );
    return {
      key: atGrid ? 'grid' : joint.id,
      result: result.available ? f.inertiaText(result.inertia) : undefined,
      reason: result.available ? undefined : result.reason,
      fixedPin: !atGrid && joint instanceof RevJoint && joint.ground,
      equations,
    };
  }
}
