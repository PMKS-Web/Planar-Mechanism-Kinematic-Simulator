import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  DoCheck,
  OnDestroy,
} from '@angular/core';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { inertiaAboutPoint } from '../../model/inertia-about-point';
import { LengthUnit } from '../../model/unit-enums';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { EquationComponent } from '../equation/equation.component';
import { InertiaPreviewService } from '../../services/inertia-preview.service';
import { InertiaForcesComponent } from './inertia-forces.component';
import { PrisJoint } from '../../model/joint';
import { MODEL_SCALE } from '../../model/render-scale';
import { inertiaFormat } from './inertia-format';

@Component({
  selector: 'app-inertia-axis',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CollapsibleSubsectionComponent, EquationComponent, InertiaForcesComponent],
  templateUrl: './inertia-axis.component.html',
  styleUrl: './inertia-explanation.component.scss',
})
export class InertiaAxisComponent implements DoCheck, OnDestroy {
  private readonly preview = inject(InertiaPreviewService);
  private previewBody?: RealLink;
  private previewKey?: string;
  ngDoCheck() {
    const view = this.working;
    if (view && (this.previewBody !== this.body() || this.previewKey !== view.key)) {
      this.previewBody = this.body();
      this.previewKey = view.key;
      this.preview.show(this, this.body(), view.key);
    }
  }
  protected activate() {
    const view = this.working;
    if (view) this.preview.show(this, this.body(), view.key);
  }
  ngOnDestroy() {
    this.preview.clear(this);
  }
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
    const dx = point.x - body.CoM.x;
    const dy = point.y - body.CoM.y;
    const distanceSq = dx * dx + dy * dy;
    const pair = (name: string, at: { x: number; y: number }) =>
      String.raw`${name}=(${f.tex(at.x / MODEL_SCALE)},${f.tex(at.y / MODEL_SCALE)})\,\mathrm{${f.unit}}`;
    const coordinates = [
      pair('G', body.CoM),
      pair('P', point),
      String.raw`\Delta x=${f.length(dx)}`,
      String.raw`\Delta y=${f.length(dy)}`,
      `d=${f.length(Math.sqrt(distanceSq))}`,
    ];
    const equations = [
      String.raw`\Delta x=x_P-x_G`,
      String.raw`\Delta y=y_P-y_G`,
      String.raw`d=\sqrt{(\Delta x)^2+(\Delta y)^2}`,
      String.raw`d^2=(x_P-x_G)^2+(y_P-y_G)^2`,
      String.raw`\begin{aligned}d^2&=(${f.length(dx)})^2\\&+(${f.length(dy)})^2\end{aligned}`,
      `d^2=${f.square(distanceSq)}`,
      `m=${f.mass(body.mass)}`,
      `I_G=${f.inertia(body.massMoI)}`,
    ];
    if (result.available)
      equations.push(
        String.raw`md^2=(${f.mass(body.mass)})(${f.square(distanceSq)})`,
        `md^2=${f.inertia(result.shift)}`,
        String.raw`\begin{aligned}I_P&=${f.inertia(body.massMoI)}\\&+${f.inertia(result.shift)}\end{aligned}`,
        `I_P=${f.inertia(result.inertia)}`
      );
    return {
      key: atGrid ? 'grid' : joint.id,
      point,
      coordinates,
      label: atGrid
        ? 'Grid origin'
        : `Joint ${joint.name || joint.id} (${joint instanceof PrisJoint ? 'prismatic' : joint instanceof RevJoint ? 'revolute' : 'joint'}${joint instanceof RevJoint && joint.ground ? ', grounded' : ''})`,
      result: result.available ? f.inertiaText(result.inertia) : undefined,
      reason: result.available ? undefined : result.reason,
      fixedPin: !atGrid && joint instanceof RevJoint && joint.ground,
      equations,
    };
  }
}
