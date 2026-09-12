import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LinearSystemExplanation } from '../../model/mechanism/solver-explanation';
import { numberText } from '../../services/solver-explanation.service';

@Component({
  selector: 'app-solver-matrix',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<details>
    <summary>{{ title() }} · A x = b</summary>
    <p>
      Each row is one equation. Columns follow the unknowns listed below. Values are rounded here
      for reading.
    </p>
    <div class="matrixScroll" tabindex="0" aria-label="Solver matrix">
      <table>
        <thead>
          <tr>
            <th>Equation</th>
            @for (unknown of system().unknowns; track $index) {
              <th>{{ symbol($index) }}</th>
            }
            <th>b</th>
          </tr>
        </thead>
        <tbody>
          @for (row of system().A; track $index; let i = $index) {
            <tr>
              <th>{{ system().rows[i] }}</th>
              @for (value of row; track $index) {
                <td>{{ n(value) }}</td>
              }
              <td class="rhs">{{ n(system().b[i]) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <h4>Solved unknowns · x</h4>
    @for (unknown of system().unknowns; track $index; let i = $index) {
      <div class="answer">
        <span>{{ unknown.label }}</span
        ><strong
          >{{ n(system().x[i]) }} <small>{{ unknown.unit }}</small></strong
        >
      </div>
    }
    <p>Maximum |A x − b|: {{ n(residual) }}</p>
  </details>`,
  styles: [
    `
      details {
        margin-top: 12px;
        border-top: 1px solid #e1e4ee;
        padding-top: 12px;
      }
      summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: #343e87;
      }
      p {
        font-size: 11px;
        color: #687083;
        line-height: 1.5;
      }
      .matrixScroll {
        overflow: auto;
        max-height: 360px;
      }
      table {
        border-collapse: collapse;
        font:
          11px ui-monospace,
          monospace;
        width: max-content;
        min-width: 100%;
      }
      td,
      th {
        padding: 7px;
        border: 1px solid #dfe3ee;
        white-space: nowrap;
        text-align: right;
      }
      th {
        background: #f0f2f8;
        font-weight: 500;
      }
      .rhs {
        background: #eef5f4;
      }
      h4 {
        margin: 14px 0 8px;
        font-size: 12px;
      }
      .answer {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
        padding: 6px 0;
        border-bottom: 1px solid #eef0f5;
      }
      small {
        font-weight: 400;
      }
    `,
  ],
})
export class SolverMatrixComponent {
  readonly system = input.required<LinearSystemExplanation>();
  readonly title = input('Assembled system');
  n = numberText;
  symbol(index: number) {
    return this.system().unknowns[index].label.split(' (')[0];
  }
  get residual() {
    const s = this.system();
    return Math.max(
      0,
      ...s.A.map((row, i) => Math.abs(row.reduce((sum, a, j) => sum + a * s.x[j], 0) - s.b[i]))
    );
  }
}
