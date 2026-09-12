import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface DiagramPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
}
export interface DiagramLine {
  from: DiagramPoint;
  to: DiagramPoint;
  label?: string;
  color?: string;
  dashed?: boolean;
  arrow?: boolean;
  width?: number;
}
export interface DiagramCircle {
  x: number;
  y: number;
  r: number;
  color: string;
}
export interface Diagram {
  points: DiagramPoint[];
  lines: DiagramLine[];
  circles?: DiagramCircle[];
}

let nextDiagram = 0;
@Component({
  selector: 'app-solver-diagram',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<svg viewBox="0 0 360 250" role="img" [attr.aria-label]="label()">
    <defs>
      <marker
        [id]="markerId"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M0 0 L10 5 L0 10 Z" fill="context-stroke" />
      </marker>
    </defs>
    @for (circle of diagram().circles ?? []; track $index) {
      <circle
        [attr.cx]="sx(circle.x)"
        [attr.cy]="sy(circle.y)"
        [attr.r]="circle.r * scale"
        fill="none"
        [attr.stroke]="circle.color"
        stroke-width="1.5"
        stroke-dasharray="5 3"
      />
    }
    @for (line of diagram().lines; track $index) {
      <line
        [attr.x1]="sx(line.from.x)"
        [attr.y1]="sy(line.from.y)"
        [attr.x2]="sx(line.to.x)"
        [attr.y2]="sy(line.to.y)"
        [attr.stroke]="line.color ?? '#a9b0c7'"
        [attr.stroke-width]="line.width ?? (line.arrow ? 2 : 6)"
        stroke-linecap="round"
        [attr.stroke-dasharray]="line.dashed ? '5 4' : null"
        [attr.marker-end]="line.arrow ? 'url(#' + markerId + ')' : null"
      />
      @if (line.label) {
        <text
          [attr.x]="sx(line.to.x) + 5"
          [attr.y]="sy(line.to.y) - 6"
          [attr.fill]="line.color ?? '#4f5670'"
        >
          {{ line.label }}
        </text>
      }
    }
    @for (point of diagram().points; track $index) {
      <circle
        [attr.cx]="sx(point.x)"
        [attr.cy]="sy(point.y)"
        r="4"
        fill="white"
        [attr.stroke]="point.color ?? '#424b72'"
        stroke-width="1.5"
      />
      @if (point.label) {
        <text
          [attr.x]="sx(point.x) + 7"
          [attr.y]="sy(point.y) + 15"
          [attr.fill]="point.color ?? '#424b72'"
        >
          {{ point.label }}
        </text>
      }
    }
    <path
      d="M18 232 h24 M18 232 v-24"
      stroke="#747b90"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    <text x="46" y="236">x</text>
    <text x="14" y="202">y</text>
  </svg>`,
  styles: [
    `
      :host {
        display: block;
      }
      svg {
        width: 100%;
        display: block;
        background: #f7f8fc;
        border-radius: 8px;
      }
      text {
        font: 11px system-ui;
        paint-order: stroke;
        stroke: #f7f8fc;
        stroke-width: 3px;
        stroke-linejoin: round;
      }
    `,
  ],
})
export class SolverDiagramComponent {
  readonly diagram = input.required<Diagram>();
  readonly label = input('Solver diagram');
  readonly markerId = `solver-arrow-${nextDiagram++}`;
  get bounds() {
    const all = [
      ...this.diagram().points,
      ...this.diagram().lines.flatMap((line) => [line.from, line.to]),
      ...(this.diagram().circles ?? []).flatMap((circle) => [
        { x: circle.x - circle.r, y: circle.y - circle.r },
        { x: circle.x + circle.r, y: circle.y + circle.r },
      ]),
    ];
    return {
      minX: Math.min(...all.map((p) => p.x)),
      maxX: Math.max(...all.map((p) => p.x)),
      minY: Math.min(...all.map((p) => p.y)),
      maxY: Math.max(...all.map((p) => p.y)),
    };
  }
  get scale() {
    const b = this.bounds;
    return Math.min(280 / Math.max(1e-6, b.maxX - b.minX), 175 / Math.max(1e-6, b.maxY - b.minY));
  }
  sx(x: number) {
    const b = this.bounds;
    return 175 + (x - (b.minX + b.maxX) / 2) * this.scale;
  }
  sy(y: number) {
    const b = this.bounds;
    return 118 - (y - (b.minY + b.maxY) / 2) * this.scale;
  }
}
