import { Component, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { SolverExplanationService, numberText } from '../../services/solver-explanation.service';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MODEL_SCALE } from '../../model/render-scale';
import { RealJoint, PrisJoint } from '../../model/joint';
import { forceWorksheet } from '../../model/mechanism/force-worksheet';
import { kinematicWorksheet } from '../../model/mechanism/kinematic-worksheet';
import { column, texName, texNumber, vector } from '../../model/mechanism/worksheet-math';
import { constructionDiagram, freeBodyDiagram, mechanismDiagram } from './worksheet-diagrams';
import { Diagram, SolverDiagramComponent } from './solver-diagram.component';
import { SolverMatrixComponent } from './solver-matrix.component';
import { SolverMathComponent } from './solver-math.component';
import { WorksheetPreferencesService } from '../../services/worksheet-preferences.service';
import { worksheetLoopOptions } from '../../model/mechanism/worksheet-loop-options';
import { WorksheetChoicesComponent } from './worksheet-choices.component';
import { WorksheetLoopEditorComponent } from './worksheet-loop-editor.component';

@Component({
  selector: 'app-solver-explanation',
  templateUrl: './solver-explanation.component.html',
  styleUrls: ['./solver-explanation.component.scss'],
  imports: [
    DecimalPipe,
    FormsModule,
    SegmentedComponent,
    ButtonComponent,
    SolverDiagramComponent,
    SolverMatrixComponent,
    SolverMathComponent,
    WorksheetChoicesComponent,
    WorksheetLoopEditorComponent,
  ],
})
export class SolverExplanationComponent {
  readonly force = input(false);
  protected readonly mechanism = inject(MechanismService);
  protected readonly settings = inject(SettingsService);
  private readonly explain = inject(SolverExplanationService);
  protected readonly preferences = inject(WorksheetPreferencesService);
  private readonly dialogs = inject(MatDialog);
  private readonly dialog = inject(MatDialogRef<SolverExplanationComponent>, { optional: true });
  private readonly dialogData = inject<{ force: boolean; section: number; machine: string }>(
    MAT_DIALOG_DATA,
    { optional: true }
  );
  protected readonly wide = !!this.dialogData;
  protected readonly section = signal(this.dialogData?.section ?? 0);
  protected readonly chosenMachine = signal(this.dialogData?.machine ?? '');
  protected readonly assumed = signal(true);
  protected readonly forceOptions = ['Static', 'In-motion'];
  protected readonly forceSections = ['Definitions', 'Free Bodies', 'System'];
  protected readonly kinematicSections = ['Position', 'Velocity', 'Acceleration'];
  protected readonly arrowOptions = ['Assumed Directions', 'Solved Directions'];
  protected n = numberText;
  protected readonly scale = MODEL_SCALE;
  protected readonly vectorDefinitions = String.raw`\vec F=\begin{bmatrix}F_x\\F_y\\0\end{bmatrix},\quad\vec M=\begin{bmatrix}0\\0\\M_z\end{bmatrix}`;
  protected readonly motionDefinitions = String.raw`\vec\omega=\begin{bmatrix}0\\0\\\omega\end{bmatrix},\quad\vec\alpha=\begin{bmatrix}0\\0\\\alpha\end{bmatrix}`;
  protected readonly crossProduct = String.raw`(\vec r\times\vec F)_z=r_x F_y-r_y F_x`;
  protected readonly slidingLaw = String.raw`\vec v=\vec\omega\times\vec r+\dot s\,\hat u`;
  protected readonly slidingAcceleration = String.raw`\vec a=\vec\alpha\times\vec r-\omega^2\vec r+2\vec\omega\times(\dot s\,\hat u)+\ddot s\,\hat u`;
  protected readonly constraintLaw = String.raw`F(q,t)=0,\quad J\dot q=-F_t,\quad J\ddot q=-\dot J\dot q-\dot F_t`;
  private cache?: {
    mechanism: Mechanism;
    key: string;
    value: ReturnType<SolverExplanationComponent['build']>;
  };
  protected isForce() {
    return this.dialogData?.force ?? this.force();
  }
  protected get index() {
    const i = this.mechanism.partitions.findIndex((p) => p.id === this.chosenMachine());
    return i < 0 ? 0 : i;
  }
  protected get machineId() {
    return this.mechanism.partitions[this.index]?.id ?? '';
  }
  protected get solved() {
    return this.mechanism.mechanisms[this.index];
  }
  protected get step() {
    return this.mechanism.currentSampleOf(this.index);
  }
  protected get lastStep() {
    return Math.max(0, (this.solved?.joints.length ?? 1) - 1);
  }
  protected get valid() {
    return this.solved?.isMechanismValid() ?? false;
  }
  protected get seconds() {
    return this.solved?.timeNum[this.step] ?? 0;
  }
  protected get view() {
    if (!this.valid) return undefined;
    const key = `${this.mechanism.poseRevision}|${this.step}|${this.isForce()}|${this.settings.forceAnalysisMode.value}|${this.assumed()}|${this.preferences.revision()}`;
    if (this.cache?.mechanism !== this.solved || this.cache.key !== key)
      this.cache = { mechanism: this.solved, key, value: this.build(this.solved, this.step) };
    return this.cache.value;
  }
  private build(mechanism: Mechanism, step: number) {
    const preferences = this.preferences.get(mechanism);
    const joints = mechanism.joints[step];
    const force = this.isForce()
      ? this.explain.forceAt(mechanism, step, this.settings.forceAnalysisMode.value)
      : undefined;
    const forceWork =
      force?.frame.explanation && force.system
        ? forceWorksheet(
            force.frame.explanation,
            force.system,
            this.settings.forceAnalysisMode.value === 'dynamic',
            preferences.forces,
            preferences.momentPoints,
            mechanism.unit
          )
        : undefined;
    const rates = !this.isForce() ? this.explain.kinematicsAt(mechanism, step) : undefined;
    const kine = rates
      ? kinematicWorksheet(
          mechanism,
          step,
          rates,
          preferences.loops,
          preferences.angular,
          preferences.angularByBody
        )
      : undefined;
    const circles = this.explain.circlesAt(mechanism, step);
    const circleLines = this.explain.circleLinesAt(mechanism, step);
    const positions = mechanism.positionExplanation.map((one) => {
      const point = joints.find((j) => j.id === one.jointId)!;
      const initial = mechanism.joints[0].find((j) => j.id === one.jointId)!;
      const refs = one.knownIds.flatMap((id) => {
        const j = joints.find((p) => p.id === id);
        return j ? [j] : [];
      });
      const radii = refs.map((p, i) => {
        const ref = mechanism.joints[0].find((j) => j.id === p.id)!;
        return Number.isFinite(one.radii[i])
          ? one.radii[i]
          : Math.hypot(initial.x - ref.x, initial.y - ref.y);
      });
      const circle = circles.find((c) => c.jointId === point.id);
      const line = circleLines.find((c) => c.jointId === point.id);
      const circleMethod = one.method === 'twoCircleIntersectionPoints';
      const rigid = one.method === 'determineTracerJoint';
      const prescribed = one.method === 'incrementRevInput';
      const guide = one.method === 'circleLineIntersectionPoints';
      const method = circleMethod
        ? 'Two-circle intersection'
        : guide
          ? 'Circle–line intersection'
          : rigid
            ? 'Rigid-body point'
            : prescribed
              ? 'Prescribed crank motion'
              : /simultaneous/i.test(one.method)
                ? 'Simultaneous constraints'
                : 'Guide / rigid-body construction';
      const equations = refs.slice(0, guide || prescribed ? 1 : 2).map((p, i) => ({
        symbolic: `(x_{${texName(point.id)}}-x_{${texName(p.id)}})^2+(y_{${texName(point.id)}}-y_{${texName(p.id)}})^2=r_{${texName(point.id + p.id)}}^2`,
        numbers: `(x-(${texNumber(p.x / MODEL_SCALE)}))^2+(y-(${texNumber(p.y / MODEL_SCALE)}))^2=${texNumber(radii[i] / MODEL_SCALE)}^2`,
      }));
      const diagram = constructionDiagram(
        point,
        refs.slice(0, guide || prescribed ? 1 : 2),
        radii,
        circle?.candidates ?? line?.candidates
      );
      const extra: string[] = [];
      if (prescribed && refs[0]) {
        const r = radii[0] / MODEL_SCALE,
          theta = Math.atan2(point.y - refs[0].y, point.x - refs[0].x);
        extra.push(
          `\\begin{aligned}x_{${point.id}}&=x_{${refs[0].id}}+r_{${point.id + refs[0].id}}\\cos\\theta\\\\y_{${point.id}}&=y_{${refs[0].id}}+r_{${point.id + refs[0].id}}\\sin\\theta\\end{aligned}`,
          `r=${texNumber(r)},\\quad\\theta=${texNumber((theta * 180) / Math.PI)}^\\circ`
        );
      }
      if (line) {
        const range = line.radius * 1.5;
        diagram.lines.push({
          from: { x: line.origin.x - range * line.u[0], y: line.origin.y - range * line.u[1] },
          to: { x: line.origin.x + range * line.u[0], y: line.origin.y + range * line.u[1] },
          width: 2,
          color: 'var(--canvas-ink)',
          label: 'guide',
        });
        extra.push(
          `${column(['x', 'y'])}=${column([line.origin.x / MODEL_SCALE, line.origin.y / MODEL_SCALE])}+s${column(line.u)}`,
          `${texNumber(-line.u[1])}(x-(${texNumber(line.origin.x / MODEL_SCALE)}))+${texNumber(line.u[0])}(y-(${texNumber(line.origin.y / MODEL_SCALE)}))=0`
        );
      }
      if (rigid && refs[0])
        extra.push(
          `${vector('r', texName(point.id))}=${vector('r', texName(refs[0].id))}+R(\\theta)${vector('r', `${texName(point.id)}/${texName(refs[0].id)},0`)}`
        );
      return {
        ...one,
        point,
        refs,
        radii,
        method,
        diagram,
        equations,
        extra,
        rigid,
        prescribed,
        guide,
        circleMethod,
        candidates: (circle?.candidates ?? line?.candidates ?? []).map(
          (candidate, i) => `P_${i + 1}=${column(candidate.map((v) => v / MODEL_SCALE))}`
        ),
        answer: `${vector('r', texName(point.id))}=${column([point.x / MODEL_SCALE, point.y / MODEL_SCALE])}\\;\\mathrm{${mechanism.unit}}`,
        residual: circle?.residual ?? line?.residual,
      };
    });
    const loops = kine?.loops.map((loop) => ({
      ...loop,
      ...worksheetLoopOptions(mechanism, preferences.loops, loop.index),
      diagram: {
        points: [
          ...new Map(
            loop.edges
              .flatMap((e) => [e.from, e.to])
              .map((j) => [j.id, { x: j.x, y: j.y, label: j.id }])
          ).values(),
        ],
        lines: [
          ...loop.edges.map((e) => ({
            from: e.from,
            to: e.to,
            arrow: true,
            color: e.kind === 'ground' ? 'var(--text-tertiary)' : 'var(--brand)',
            dashed: e.kind === 'ground',
            label: e.kind === 'ground' ? 'ground' : `r${e.to.id}/${e.from.id}`,
            midpointLabel: true,
          })),
          ...(loop.first && loop.last && loop.first.id !== loop.last.id
            ? [
                {
                  from: loop.last,
                  to: loop.first,
                  arrow: true,
                  dashed: true,
                  color: 'var(--text-tertiary)',
                  label: 'ground',
                  midpointLabel: true,
                },
              ]
            : []),
        ],
      } as Diagram,
    }));
    return {
      forceChoices:
        forceWork?.choices.map((choice) => ({
          ...choice,
          previews: forceWork.bodies
            .filter((b) =>
              b.loads.some((l) => l.column !== undefined && choice.columns.includes(l.column))
            )
            .map((body) => ({
              name: body.name,
              diagram: freeBodyDiagram(
                {
                  ...body,
                  loads: body.loads.filter(
                    (l) => l.column !== undefined && choice.columns.includes(l.column)
                  ),
                },
                true,
                false
              ),
            })),
        })) ?? [],
      angularValues: rates
        ? [...rates.omega].map(
            ([id, omega]) =>
              `\\omega_{${texName(id)}}=${texNumber((preferences.angularByBody[id] ?? preferences.angular) * omega)}\\;\\mathrm{rad/s},\\quad\\alpha_{${texName(id)}}=${texNumber((preferences.angularByBody[id] ?? preferences.angular) * (rates.alpha.get(id) ?? 0))}\\;\\mathrm{rad/s^2}`
          )
        : [],
      bodyAngularChoices: rates
        ? [...rates.omega.keys()].map((id) => ({
            key: id,
            label: `Link ${id}`,
            description: 'Positive angular velocity and acceleration for this link.',
            options: ['Counterclockwise', 'Clockwise'],
            selected: (preferences.angularByBody[id] ?? preferences.angular) === 1 ? 0 : 1,
          }))
        : [],
      angularChoices: [
        {
          key: 'angular',
          label: 'Default Angular Direction',
          description:
            'Sets every link, including the known input. Use the per-link choices below for mixed conventions. Linear x and y directions stay unchanged.',
          options: ['Counterclockwise', 'Clockwise'],
          selected: preferences.angular === 1 ? 0 : 1,
        },
      ],
      force,
      forceWork,
      rates,
      kine,
      positions,
      circles,
      circleLines,
      loops,
      diagram: mechanismDiagram(mechanism, step),
      bodies:
        forceWork?.bodies.map((body) => ({
          ...body,
          referenceLabels: body.referenceOptions.map((p) =>
            p.id === '@CoM' ? 'CoM (Center of Mass)' : p.label
          ),
          referenceIndex: body.referenceOptions.findIndex((p) => p.id === body.reference.id),
          diagram: freeBodyDiagram(body, this.assumed()),
        })) ?? [],
      grounds: joints
        .filter((j) => j instanceof RealJoint && j.ground && !(j instanceof PrisJoint))
        .map((j) => ({
          id: j.id,
          equation: `${vector('r', j.id)}=${column([j.x / MODEL_SCALE, j.y / MODEL_SCALE])}`,
          zero: `${vector('v', j.id)}=${vector('a', j.id)}=\\vec0`,
        })),
    };
  }
  protected readonly openWorksheet = () => {
    this.dialogs.open(SolverExplanationComponent, {
      data: { force: this.isForce(), section: this.section(), machine: this.machineId },
      width: '1120px',
      maxWidth: '96vw',
      height: '92vh',
      ariaLabel: this.isForce() ? 'Force analysis worksheet' : 'Kinematic analysis worksheet',
      autoFocus: 'dialog',
    });
  };
  protected readonly closeWorksheet = () => this.dialog?.close();
  protected readonly resetConventions = () => this.preferences.reset(this.solved);
  protected seek(value: string | number) {
    const sample = Number(value);
    if (!this.valid || !Number.isInteger(sample) || sample < 0 || sample > this.lastStep) return;
    const time = this.solved.timeNum[sample];
    if (time === undefined) return;
    this.mechanism.seekMechanism(
      this.index,
      this.solved.framesRunBackwards && time !== 0 ? this.solved.cyclePeriod - time : time
    );
  }
}
