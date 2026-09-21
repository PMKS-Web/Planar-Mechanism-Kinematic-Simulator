import { Component, computed, signal } from '@angular/core';
import {
  SolverDiagramComponent,
  Diagram,
  DiagramLine,
  DiagramPoint,
} from './solver-diagram.component';
import { SolverMathComponent } from './solver-math.component';

type ReferenceId = 'A' | 'CoM' | 'B';
type DirectionKey = 'Ax' | 'Ay' | 'Bx' | 'By' | 'MA';

/** A mechanism-independent, layered introduction to planar free-body diagrams. */
@Component({
  selector: 'app-force-definitions',
  imports: [SolverDiagramComponent, SolverMathComponent],
  template: `
    <details class="definitionStep">
      <summary>1 · Start with Force and Moment Balances</summary>
      <details class="subsection">
        <summary>Force balance</summary>
        <app-solver-math [equation]="forceBalance" />
        <p>
          The left side is every force drawn on the free-body diagram. The right side is inertia.
        </p>
        <details class="equationDetail">
          <summary>See what belongs on each side</summary>
          <app-solver-math [equation]="forceLoadGroups" />
          <dl class="termDefinitions">
            <dt><app-solver-math [equation]="forceTerms[0].symbol" [inline]="true" /></dt>
            <dd>Internal forces exposed when the body is separated.</dd>
            <dt><app-solver-math [equation]="forceTerms[1].symbol" [inline]="true" /></dt>
            <dd>External forces applied to the link.</dd>
            <dt><app-solver-math [equation]="forceTerms[2].symbol" [inline]="true" /></dt>
            <dd>Gravity acting on the link at its center of mass.</dd>
            <dt><app-solver-math [equation]="forceTerms[3].symbol" [inline]="true" /></dt>
            <dd>
              Newton's second-law force from the link mass and its center-of-mass acceleration.
            </dd>
          </dl>
        </details>
        <details class="equationDetail">
          <summary>Resolve force balance into x, y, and z</summary>
          <app-solver-math [equation]="forceVectorComponents" />
          <app-solver-math [equation]="forceComponents" />
          <p>
            This is a planar mechanism. Neither the force vector nor the acceleration vector has an
            out-of-plane component, so the red z equation reduces to 0 = 0 and only x and y are
            solved.
          </p>
        </details>
      </details>
      <details class="subsection">
        <summary>Moment balance</summary>
        <app-solver-math [equation]="momentBalance" />
        <p>
          The left side adds the moments of every load in the free-body diagram about the chosen
          point.
        </p>
        <details class="equationDetail">
          <summary>See what belongs on each side</summary>
          <app-solver-math [equation]="momentLoadGroups" />
          <dl class="termDefinitions">
            <dt><app-solver-math [equation]="momentTerms[0].symbol" [inline]="true" /></dt>
            <dd>Moments of the exposed joint reactions about the chosen reference.</dd>
            <dt><app-solver-math [equation]="momentTerms[1].symbol" [inline]="true" /></dt>
            <dd>Moments of externally applied forces.</dd>
            <dt><app-solver-math [equation]="momentTerms[2].symbol" [inline]="true" /></dt>
            <dd>Moments made by gravity acting at the center of mass.</dd>
            <dt><app-solver-math [equation]="momentTerms[3].symbol" [inline]="true" /></dt>
            <dd>Applied motor torque, which is already a moment and needs no r vector.</dd>
            <dt><app-solver-math [equation]="momentTerms[4].symbol" [inline]="true" /></dt>
            <dd>Rotational inertia for motion; it becomes zero for statics.</dd>
          </dl>
        </details>
        <details class="equationDetail">
          <summary>Calculate a position vector r</summary>
          <app-solver-math [equation]="generalPositionVector" />
          <p>
            When the force is applied at the selected moment reference, its two point coordinates
            are equal. Therefore r = 0 and that force makes no moment about that point.
          </p>
        </details>
        <details class="equationDetail">
          <summary>
            Resolve one force moment with
            <span class="vectorSymbol" aria-label="vector r">r</span> ×
            <span class="vectorSymbol" aria-label="vector F">F</span>
          </summary>
          <app-solver-diagram
            [diagram]="momentBalanceDiagram"
            label="A force at point P creating a moment about point O"
          />
          <app-solver-math [equation]="genericVectors" />
          <app-solver-math [equation]="genericCrossProduct" />
          <app-solver-math [equation]="genericMomentComponents" />
          <p>
            Both vectors lie in the x-y plane. Their out-of-plane components are zero, which cancels
            the i and j components and leaves the z component for planar force analysis.
          </p>
        </details>
      </details>
    </details>

    <details class="definitionStep">
      <summary>2 · Build the Free-Body Diagram</summary>
      <h3>Isolate the slanted link AB</h3>
      <p>
        Replace the two connections with reactions, keep the weight at CoM, show the applied force
        at P, and include the motor torque M_A at A. Orange arrows are assumed directions, not
        calculated answers.
      </p>
      <app-solver-diagram
        [diagram]="initialDiagram()"
        label="Slanted two-joint bar AB with reactions, weight W_ab at its center, and force F_1 at P"
      />
      <p class="caption">The curved arrow around the axes marks the positive moment direction.</p>
      <details class="equationDetail">
        <summary>Choose free-body diagram conventions</summary>
        <label class="axisControl">
          X-axis angle
          <input
            aria-label="Definition x-axis angle"
            type="number"
            min="-180"
            max="180"
            step="1"
            [value]="axisAngle()"
            (change)="axisAngle.set($any($event.target).valueAsNumber || 0)"
          />
          degrees
        </label>
        <p class="caption">
          0° means +x right and +y up. All force arrows and axes use this frame.
        </p>
        <div class="directionControls">
          @for (choice of directionChoices; track choice.key) {
            <label>
              <app-solver-math [equation]="choice.symbol" [inline]="true" />
              <select
                [attr.aria-label]="'Definition direction for ' + choice.key"
                [value]="direction(choice.key)"
                (change)="setDirection(choice.key, $any($event.target).value)"
              >
                <option value="1">positive</option>
                <option value="-1">negative</option>
              </select>
            </label>
          }
        </div>
        <label class="referenceControl">
          Fixed Moment Reference
          <select
            aria-label="Fixed moment reference for definition"
            [value]="reference()"
            (change)="reference.set($any($event.target).value)"
          >
            @for (option of referenceOptions; track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
        </label>
      </details>
      <details class="equationDetail">
        <summary>Show the position-vector projection grid</summary>
        <app-solver-diagram
          [diagram]="momentArmGrid()"
          [label]="'Moment-arm component grid about ' + referenceLabel()"
        />
        <p class="caption">
          The grid projects each moment arm outside the link. Choose a different reference here or
          in the z-moment section to update every related diagram and equation.
        </p>
      </details>
    </details>

    <details class="definitionStep">
      <summary>3 · Variables in This Example</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Meaning</th>
          </tr>
        </thead>
        <tbody>
          @for (variable of variables; track variable.symbol) {
            <tr>
              <td><app-solver-math [equation]="variable.symbol" [inline]="true" /></td>
              <td>{{ variable.meaning }}</td>
            </tr>
          }
        </tbody>
      </table>
    </details>

    <details class="definitionStep">
      <summary>4 · Build the Force and Moment Equations</summary>
      <p>Start with the FBD above, then collect each load component in the matching balance.</p>
      <details class="subsection">
        <summary>Sum of Forces in x</summary>
        <p>Highlight each x component from the same FBD. Positive x follows the chosen frame.</p>
        <app-solver-diagram
          [diagram]="forceXDiagram()"
          label="Free-body diagram highlighting x-force components"
        />
        <app-solver-math [equation]="exampleFx()" />
      </details>
      <details class="subsection">
        <summary>Sum of Forces in y</summary>
        <p>Highlight each y component from the same FBD. Positive y follows the chosen frame.</p>
        <app-solver-diagram
          [diagram]="forceYDiagram()"
          label="Free-body diagram highlighting y-force components"
        />
        <app-solver-math [equation]="exampleFy()" />
      </details>
      <details class="subsection">
        <summary>Sum of Moments in z</summary>
        <app-solver-diagram
          [diagram]="momentDiagram()"
          [label]="'Free-body diagram with moments about ' + referenceLabel()"
        />
        <label class="referenceControl">
          Moment Reference
          <select
            aria-label="Moment reference for definition"
            [value]="reference()"
            (change)="reference.set($any($event.target).value)"
          >
            @for (option of referenceOptions; track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
        </label>
        <app-solver-math [equation]="generalMomentEquation()" />
        <p>
          The blue ring is the selected reference. The projection grid in Build the Free-Body
          Diagram updates with this choice.
        </p>
        <app-solver-math [equation]="cancelledMomentTerms()" />
        <p class="caption">
          Red crossed-out terms have a zero moment arm or a line of action through the selected
          reference. The applied motor torque remains because it is already a moment.
        </p>
      </details>
    </details>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 0 18px 24px;
      }
      h3 {
        font-size: 16px;
        color: var(--text-strong);
        margin: 14px 0 8px;
      }
      p {
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-secondary);
      }
      app-solver-diagram {
        max-width: 520px;
        margin: auto;
      }
      .caption {
        font-size: 11px;
        text-align: center;
      }
      details {
        border-top: 1px solid var(--border-rule);
        padding: 12px 0;
      }
      summary {
        cursor: pointer;
        color: var(--brand);
      }
      .definitionStep > summary {
        font-size: 14px;
        font-weight: 600;
      }
      .subsection {
        margin-left: 12px;
      }
      .equationDetail {
        margin-left: 12px;
      }
      .termDefinitions {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 12px;
        margin: 10px 0;
        font-size: 12px;
      }
      .termDefinitions dt {
        color: var(--text-strong);
        font-weight: 600;
      }
      .termDefinitions dd {
        margin: 0;
        color: var(--text-secondary);
      }
      .vectorSymbol {
        position: relative;
        display: inline-block;
        margin: 0 0.05em;
      }
      .vectorSymbol::before {
        content: '→';
        position: absolute;
        top: -0.7em;
        left: 50%;
        transform: translateX(-50%) scaleX(0.8);
        font-size: 0.8em;
        font-style: normal;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th,
      td {
        padding: 8px;
        text-align: left;
        vertical-align: top;
        border-bottom: 1px solid var(--border-divider);
      }
      th {
        color: var(--text-strong);
      }
      td:first-child {
        width: 36%;
        color: var(--text-strong);
      }
      .sidesTable th,
      .sidesTable td {
        width: 50%;
      }
      .referenceControl {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        color: var(--text-strong);
        font-size: 12px;
      }
      .axisControl {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        color: var(--text-strong);
        font-size: 12px;
      }
      .axisControl input {
        width: 62px;
      }
      .directionControls {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 8px;
        margin: 12px 0;
      }
      .directionControls label {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-strong);
        font-size: 12px;
      }
      select {
        border: 1px solid var(--border-divider);
        border-radius: var(--border-radius);
        padding: 5px;
        background: var(--surface);
        color: var(--text-primary);
        font: inherit;
      }
    `,
  ],
})
export class ForceDefinitionsComponent {
  private readonly points: Record<ReferenceId | 'P', DiagramPoint> = {
    A: { x: 0, y: 0, label: 'A' },
    B: { x: 190, y: 70, label: 'B' },
    P: { x: 135, y: 50, label: 'P' },
    CoM: { x: 95, y: 35, label: 'CoM' },
  };
  protected readonly reference = signal<ReferenceId>('A');
  protected readonly axisAngle = signal(0);
  private readonly directions = signal<Record<DirectionKey, 1 | -1>>({
    Ax: -1,
    Ay: 1,
    Bx: 1,
    By: 1,
    MA: 1,
  });
  protected readonly referenceOptions = [
    { id: 'A' as const, label: 'A (Joint)' },
    { id: 'CoM' as const, label: 'CoM (Center of Mass)' },
    { id: 'B' as const, label: 'B (Joint)' },
  ];
  protected readonly directionChoices = [
    { key: 'Ax' as const, symbol: String.raw`A_x` },
    { key: 'Ay' as const, symbol: String.raw`A_y` },
    { key: 'Bx' as const, symbol: String.raw`B_x` },
    { key: 'By' as const, symbol: String.raw`B_y` },
    { key: 'MA' as const, symbol: String.raw`M_A` },
  ];
  protected readonly initialDiagram = computed(() => this.fbdDiagram('all', this.reference()));
  protected readonly momentBalanceDiagram = this.genericMomentDiagram();
  protected readonly forceXDiagram = computed(() => this.fbdDiagram('x', this.reference()));
  protected readonly forceYDiagram = computed(() => this.fbdDiagram('y', this.reference()));
  protected readonly momentDiagram = computed(() => this.fbdDiagram('moment', this.reference()));
  protected readonly referenceLabel = computed(
    () => this.referenceOptions.find((option) => option.id === this.reference())!.label
  );
  protected readonly cancelledMomentTerms = computed(() =>
    this.cancelledTermsFor(this.reference())
  );
  protected readonly forceBalance = String.raw`\sum\vec F=m\vec a_{\mathrm{CoM}}\qquad\xrightarrow{\ \mathrm{statics}:\ \vec a=\vec0\ }\qquad\sum\vec F=\vec0`;
  protected readonly forceLoadGroups = String.raw`\underbrace{\sum\vec F_{\mathrm{joint}}+\sum\vec F_{\mathrm{external}}+\sum\vec W}_{\text{LHS: all forces on the FBD}}=\underbrace{m\vec a_{\mathrm{CoM}}}_{\text{RHS: motion}}\quad\text{or}\quad\underbrace{\vec0}_{\text{RHS: static}}`;
  protected readonly forceTerms = [
    {
      symbol: String.raw`\sum\vec F_{\mathrm{joint}}`,
      meaning: 'Internal forces exposed when the body is separated.',
    },
    {
      symbol: String.raw`\sum\vec F_{\mathrm{external}}`,
      meaning: 'External forces applied to the link.',
    },
    {
      symbol: String.raw`\sum\vec W`,
      meaning: 'Gravity acting on the link at its center of mass.',
    },
    {
      symbol: String.raw`m\vec a_{\mathrm{CoM}}`,
      meaning: "Newton's second-law force from mass and center-of-mass acceleration.",
    },
  ];
  protected readonly forceVectorComponents = String.raw`\sum\vec F=\left\langle\sum F_x,\ \sum F_y,\ \color{red}{\cancel{\sum F_z}}\right\rangle`;
  protected readonly forceComponents = String.raw`\begin{aligned}\sum F_x&=m a_{\mathrm{CoM},x}\\\sum F_y&=m a_{\mathrm{CoM},y}\\\color{red}{\cancel{\sum F_z}}&=\color{red}{\cancel{m a_{\mathrm{CoM},z}}}=0\quad\text{(planar)}\end{aligned}`;
  protected readonly momentBalance = String.raw`\sum\vec M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\vec\alpha\qquad\xrightarrow{\ \mathrm{statics}:\ \vec\alpha=\vec0\ }\qquad\sum\vec M_{\mathrm{CoM}}=\vec0`;
  protected readonly momentLoadGroups = String.raw`\underbrace{\sum(\vec r\times\vec F_{\mathrm{joint}})+\sum(\vec r\times\vec F_{\mathrm{external}})+\sum(\vec r\times\vec W)+\sum M_{\mathrm{motor}}}_{\text{LHS: all moments on the FBD}}=\underbrace{I_{\mathrm{CoM}}\vec\alpha}_{\text{RHS: motion}}\quad\text{or}\quad\underbrace{\vec0}_{\text{RHS: static}}`;
  protected readonly momentTerms = [
    {
      symbol: String.raw`\sum(\vec r\times\vec F_{\mathrm{joint}})`,
      meaning: 'Moments of exposed joint reactions about the selected reference.',
    },
    {
      symbol: String.raw`\sum(\vec r\times\vec F_{\mathrm{external}})`,
      meaning: 'Moments of externally applied forces.',
    },
    {
      symbol: String.raw`\sum(\vec r\times\vec W)`,
      meaning: 'Moments made by gravity at the center of mass.',
    },
    {
      symbol: String.raw`\sum M_{\mathrm{motor}}`,
      meaning: 'Applied motor torque, which needs no r vector.',
    },
    {
      symbol: String.raw`I_{\mathrm{CoM}}\vec\alpha`,
      meaning: 'Rotational inertia for motion; zero for statics.',
    },
  ];
  protected readonly genericVectors = String.raw`\vec r_{P/O}=\langle r_{P/O,x},r_{P/O,y},0\rangle,\qquad\vec F=\langle F_x,F_y,0\rangle`;
  protected readonly genericCrossProduct = String.raw`\vec r_{P/O}\times\vec F=\begin{vmatrix}\hat i&\hat j&\hat k\\r_{P/O,x}&r_{P/O,y}&0\\F_x&F_y&0\end{vmatrix}`;
  protected readonly genericMomentComponents = String.raw`\vec M_O=\langle\underbrace{0}_{M_x},\underbrace{0}_{M_y},\underbrace{r_{P/O,x}F_y-r_{P/O,y}F_x}_{M_z}\rangle`;
  protected readonly generalMomentEquation = computed(
    () =>
      String.raw`\sum M_{${this.referenceName()},z}=\sum(\vec r_{\mathrm{joint}/${this.referenceName()}}\times\vec F_{\mathrm{joint}})_z+\sum(\vec r_{\mathrm{external}/${this.referenceName()}}\times\vec F_{\mathrm{external}})_z+\sum(\vec r_{\mathrm{CoM}/${this.referenceName()}}\times\vec W)_z${this.motorTerm()}=0`
  );
  protected readonly generalPositionVector = String.raw`\vec r_{Q/O}=\vec p_Q-\vec p_O=\langle x_Q-x_O,\ y_Q-y_O,\ 0\rangle`;
  protected readonly exampleFx = computed(
    () =>
      String.raw`\sum F_x=${this.signedTerm(this.direction('Ax'), 'A_x')}${this.signedTerm(this.direction('Bx'), 'B_x')}+F_{1x}=0`
  );
  protected readonly exampleFy = computed(
    () =>
      String.raw`\sum F_y=${this.signedTerm(this.direction('Ay'), 'A_y')}${this.signedTerm(this.direction('By'), 'B_y')}+F_{1y}-W_{AB}=0`
  );
  protected readonly variables = [
    { symbol: String.raw`A_x,\ A_y`, meaning: 'Reaction-force components applied at joint A.' },
    { symbol: String.raw`B_x,\ B_y`, meaning: 'Reaction-force components applied at joint B.' },
    {
      symbol: String.raw`F_{1x},\ F_{1y}`,
      meaning: 'x and y components of the external force F_1 at P.',
    },
    {
      symbol: String.raw`W_{AB}`,
      meaning: 'Weight of link AB, applied at its center of mass (CoM).',
    },
    {
      symbol: String.raw`M_A`,
      meaning: 'Motor torque applied directly at joint A.',
    },
    {
      symbol: String.raw`\vec r_{A/O}`,
      meaning: 'Position vector from the chosen moment reference O to joint A.',
    },
    {
      symbol: String.raw`\vec r_{B/O}`,
      meaning: 'Position vector from the chosen moment reference O to joint B.',
    },
    {
      symbol: String.raw`\vec r_{P/O}`,
      meaning: 'Position vector from the chosen moment reference O to the applied force at P.',
    },
    {
      symbol: String.raw`\vec r_{\mathrm{CoM}/O}`,
      meaning: 'Position vector from the chosen moment reference O to the center of mass.',
    },
    {
      symbol: String.raw`I_{\mathrm{CoM}},\ \vec\alpha`,
      meaning: 'Mass moment of inertia and angular acceleration for in-motion analysis.',
    },
  ];
  private point(id: ReferenceId | 'P') {
    return this.points[id];
  }

