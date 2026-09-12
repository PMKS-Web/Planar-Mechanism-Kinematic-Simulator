import { Component, computed, input, linkedSignal } from '@angular/core';
import { Diagram, DiagramPoint, SolverDiagramComponent } from './solver-diagram.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { SolverMathComponent } from './solver-math.component';
import { column, texName, vector } from '../../model/mechanism/worksheet-math';
import { MODEL_SCALE } from '../../model/render-scale';

export interface VisualLoopEdge {
  from: DiagramPoint & { id: string };
  to: DiagramPoint & { id: string };
  kind: string;
}

@Component({
  selector: 'app-worksheet-loop-visual',
  imports: [SolverDiagramComponent, SegmentedComponent, ButtonComponent, SolverMathComponent],
  template: `
    <app-solver-diagram [diagram]="diagram()" label="Closed vector loop on the full mechanism" />
    <p class="caption">{{ path() }}</p>
    <segmented-block
      [dropdown]="true"
      label="Trace the Loop"
      [options]="options()"
      [selected]="selected()"
      (selectedChange)="selected.set($event)"
    />
    <button-block [click]="next">Follow Next Vector</button-block>
    <p aria-live="polite">{{ explanation() }}</p>
    <app-solver-math [equation]="equation()" />
    <details>
      <summary>Read the Sketch</summary>
      <p>
        Gray links show the full mechanism. Numbered arrows follow the chosen loop. A dashed arrow
        is the fixed ground return; it closes the vector sum even though ground does not move.
      </p>
    </details>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      p {
        color: var(--text-secondary);
        font-size: 12px;
        margin: 8px 0;
      }
      .caption {
        text-align: center;
      }
      button-block {
        display: block;
        margin-block: var(--card-gap);
      }
      summary {
        color: var(--brand);
        cursor: pointer;
        font-size: 12px;
      }
    `,
  ],
})
export class WorksheetLoopVisualComponent {
  readonly mechanism = input.required<Diagram>();
  readonly edges = input.required<VisualLoopEdge[]>();
  readonly unit = input('cm');
  protected readonly path = computed(() =>
    this.edges()
      .map((e) => e.from.id)
      .concat(this.edges().at(-1)?.to.id ?? [])
      .join(' → ')
  );
  // A new path starts its lesson over; scrubbing the same path retains the chosen step.
  protected readonly selected = linkedSignal({ source: this.path, computation: () => 0 });
  protected readonly options = computed(() => [
    'Whole Loop',
    ...this.edges().map(
      (e, i) => `${i + 1}: ${e.from.id} → ${e.to.id}${e.kind === 'ground' ? ' (Ground)' : ''}`
    ),
  ]);
  protected readonly next = () => this.selected.update((n) => (n + 1) % (this.edges().length + 1));
  protected readonly diagram = computed<Diagram>(() => {
    const base = this.mechanism(),
      at = this.selected();
    const lerp = (a: DiagramPoint, b: DiagramPoint, t: number) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    return {
      context: { lines: base.lines, outlines: base.outlines },
      points: base.points.map((p) => ({
        ...p,
        reference: p.label === (at ? this.edges()[at - 1]?.to.id : this.edges()[0]?.from.id),
      })),
      framingPoints: base.points,
      legend: 'Numbered arrows trace the loop',
      lines: this.edges().flatMap((e, i) => {
        const color =
          at === i + 1 ? 'var(--warning)' : !at || i < at ? 'var(--brand)' : 'var(--text-tertiary)';
        return [
          {
            from: e.from,
            to: e.to,
            color,
            width: at === i + 1 ? 3.5 : 2,
            dashed: e.kind === 'ground',
            label: String(i + 1),
            midpointLabel: true,
          },
          {
            from: lerp(e.from, e.to, 0.4),
            to: lerp(e.from, e.to, 0.62),
            color,
            width: 2.4,
            arrow: true,
          },
        ];
      }),
    };
  });
  protected readonly explanation = computed(() => {
    const at = this.selected(),
      edges = this.edges();
    if (!at) return `Start at ${edges[0]?.from.id}. Follow the numbered arrows back to the start.`;
    const edge = edges[at - 1];
    return (
      `Step ${at}: go from ${edge.from.id} to ${edge.to.id}. ` +
      (at === edges.length
        ? `Back at ${edge.to.id}: the vectors sum to zero.`
        : 'The orange arrow is the vector being added.')
    );
  });
  protected readonly equation = computed(() => {
    const count = this.selected() || this.edges().length;
    const edges = this.edges().slice(0, count);
    const sum = edges.reduce(
      (s, e) => [s[0] + e.to.x - e.from.x, s[1] + e.to.y - e.from.y],
      [0, 0]
    );
    return (
      edges.map((e) => vector('r', `${texName(e.to.id)}/${texName(e.from.id)}`)).join('+') +
      '=' +
      (count === this.edges().length
        ? '\\vec0'
        : column([...sum.map((v) => v / MODEL_SCALE), 0]) + `\\;\\mathrm{${texName(this.unit())}}`)
    );
  });
}
