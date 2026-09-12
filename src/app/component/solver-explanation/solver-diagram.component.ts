import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface DiagramPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  ground?: boolean;
  reference?: boolean;
}
export interface DiagramLine {
  from: DiagramPoint;
  to: DiagramPoint;
  label?: string;
  color?: string;
  dashed?: boolean;
  arrow?: boolean;
  width?: number;
  midpointLabel?: boolean;
}
export interface DiagramCircle {
  x: number;
  y: number;
  r: number;
  color: string;
}
export interface Diagram {
  /** Fixed geometry keeps arrow sign changes from moving or resizing the body. */
  framingPoints?: DiagramPoint[];
  momentLabel?: string;
  note?: string;
  points: DiagramPoint[];
  lines: DiagramLine[];
  circles?: DiagramCircle[];
  outlines?: DiagramPoint[][];
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
    @for (outline of diagram().outlines ?? []; track $index) {
      <polygon
        [attr.points]="polygon(outline)"
        fill="var(--surface)"
        stroke="var(--canvas-ink)"
        stroke-width="2"
        stroke-linejoin="round"
      />
    }
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
        [attr.stroke]="line.color ?? 'var(--canvas-ink)'"
        [attr.stroke-width]="line.width ?? (line.arrow ? 2 : 6)"
        stroke-linecap="round"
        [attr.stroke-dasharray]="line.dashed ? '5 4' : null"
        [attr.marker-end]="line.arrow ? 'url(#' + markerId + ')' : null"
      />
      @if (line.label) {
        <text
          [attr.x]="sx(line.midpointLabel ? (line.from.x + line.to.x) / 2 : line.to.x) + 5"
          [attr.y]="sy(line.midpointLabel ? (line.from.y + line.to.y) / 2 : line.to.y) - 6"
          [attr.fill]="line.color ?? 'var(--canvas-ink)'"
        >
          {{ line.label }}
        </text>
      }
    }
    @for (point of diagram().points; track $index) {
      @if (point.reference) {
        <circle
          [attr.cx]="sx(point.x)"
          [attr.cy]="sy(point.y)"
          r="9"
          fill="none"
          stroke="var(--brand)"
          stroke-width="2"
        />
      }
      @if (point.ground) {
        <path [attr.d]="ground(point)" fill="none" stroke="var(--canvas-ink)" stroke-width="1" />
      }
      <circle
        [attr.cx]="sx(point.x)"
        [attr.cy]="sy(point.y)"
        r="4"
        fill="var(--surface)"
        [attr.stroke]="point.color ?? 'var(--canvas-ink)'"
        stroke-width="1.5"
      />
      @if (point.label) {
        <text
          [attr.x]="sx(point.x) + 7"
          [attr.y]="sy(point.y) + 15"
          [attr.fill]="point.color ?? 'var(--canvas-ink)'"
        >
          {{ point.label }}
        </text>
      }
    }
    @if (diagram().momentLabel) {
      <text x="8" y="18" fill="var(--brand)">Moments about {{ diagram().momentLabel }}</text>
    }
    <path
      class="axisX"
      d="M18 232 h28"
      stroke="var(--text-secondary)"
      stroke-width="1.5"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    <path
      class="axisY"
      d="M18 232 v-26"
      stroke="var(--text-secondary)"
      stroke-width="1.5"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    <path
      class="positiveMoment"
      d="M104 232 A14 14 0 1 0 83 244"
      stroke="var(--text-secondary)"
      stroke-width="1.5"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    <text x="113" y="237">+Mz (CCW)</text>
    <text x="50" y="236">x</text>
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
        background: var(--surface);
        border-radius: var(--border-radius);
      }
      text {
        font:
          italic 12px Georgia,
          serif;
        paint-order: stroke;
        stroke: var(--surface);
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
  protected polygon(points: DiagramPoint[]) {
    return points.map((p) => `${this.sx(p.x)},${this.sy(p.y)}`).join(' ');
  }
  protected ground(p: DiagramPoint) {
    const x = this.sx(p.x),
      y = this.sy(p.y);
    return `M${x - 10} ${y + 12}L${x} ${y}L${x + 10} ${y + 12}Z M${x - 15} ${y + 13}h30 m-25 0l-4 5 m10-5l-4 5 m10-5l-4 5 m10-5l-4 5`;
  }
  get bounds() {
    const all = this.diagram().framingPoints ?? [
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