  protected direction(key: DirectionKey) {
    return this.directions()[key];
  }

  protected setDirection(key: DirectionKey, value: string) {
    this.directions.update((directions) => ({
      ...directions,
      [key]: value === '-1' ? -1 : 1,
    }));
  }

  private signedTerm(sign: 1 | -1, symbol: string) {
    return `${sign === 1 ? '+' : '-'}${symbol}`;
  }

  private referenceName() {
    return this.reference() === 'CoM' ? '\\mathrm{CoM}' : this.reference();
  }

  private motorTerm() {
    return this.direction('MA') === 1 ? '+M_A' : '-M_A';
  }

  private distanceFrom(reference: ReferenceId, target: ReferenceId | 'P') {
    const origin = this.point(reference);
    const point = this.point(target);
    return Math.hypot(point.x - origin.x, point.y - origin.y);
  }

  protected momentArmGrid(): Diagram {
    const reference = this.reference();
    const targets = (['A', 'B', 'P', 'CoM'] as const)
      .filter((target) => target !== reference)
      .sort((a, b) => this.distanceFrom(reference, a) - this.distanceFrom(reference, b));
    const gridLines: DiagramLine[] = targets.flatMap((target, index) => {
      const from = this.point(reference);
      const to = this.point(target);
      const xRail = -55 - index * 28;
      const yRail = 210 + index * 30;
      return [
        {
          from: { x: from.x, y: xRail },
          to: { x: to.x, y: xRail },
          label: `r_${target}/${reference},x`,
          dashed: true,
          arrow: true,
          arrowStart: true,
          color: 'var(--success)',
          width: 1.4,
          midpointLabel: true,
        },
        {
          from: { x: yRail, y: from.y },
          to: { x: yRail, y: to.y },
          label: `r_${target}/${reference},y`,
          dashed: true,
          arrow: true,
          arrowStart: true,
          color: 'var(--brand)',
          width: 1.4,
          labelPoint: { x: yRail - 22, y: (from.y + to.y) / 2 },
        },
        {
          from,
          to: { x: from.x, y: xRail },
          dashed: true,
          color: 'var(--text-tertiary)',
          width: 0.9,
        },
        {
          from: to,
          to: { x: to.x, y: xRail },
          dashed: true,
          color: 'var(--text-tertiary)',
          width: 0.9,
        },
        {
          from,
          to: { x: yRail, y: from.y },
          dashed: true,
          color: 'var(--text-tertiary)',
          width: 0.9,
        },
        {
          from: to,
          to: { x: yRail, y: to.y },
          dashed: true,
          color: 'var(--text-tertiary)',
          width: 0.9,
        },
      ];
    });
    return {
      axisAngle: this.axisAngle(),
      axisMomentLabel: 'M',
      legend: 'Moment-arm component grid',
      points: Object.values(this.points).map((point) => ({
        ...point,
        reference: point.label === reference,
      })),
      outlines: [
        [
          { x: -7, y: 12 },
          { x: 184, y: 82 },
          { x: 197, y: 58 },
          { x: 6, y: -12 },
        ],
      ],
      lines: gridLines,
      framingPoints: [
        { x: -20, y: -120 },
        { x: 300, y: 110 },
      ],
    };
  }

