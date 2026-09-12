import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import {
  SolverExplanationService,
  equationText,
  numberText,
} from '../../services/solver-explanation.service';
import { Mechanism } from '../../model/mechanism/mechanism';
import { BodyExplanation, PositionStepExplanation } from '../../model/mechanism/solver-explanation';
import { MODEL_SCALE } from '../../model/render-scale';
import { Diagram, SolverDiagramComponent } from './solver-diagram.component';
import { SolverMatrixComponent } from './solver-matrix.component';

const INK = { reaction: '#da7930', applied: '#7250a2', weight: '#218579', drive: '#c33f63' };

@Component({
  selector: 'app-solver-explanation',
  templateUrl: './solver-explanation.component.html',
  styleUrls: ['./solver-explanation.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    DecimalPipe,
    FormsModule,
    SegmentedComponent,
    SolverDiagramComponent,
    SolverMatrixComponent,
  ],
})
export class SolverExplanationComponent {
  readonly force = input(false);
  readonly mechanism = inject(MechanismService);
  readonly settings = inject(SettingsService);
  private explain = inject(SolverExplanationService);
  readonly forceOptions = ['Static', 'In-motion'];
  readonly kinematicOptions = ['Vector loops', 'Position steps'];
  readonly axes = ['ΣFx', 'ΣFy', 'ΣMz about G'];
  section = 0;
  chosenMachine = '';
  n = numberText;
  readonly scale = MODEL_SCALE;
  private cache?: {
    mechanism: Mechanism;
    key: string;
    value: ReturnType<SolverExplanationComponent['build']>;
  };

  get index() {
    const index = this.mechanism.partitions.findIndex((p) => p.id === this.chosenMachine);
    return index < 0 ? 0 : index;
  }
  get machineId() {
    return this.mechanism.partitions[this.index]?.id ?? '';
  }
  get solved() {
    return this.mechanism.mechanisms[this.index];
  }
  get step() {
    return this.mechanism.currentSampleOf(this.index);
  }
  get lastStep() {
    return Math.max(0, (this.solved?.joints.length ?? 1) - 1);
  }
  get valid() {
    return this.solved?.isMechanismValid() ?? false;
  }
  get seconds() {
    return this.solved?.timeNum[this.step] ?? 0;
  }
  get positionSteps() {
    return this.solved?.positionExplanation ?? [];
  }

  get view() {
    if (!this.valid) return undefined;
    const key = `${this.mechanism.poseRevision}|${this.step}|${this.force()}|${this.settings.forceAnalysisMode.value}`;
    if (this.cache?.mechanism !== this.solved || this.cache.key !== key) {
      this.cache = { mechanism: this.solved, key, value: this.build(this.solved, this.step) };
    }
    return this.cache.value;
  }

  private build(mechanism: Mechanism, step: number) {
    const force = this.force()
      ? this.explain.forceAt(mechanism, step, this.settings.forceAnalysisMode.value)
      : undefined;
    const kinematics = !this.force() ? this.explain.kinematicsAt(mechanism, step) : undefined;
    const circles = this.explain.circlesAt(mechanism, step).map((circle) => ({
      ...circle,
      diagram: {
        points: [
          { x: circle.a.x, y: circle.a.y, label: circle.a.id },
          { x: circle.b.x, y: circle.b.y, label: circle.b.id },
          ...circle.candidates.map(([x, y], i) => ({
            x,
            y,
            label:
              Math.hypot(x - circle.point.x, y - circle.point.y) < 0.001
                ? `P${i + 1} / ${circle.point.id}`
                : `P${i + 1}`,
            color:
              Math.hypot(x - circle.point.x, y - circle.point.y) < 0.001 ? '#313aa7' : '#8e92a3',
          })),
        ],
        lines: [
          { from: circle.a, to: circle.point, color: '#5e6bc0', dashed: true, arrow: true },
          { from: circle.b, to: circle.point, color: '#218579', dashed: true, arrow: true },
        ],
        circles: [
          { x: circle.a.x, y: circle.a.y, r: circle.r0, color: '#5e6bc0' },
          { x: circle.b.x, y: circle.b.y, r: circle.r1, color: '#218579' },
        ],
      } as Diagram,
    }));
    const loops = mechanism.requiredLoops.map((loop, index) => {
      const joints = mechanism.joints[step];
      const lines = loop.edges.flatMap((edge, i) => {
        const from = joints.find((j) => j.id === edge.fromId);
        const to = joints.find((j) => j.id === edge.toId);
        return from && to
          ? [
              {
                from,
                to,
                arrow: true,
                color: '#5d68b5',
                label: `r${i + 1}`,
                dashed: edge.kind === 'slot',
              },
            ]
          : [];
      });
      const first = lines[0]?.from;
      const last = lines.at(-1)?.to;
      const closure =
        first && last
          ? { from: last, to: first, arrow: true, color: '#9297a6', dashed: true, label: 'rG' }
          : undefined;
      const all = closure ? [...lines, closure] : lines;
      return {
        index,
        id: loop.id,
        hasSlot: loop.edges.some((edge) => edge.kind === 'slot'),
        diagram: {
          points: [
            ...new Map(
              all
                .flatMap((line) => [line.from, line.to])
                .map((joint) => [joint.id, { x: joint.x, y: joint.y, label: joint.id }])
            ).values(),
          ],
          lines: all,
        } as Diagram,
        x: all.map((line) => (line.to.x - line.from.x) / MODEL_SCALE),
        y: all.map((line) => (line.to.y - line.from.y) / MODEL_SCALE),
      };
    });
    return {
      force,
      kinematics,
      circles,
      loops,
      bodies:
        force?.frame.explanation?.bodies.map((body) => ({
          ...body,
          diagram: this.bodyDiagram(body),
        })) ?? [],
    };
  }

