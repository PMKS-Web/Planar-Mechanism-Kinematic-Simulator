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
    @if (numbered()) {
      <app-solver-math equation="A X = B" />
      <p>
        Each numbered row comes from the matching free-body equation. The headers above A name the
        unknown multiplied by each column. B contains the known terms.
      </p>
      <div
        class="matrixScroll"
        tabindex="0"
        role="region"
        aria-label="Numbered force matrix AX equals B"
      >
        <div class="matrixProduct">
          <table class="coefficientMatrix">
            <caption>
              A · Coefficients
            </caption>
            <thead>
              <tr>
                <th scope="col">Equation</th>
                @for (unknown of system().unknowns; track $index) {
                  <th scope="col">
                    <app-solver-math [equation]="symbol($index)" [inline]="true" />
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of system().A; track $index; let i = $index) {
                <tr [attr.data-matrix-equation]="i + 1">
                  <th scope="row">({{ i + 1 }})</th>
                  @for (value of row; track $index) {
                    <td>{{ n(value) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
          <span class="operator">×</span>
          <table class="unknownVector">
            <caption>
              X · Unknowns
            </caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
              </tr>
            </thead>
            <tbody>
              @for (unknown of system().unknowns; track $index) {
                <tr>
                  <td><app-solver-math [equation]="symbol($index)" [inline]="true" /></td>
                </tr>
              }
            </tbody>
          </table>
          <span class="operator">=</span>
          <table class="knownVector">
            <caption>
              B · Known Terms
            </caption>
            <thead>
              <tr>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              @for (value of system().b; track $index) {
                <tr>
                  <td>{{ n(value) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else {
      <p>
        Rows follow the body or loop equations above. The column vector names each unknown in order.
      </p>
      <app-solver-math [equation]="matrix()"></app-solver-math>
    }
    <h4>Solved Unknowns</h4>
    <div class="solutions">
      @for (unknown of system().unknowns; track $index; let i = $index) {
        <div>
          <app-solver-math [equation]="answer(i)"></app-solver-math><span>{{ unknown.unit }}</span>
        </div>
      }
    </div>
    <p>Maximum |A x − b|: {{ n(residual) }} · evaluated before rounding.</p>
    @if (!numbered()) {
      <details>
        <summary>Equation Row Order</summary>
        <ol>
          @for (row of system().rows; track $index) {
            <li>{{ row }}</li>
          }
        </ol>
      </details>
    }
  </details>`,
  styles: [
    `
      details {
        padding: 12px 0;
        border-top: 1px solid var(--border-rule);
      }
      .matrixScroll {
        max-width: 100%;
        overflow-x: auto;
        border: 1px solid var(--border-rule);
        padding: 12px;
        border-radius: var(--border-radius);
      }
      .matrixProduct {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        width: max-content;
      }
      table {
        border-collapse: collapse;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      caption {
        font-weight: 600;
        color: var(--text-strong);
        padding-bottom: 8px;
        white-space: nowrap;
      }
      td,
      th {
        text-align: center;
        height: 42px;
        padding: 0 10px;
        white-space: nowrap;
      }
      thead th {
        background: var(--surface-subtle);
      }
      tbody th {
        color: var(--brand);
      }
      tbody td {
        border-bottom: 1px solid var(--border-rule);
      }
      tbody td:first-of-type {
        border-left: 2px solid var(--text-secondary);
      }
      tbody td:last-child {
        border-right: 2px solid var(--text-secondary);
      }
      .operator {
        align-self: center;
        color: var(--text-strong);
        font-size: 20px;
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
  readonly numbered = input(false);
  protected n = numberText;
  protected symbol(index: number) {
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
