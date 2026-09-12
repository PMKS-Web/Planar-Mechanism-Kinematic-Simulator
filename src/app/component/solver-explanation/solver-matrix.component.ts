import { Component, computed, input } from '@angular/core';
import { LinearSystemExplanation } from '../../model/mechanism/solver-explanation';
import { numberText } from '../../services/solver-explanation.service';
import { column, texNumber } from '../../model/mechanism/worksheet-math';
import { SolverMathComponent } from './solver-math.component';

@Component({
  selector: 'app-solver-matrix',
  imports: [SolverMathComponent],
  template: `<details [open]="expanded()">
    <summary>{{ title() }}</summary>
    <p>
      Rows follow the body or loop equations above. The column vector names each unknown in order.
    </p>
    <app-solver-math [equation]="matrix()"></app-solver-math>
    <h4>Solved Unknowns</h4>
    <div class="solutions">
      @for (unknown of system().unknowns; track $index; let i = $index) {
        <div>
          <app-solver-math [equation]="answer(i)"></app-solver-math><span>{{ unknown.unit }}</span>
        </div>
      }
    </div>
    <p>Maximum |A x − b|: {{ n(residual) }} · evaluated before rounding.</p>
    <details>
      <summary>Equation Row Order</summary>
      <ol>
        @for (row of system().rows; track $index) {
          <li>{{ row }}</li>
        }
      </ol>
    </details>
  </details>`,
  styles: [
    `
      details {
        padding: 12px 0;
        border-top: 1px solid var(--border-rule);
      }
      summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: var(--brand);
      }
      p,
      li {
        font-size: 12px;
        color: var(--text-secondary);
        line-height: 1.6;
      }
      h4 {
        font-size: 14px;
        margin-bottom: 8px;
      }
      .solutions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .solutions > div {
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid var(--border-rule);
      }
      span {
        font-size: 12px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class SolverMatrixComponent {
  readonly system = input.required<LinearSystemExplanation>();
  readonly title = input('Assembled System');
  readonly expanded = input(false);
  protected n = numberText;
  private symbol(index: number) {
    return this.system()
      .unknowns[index].label.split(' (')[0]
      .replace('ω', '\\omega')
      .replace('α', '\\alpha')
      .replace(/_([^\{].*)$/, '_{$1}');
  }
  protected readonly matrix = computed(() => {
    const s = this.system();
    return `\\underbrace{\\begin{bmatrix}${s.A.map((r) => r.map(texNumber).join('&')).join('\\\\')}\\end{bmatrix}}_{A}\\underbrace{${column(s.x.map((_, i) => this.symbol(i)))}}_{x}=\\underbrace{${column(s.b)}}_{b}`;
  });
  protected answer(index: number) {
    return `${this.symbol(index)}=${texNumber(this.system().x[index])}`;
  }
  protected get residual() {
    const s = this.system();
    return Math.max(
      0,
      ...s.A.map((row, i) => Math.abs(row.reduce((sum, a, j) => sum + a * s.x[j], 0) - s.b[i]))
    );
  }
}