  private genericMomentDiagram(): Diagram {
    const origin = { x: 0, y: 0, label: 'O', reference: true };
    const application = { x: 145, y: 55, label: 'P' };
    return {
      axisAngle: this.axisAngle(),
      axisMomentLabel: 'M',
      points: [origin, application],
      lines: [
        {
          from: origin,
          to: application,
          label: 'r_P/O',
          dashed: true,
          color: 'var(--brand)',
          width: 1.1,
          midpointLabel: true,
        },
        {
          from: origin,
          to: { x: application.x, y: origin.y },
          label: 'r_P/O,x',
          dashed: true,
          color: 'var(--brand)',
          width: 1.4,
          midpointLabel: true,
        },
        {
          from: { x: application.x, y: origin.y },
          to: application,
          label: 'r_P/O,y',
          dashed: true,
          color: 'var(--brand)',
          width: 1.4,
          midpointLabel: true,
        },
        {
          from: application,
          to: { x: 190, y: 105 },
          label: 'F',
          arrow: true,
          color: 'var(--warning)',
          width: 1.9,
        },
        {
          from: application,
          to: { x: 190, y: 55 },
          label: 'F_x',
          arrow: true,
          color: 'var(--success)',
          width: 1.4,
        },
        {
          from: application,
          to: { x: 145, y: 105 },
          label: 'F_y',
          arrow: true,
          color: 'var(--accent)',
          width: 1.4,
        },
      ],
      framingPoints: [
        { x: -45, y: -45 },
        { x: 225, y: 125 },
      ],
    };
  }

