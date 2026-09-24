import { Component, computed, input } from '@angular/core';
import { Diagram, SolverDiagramComponent } from './solver-diagram.component';

/** A single, consistently framed free-body diagram used throughout one body derivation. */
@Component({
  selector: 'app-force-balance',
  imports: [SolverDiagramComponent],
  template: `
    <figure>
      <app-solver-diagram [diagram]="sketch()" [label]="'Free-body diagram of ' + name()" />
      <figcaption>All loads acting on this isolated body · assumed directions</figcaption>
      @if (diagram().note) {
        <p>{{ diagram().note }}</p>
      }
      <ng-content />
    </figure>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      figure {
        margin: 0;
        min-width: 0;
      }
      p,
      figcaption {
        font-size: 12px;
        color: var(--text-secondary);
        margin: 8px 0;
      }
      figcaption {
        text-align: center;
      }
    `,
  ],
})
export class ForceBalanceComponent {
  readonly diagram = input.required<Diagram>();
  readonly name = input.required<string>();
  /** Highlight the loads contributing to x (0), y (1), or z-moment (2). */
  readonly balanceAxis = input<number | undefined>(undefined);

  protected readonly sketch = computed<Diagram>(() => ({
    ...this.diagram(),
    lines: this.diagram().lines.map((line) =>
      this.balanceAxis() === undefined || !line.balanceAxes
        ? line
        : {
            ...line,
            color: line.balanceAxes.includes(this.balanceAxis()!)
              ? 'var(--warning)'
              : 'var(--text-tertiary)',
          }
    ),
  }));
}