  private bodyDiagram(body: BodyExplanation): Diagram {
    const center = { x: body.center[0], y: body.center[1], label: 'G' };
    const span =
      Math.max(
        1,
        ...body.points.map((point) => Math.hypot(point.x - center.x, point.y - center.y))
      ) * 0.55;
    const lines: Diagram['lines'] = body.points.map((point) => ({ from: center, to: point }));
    for (const load of body.loads) {
      const magnitude = Math.hypot(...load.vector);
      const from = { x: load.point[0], y: load.point[1] };
      if (load.couple !== undefined) {
        if (Math.abs(load.couple) < 1e-10) continue;
        // A short curved-arrow approximation made of directed segments around the application point.
        const sign = load.couple < 0 ? -1 : 1;
        for (let i = 0; i < 10; i++) {
          const at = (j: number) => ({
            x: from.x + span * 0.38 * Math.cos((sign * j * Math.PI) / 7),
            y: from.y + span * 0.38 * Math.sin((sign * j * Math.PI) / 7),
          });
          lines.push({
            from: at(i),
            to: at(i + 1),
            arrow: i === 9,
            width: 2,
            color: INK[load.kind],
            ...(i === 9 ? { label: load.label } : {}),
          });
        }
      } else if (magnitude > 1e-10) {
        lines.push({
          from,
          to: {
            x: from.x + (span * load.vector[0]) / magnitude,
            y: from.y + (span * load.vector[1]) / magnitude,
          },
          arrow: true,
          color: INK[load.kind],
          label: load.label,
        });
      }
    }
    return { points: [...body.points.map((p) => ({ ...p, label: p.id })), center], lines };
  }

  forceEquation(body: BodyExplanation, axis: number): string {
    const system = this.view?.force?.system;
    if (!system) return '';
    const row = body.startRow + axis;
    const lhs = equationText(
      system.A[row],
      system.unknowns.map((unknown) => unknown.label.split(' (')[0])
    );
    const divisor = axis === 2 ? MODEL_SCALE : 1;
    return `${lhs} + (${this.n(body.known[axis] / divisor)}) = ${this.n(body.inertia[axis] / divisor)}`;
  }

  kinematicEquation(index: number, axis: number, acceleration = false): string {
    const system = acceleration
      ? this.view?.kinematics?.acceleration
      : this.view?.kinematics?.velocity;
    const row = index * 2 + axis;
    if (!system?.A[row]) return 'This route did not assemble a loop equation.';
    return `${equationText(
      system.A[row],
      system.unknowns.map((unknown) => unknown.label)
    )} = ${this.n(system.b[row])}`;
  }

  positionMethod(step: PositionStepExplanation): string {
    if (step.method === 'twoCircleIntersectionPoints') return 'Two-circle intersection';
    if (step.method === 'circleLineIntersectionPoints') return 'Circle and guide-line intersection';
    if (step.method === 'determineTracerJoint') return 'Carried by a rigid body';
    if (/simultaneous|coupled/i.test(step.method)) return 'Simultaneous constraints';
    if (/input|increment|prescribed/i.test(step.method)) return 'Prescribed input motion';
    return 'Rigid-body / guide construction';
  }

  seek(value: string | number): void {
    if (!this.valid || !Number.isFinite(Number(value))) return;
    const time =
      this.solved.timeNum[Math.max(0, Math.min(this.lastStep, Math.round(Number(value))))];
    if (time === undefined) return;
    this.mechanism.seekMechanism(
      this.index,
      this.solved.framesRunBackwards && time !== 0 ? this.solved.cyclePeriod - time : time
    );
  }
}