  private cancelledTermsFor(reference: ReferenceId) {
    const name = reference === 'CoM' ? '\\mathrm{CoM}' : reference;
    const cancelled: Record<ReferenceId, string> = {
      A: String.raw`\textcolor{red}{\cancel{(\vec r_{A/A}\times\vec F_A)_z}}`,
      CoM: String.raw`\textcolor{red}{\cancel{(\vec r_{\mathrm{CoM}/\mathrm{CoM}}\times\vec W)_z}}`,
      B: String.raw`\textcolor{red}{\cancel{(\vec r_{B/B}\times\vec F_B)_z}}`,
    };
    const motor = this.motorTerm();
    const retained: Record<ReferenceId, string> = {
      A: String.raw`(\vec r_{B/A}\times\vec F_B)_z+(\vec r_{P/A}\times\vec F_1)_z+(\vec r_{\mathrm{CoM}/A}\times\vec W)_z${motor}`,
      CoM: String.raw`(\vec r_{A/\mathrm{CoM}}\times\vec F_A)_z+(\vec r_{B/\mathrm{CoM}}\times\vec F_B)_z+(\vec r_{P/\mathrm{CoM}}\times\vec F_1)_z${motor}`,
      B: String.raw`(\vec r_{A/B}\times\vec F_A)_z+(\vec r_{P/B}\times\vec F_1)_z+(\vec r_{\mathrm{CoM}/B}\times\vec W)_z${motor}`,
    };
    return String.raw`\sum M_{${name},z}=${cancelled[reference]}+${retained[reference]}=0`;
  }

