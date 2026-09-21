import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { separateDiagramLabels } from './diagram-label-layout';

export interface DiagramPoint {
  x: number;
  y: number;
  label?: string;
  color?: string;
  ground?: boolean;
  reference?: boolean;
}
export interface DiagramLine {
  balanceAxes?: number[];
  from: DiagramPoint;
  to: DiagramPoint;
  label?: string;
  /** Optional label anchor for dimensions whose text belongs away from the measured segment. */
  labelPoint?: DiagramPoint;
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
export interface DiagramCouple {
  x: number;
  y: number;
  sign: number;
  label: string;
  color?: string;
}
export interface Diagram {
  axisAngle?: number;
  /** Text beside the positive-moment arc near the coordinate axes. */
  axisMomentLabel?: string;
  context?: Pick<Diagram, 'lines' | 'outlines'>;
  rotations?: { x: number; y: number; sign: number; label: string }[];
  legend?: string;
  /** Fixed geometry keeps arrow sign changes from moving or resizing the body. */
  framingPoints?: DiagramPoint[];
  momentLabel?: string;
  note?: string;
  points: DiagramPoint[];
  lines: DiagramLine[];
  circles?: DiagramCircle[];
  couples?: DiagramCouple[];
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
    <g class="mechanismContext" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5">
      @for (outline of diagram().context?.outlines ?? []; track $index) {
        <polygon [attr.points]="polygon(outline)" />
      }
      @for (line of diagram().context?.lines ?? []; track $index) {
        <line
          [attr.x1]="sx(line.from.x)"
          [attr.y1]="sy(line.from.y)"
          [attr.x2]="sx(line.to.x)"
          [attr.y2]="sy(line.to.y)"
        />
      }
    </g>
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
          data-diagram-label
          [attr.x]="
            sx(
              line.labelPoint?.x ?? (line.midpointLabel ? (line.from.x + line.to.x) / 2 : line.to.x)
            ) + 5
          "
          [attr.y]="
            sy(
              line.labelPoint?.y ?? (line.midpointLabel ? (line.from.y + line.to.y) / 2 : line.to.y)
            ) - 6
          "
          [attr.fill]="line.color ?? 'var(--canvas-ink)'"
        >
          {{ line.label.split('_')[0] }}
          @if (line.label.includes('_')) {
            <tspan baseline-shift="sub" font-size="9">
              {{ line.label.split('_').slice(1).join('_') }}
            </tspan>
          }
        </text>
      }
    }
    @for (couple of diagram().couples ?? []; track couple.label) {
      <path
        [attr.d]="coupleArc(couple)"
        fill="none"
        [attr.stroke]="couple.color ?? 'var(--warning)'"
        stroke-width="2"
        [attr.marker-end]="'url(#' + markerId + ')'"
      />
      <text
        data-diagram-label
        [attr.x]="sx(couple.x) - 22"
        [attr.y]="sy(couple.y) - 24"
        [attr.fill]="couple.color ?? 'var(--warning)'"
      >
        {{ couple.label.split('_')[0] }}
        @if (couple.label.includes('_')) {
          <tspan baseline-shift="sub" font-size="9">
            {{ couple.label.split('_').slice(1).join('_') }}
          </tspan>
        }
      </text>
    }
    @for (rotation of diagram().rotations ?? []; track rotation.label) {
      <g
        class="angularReference"
        [attr.data-link]="rotation.label"
        [attr.data-direction]="rotation.sign === 1 ? 'CCW' : 'CW'"
      >
        <path
          [attr.d]="rotationArc(rotation)"
          fill="none"
          stroke="var(--warning)"
          stroke-width="2.4"
          [attr.marker-end]="'url(#' + markerId + ')'"
        />
        <text
          data-diagram-label
          [attr.x]="sx(rotation.x)"
          [attr.y]="sy(rotation.y) + 35"
          text-anchor="middle"
          fill="var(--warning)"
        >
          {{ rotation.label }}: +ω, +α {{ rotation.sign === 1 ? '↺' : '↻' }}
        </text>
      </g>
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
          data-diagram-label
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
      [attr.d]="axisPath(0)"
      stroke="var(--text-secondary)"
      stroke-width="1.5"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    <path
      class="axisY"
      [attr.d]="axisPath(90)"
      stroke="var(--text-secondary)"
      stroke-width="1.5"
      fill="none"
      [attr.marker-end]="'url(#' + markerId + ')'"
    />
    @if (diagram().legend) {
      <text x="78" y="237">{{ diagram().legend }}</text>
    } @else {
      <path
        class="positiveMoment"
        d="M88 226 A30 30 0 0 0 58 183"
        stroke="var(--text-secondary)"
        stroke-width="1.5"
        fill="none"
        [attr.marker-end]="'url(#' + markerId + ')'"
      />
      <text x="94" y="186" text-anchor="middle">
        {{ diagram().axisMomentLabel ?? 'M' }}
      </text>
    }
    <text
      class="axisLabel"
      [attr.x]="axisEnd(0, 32).x"
      [attr.y]="axisEnd(0, 32).y + 4"
      text-anchor="middle"
    >
      x
    </text>
    <text
      class="axisLabel"
      [attr.x]="axisEnd(90, 32).x"
      [attr.y]="axisEnd(90, 32).y + 4"
      text-anchor="middle"
    >
      y
    </text>
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
  private readonly host = inject(ElementRef<HTMLElement>);
  constructor() {
    afterEveryRender({
      mixedReadWrite: () => {
        const svg = this.host.nativeElement.querySelector('svg');
        if (svg) separateDiagramLabels(svg);
      },
    });
  }
  protected axisEnd(offset: number, length = 22) {
    const a = (((this.diagram().axisAngle ?? 0) + offset) * Math.PI) / 180;
    return { x: 40 + length * Math.cos(a), y: 210 - length * Math.sin(a) };
  }
  protected axisPath(offset: number) {
    const p = this.axisEnd(offset);
    return `M40 210 L${p.x} ${p.y}`;
  }
  readonly diagram = input.required<Diagram>();
  readonly label = input('Solver diagram');
  readonly markerId = `solver-arrow-${nextDiagram++}`;
  protected polygon(points: DiagramPoint[]) {
    return points.map((p) => `${this.sx(p.x)},${this.sy(p.y)}`).join(' ');
  }
  protected rotationArc(rotation: { x: number; y: number; sign: number }) {
    const x = this.sx(rotation.x),
      y = this.sy(rotation.y),
      s = rotation.sign;
    // SVG y runs downward: sweep 0 is the positive mathematical (CCW) sense.
    return `M${x + 22} ${y} A22 22 0 1 ${s === 1 ? 0 : 1} ${x} ${y + s * 22}`;
  }
  protected coupleArc(couple: DiagramCouple) {
    const x = this.sx(couple.x),
      y = this.sy(couple.y),
      s = couple.sign;
    return `M${x + 18} ${y} A18 18 0 1 ${s === 1 ? 0 : 1} ${x} ${y + s * 18}`;
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