  private fbdDiagram(highlight: 'all' | 'x' | 'y' | 'moment', reference: ReferenceId): Diagram {
    const active = (direction: 'x' | 'y' | 'moment') =>
      highlight === 'all' || highlight === 'moment' || highlight === direction;
    const component = (line: DiagramLine, direction: 'x' | 'y' | 'moment') => ({
      ...line,
      arrow: true,
      color: active(direction) ? 'var(--warning)' : 'var(--text-tertiary)',
      width: active(direction) ? 1.9 : 1.1,
    });
    const alongAxis = (from: DiagramPoint, axis: 'x' | 'y', sign: 1 | -1, length: number) => {
      const theta = (this.axisAngle() * Math.PI) / 180;
      const basis =
        axis === 'x'
          ? { x: Math.cos(theta), y: Math.sin(theta) }
          : { x: -Math.sin(theta), y: Math.cos(theta) };
      return { x: from.x + sign * length * basis.x, y: from.y + sign * length * basis.y };
    };
    const jointComponent = (
      point: DiagramPoint,
      key: Extract<DirectionKey, 'Ax' | 'Ay' | 'Bx' | 'By'>,
      axis: 'x' | 'y',
      label: string
    ) =>
      component({ from: point, to: alongAxis(point, axis, this.direction(key), 60), label }, axis);
    const pointP = this.point('P');
    const loadLines: DiagramLine[] = [
      jointComponent(this.point('A'), 'Ax', 'x', 'A_x'),
      jointComponent(this.point('A'), 'Ay', 'y', 'A_y'),
      jointComponent(this.point('B'), 'Bx', 'x', 'B_x'),
      jointComponent(this.point('B'), 'By', 'y', 'B_y'),
      component({ from: this.point('CoM'), to: { x: 95, y: -35 }, label: 'W_AB' }, 'y'),
      component({ from: pointP, to: alongAxis(pointP, 'x', 1, 55), label: 'F_1x' }, 'x'),
      component({ from: pointP, to: alongAxis(pointP, 'y', 1, 55), label: 'F_1y' }, 'y'),
    ];
    if (highlight === 'all') {
      loadLines.splice(
        5,
        2,
        component(
          { from: pointP, to: alongAxis(alongAxis(pointP, 'x', 1, 45), 'y', 1, 55), label: 'F_1' },
          'moment'
        )
      );
    }
    return {
      axisAngle: this.axisAngle(),
      axisMomentLabel: 'M',
      points: Object.values(this.points).map((point) => ({
        ...point,
        reference: point.label === reference,
      })),
      outlines: [
        [
          { x: -7, y: 12 },
          { x: 184, y: 82 },
          { x: 197, y: 58 },
          { x: 6, y: -12 },
        ],
      ],
      framingPoints: [
        { x: -70, y: -75 },
        { x: 265, y: 150 },
      ],
      lines: loadLines,
      couples:
        highlight === 'x' || highlight === 'y'
          ? [
              {
                x: 0,
                y: 0,
                sign: this.direction('MA'),
                label: 'M_A',
                color: 'var(--text-tertiary)',
              },
            ]
          : [{ x: 0, y: 0, sign: this.direction('MA'), label: 'M_A', color: 'var(--warning)' }],
    };
  }
}
