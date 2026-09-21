import { Component, computed, signal } from '@angular/core';
import {
  SolverDiagramComponent,
  Diagram,
  DiagramLine,
  DiagramPoint,
} from './solver-diagram.component';
import { SolverMathComponent } from './solver-math.component';

type ReferenceId = 'A' | 'CoM' | 'B';

/** A mechanism-independent, layered introduction to planar free-body diagrams. */
@Component({
  selector: 'app-force-definitions',
  imports: [SolverDiagramComponent, SolverMathComponent],
  template: `
    <details class="definitionStep" open>
      <summary>1 · Start with Force and Moment Balances</summary>
      <details class="subsection" open>
        <summary>Force balance</summary>
        <app-solver-math [equation]="forceBalance" />
        <p>The left side contains applied reactions, forces, and weight.</p>
        <details class="equationDetail">
          <summary>Resolve force balance into x, y, and z</summary>
          <app-solver-math [equation]="forceComponents" />
          <p>
            This is a planar mechanism: no force or acceleration is considered in z. Therefore ΣF_z
            = ma_z = 0, and only the x and y equations are solved.
          </p>
        </details>
        <details class="equationDetail">
          <summary>Assumptions used in this example</summary>
          <dl class="assumptions">
            <dt>Gravity is included</dt>
            <dd>It appears as the downward weight W_AB in the y-force balance.</dd>
            <dt>Static condition</dt>
            <dd>Acceleration is zero, so the right side ma becomes zero.</dd>
          </dl>
          <app-solver-math [equation]="staticForceComponents" />
        </details>
      </details>
      <details class="subsection" open>
        <summary>Moment balance</summary>
        <app-solver-math [equation]="momentBalance" />
        <p>The left side contains applied couples and moments made by forces.</p>
        <details class="equationDetail">
          <summary>Resolve moment balance into x, y, and z</summary>
          <app-solver-math [equation]="momentComponents" />
          <p>
            The position vectors and forces lie in the x-y plane. Their moments only point in z, so
            M_x = 0 = 0 and M_y = 0 = 0; only the z-moment equation is solved.
          </p>
        </details>
        <details class="equationDetail">
          <summary>See a force create a moment</summary>
          <app-solver-diagram
            [diagram]="momentBalanceDiagram"
            label="A force at point P creating a moment about point O"
          />
          <p class="caption">
            A force applied at P creates a moment about O. Section 4 resolves this position vector
            and force into the x and y components used to build the z-moment equation.
          </p>
        </details>
      </details>
    </details>

    <details class="definitionStep" open>
      <summary>2 · Build the Free-Body Diagram</summary>
      <h3>Isolate the slanted link AB</h3>
      <p>
        Replace the two connections with reactions, keep the weight at CoM, and show the applied
        force at P. Orange arrows are assumed directions, not calculated answers.
      </p>
      <app-solver-diagram
        [diagram]="initialDiagram"
        label="Slanted two-joint bar AB with reactions, weight W_ab at its center, and force F_1 at P"
      />
      <p class="caption">The curved arrow around the axes marks the positive moment direction.</p>
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

    <details class="definitionStep" open>
      <summary>4 · Build the Force and Moment Equations</summary>
      <p>Start with the FBD above, then collect each load component in the matching balance.</p>
      <details class="subsection" open>
        <summary>Sum of Forces in x</summary>
        <p>Highlight each horizontal component from the same FBD. Right is positive x.</p>
        <app-solver-diagram
          [diagram]="forceXDiagram"
          label="Free-body diagram highlighting x-force components"
        />
        <app-solver-math [equation]="exampleFx" />
      </details>
      <details class="subsection" open>
        <summary>Sum of Forces in y</summary>
        <p>Highlight each vertical component from the same FBD. Up is positive y.</p>
        <app-solver-diagram
          [diagram]="forceYDiagram"
          label="Free-body diagram highlighting y-force components"
        />
        <app-solver-math [equation]="exampleFy" />
      </details>
      <details class="subsection" open>
        <summary>Sum of Moments in z</summary>
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
        <p>
          The blue ring is the selected reference. The FBD identifies the forces; the component grid
          below keeps every moment arm away from the link so its x and y parts stay readable.
        </p>
        <app-solver-diagram
          [diagram]="momentDiagram()"
          [label]="'Free-body diagram with moments about ' + referenceLabel()"
        />
        <app-solver-diagram
          [diagram]="momentArmGrid()"
          [label]="'Moment-arm component grid about ' + referenceLabel()"
        />
        <app-solver-math [equation]="referenceDistances()" />
        <app-solver-math [equation]="crossProduct()" />
        <app-solver-math [equation]="momentEquation()" />
        <p class="caption">
          Each term uses (r × F)_z = r_xF_y − r_yF_x. Move the reference to see which arms become
          zero and how the symbolic z-moment equation changes. This example is static, so the right
          side remains zero.
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
      .assumptions {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 6px 12px;
        margin: 10px 0;
        font-size: 12px;
      }
      .assumptions dt {
        color: var(--text-strong);
        font-weight: 600;
      }
      .assumptions dd {
        margin: 0;
        color: var(--text-secondary);
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
  protected readonly referenceOptions = [
    { id: 'A' as const, label: 'A (Joint)' },
    { id: 'CoM' as const, label: 'CoM (Center of Mass)' },
    { id: 'B' as const, label: 'B (Joint)' },
  ];
  protected readonly initialDiagram = this.fbdDiagram('all', 'A');
  protected readonly momentBalanceDiagram = this.genericMomentDiagram();
  protected readonly forceXDiagram = this.fbdDiagram('x', 'A');
  protected readonly forceYDiagram = this.fbdDiagram('y', 'A');
  protected readonly momentDiagram = computed(() => this.fbdDiagram('moment', this.reference()));
  protected readonly referenceLabel = computed(
    () => this.referenceOptions.find((option) => option.id === this.reference())!.label
  );
  protected readonly referenceDistances = computed(() => this.distanceList(this.reference()));
  protected readonly crossProduct = computed(
    () =>
      String.raw`(\vec r_{P/${this.reference()}}\times\vec F_1)_z=r_{P/${this.reference()},x}F_{1y}-r_{P/${this.reference()},y}F_{1x}`
  );
  protected readonly momentEquation = computed(() => this.momentFor(this.reference()));
  protected readonly forceBalance = String.raw`\sum\vec F=m\vec a_{\mathrm{CoM}}\qquad\xrightarrow{\ \mathrm{statics}:\ \vec a=\vec0\ }\qquad\sum\vec F=\vec0`;
  protected readonly forceComponents = String.raw`\begin{aligned}\sum F_x&=m a_{\mathrm{CoM},x}&&\xrightarrow{\mathrm{statics}}\quad\sum F_x=0\\\sum F_y&=m a_{\mathrm{CoM},y}&&\xrightarrow{\mathrm{statics}}\quad\sum F_y=0\\\sum F_z&=m a_{\mathrm{CoM},z}=0&&\xrightarrow{\mathrm{planar}}\quad\sum F_z=0\end{aligned}`;
  protected readonly staticForceComponents = String.raw`\begin{aligned}\sum F_x&=0\\\sum F_y&=0\\\sum F_z&=0\end{aligned}`;
  protected readonly momentBalance = String.raw`\sum\vec M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\vec\alpha\qquad\xrightarrow{\ \mathrm{statics}:\ \vec\alpha=\vec0\ }\qquad\sum\vec M_{\mathrm{CoM}}=\vec0`;
  protected readonly momentComponents = String.raw`\begin{aligned}\sum M_{\mathrm{CoM},x}&=0=0\\\sum M_{\mathrm{CoM},y}&=0=0\\\sum M_{\mathrm{CoM},z}&=I_{\mathrm{CoM}}\alpha\quad\xrightarrow{\mathrm{statics}}\quad\sum M_{\mathrm{CoM},z}=0\end{aligned}`;
  protected readonly exampleFx = String.raw`\sum F_x=-A_x+B_x+F_{1x}=0`;
  protected readonly exampleFy = String.raw`\sum F_y=A_y+B_y+F_{1y}-W_{AB}=0`;
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

  private number(value: number) {
    return value < 0 ? `(${value})` : String(value);
  }

  protected momentArmGrid(): Diagram {
    const reference = this.reference();
    const targets = (['A', 'B', 'P', 'CoM'] as const).filter((target) => target !== reference);
    const gridLines: DiagramLine[] = targets.flatMap((target, index) => {
      const start = { x: -120, y: 105 - index * 75 };
      const delta = this.delta(target, reference);
      const endX = start.x + delta.x;
      return [
        {
          from: start,
          to: { x: endX, y: start.y },
          label: `r_${target}/${reference},x`,
          dashed: true,
          arrow: true,
          color: 'var(--success)',
          width: 1.4,
          midpointLabel: true,
        },
        {
          from: { x: endX, y: start.y },
          to: { x: endX, y: start.y + delta.y },
          label: `r_${target}/${reference},y`,
          dashed: true,
          arrow: true,
          color: 'var(--brand)',
          width: 1.4,
          midpointLabel: true,
        },
      ];
    });
    return {
      axisMomentLabel: 'M',
      legend: 'Moment-arm component grid',
      points: [
        { x: -120, y: 105, label: `O = ${reference}`, reference: true },
        ...targets.map((target, index) => ({ x: -145, y: 105 - index * 75, label: target })),
      ],
      lines: gridLines,
      framingPoints: [
        { x: -170, y: -155 },
        { x: 160, y: 150 },
      ],
    };
  }

  private distanceList(reference: ReferenceId) {
    const terms = (['A', 'B', 'P', 'CoM'] as const)
      .filter((target) => target !== reference)
      .map((target) => {
        const delta = this.delta(target, reference);
        return String.raw`\vec r_{${target}/${reference}}=\langle${this.number(delta.x)},${this.number(delta.y)}\rangle`;
      });
    return String.raw`\begin{aligned}${terms.map((term) => `${term}\\`).join('')}\vec r_{${reference}/${reference}}&=\langle0,0\rangle\end{aligned}`;
  }

  private delta(target: ReferenceId | 'P', reference: ReferenceId) {
    const to = this.point(target);
    const from = this.point(reference);
    return { x: to.x - from.x, y: to.y - from.y };
  }

  private genericMomentDiagram(): Diagram {
    const origin = { x: 0, y: 0, label: 'O', reference: true };
    const application = { x: 145, y: 55, label: 'P' };
    return {
      axisMomentLabel: 'M',
      points: [origin, application],
      lines: [
        {
          from: origin,
          to: application,
          label: 'r_P/O',
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
      ],
      framingPoints: [
        { x: -45, y: -45 },
        { x: 225, y: 125 },
      ],
    };
  }

  private momentFor(reference: ReferenceId) {
    const name = reference === 'CoM' ? '\\mathrm{CoM}' : reference;
    const terms: Record<ReferenceId, string> = {
      A: String.raw`r_{B/A,x}B_y-r_{B/A,y}B_x+r_{P/A,x}F_{1y}-r_{P/A,y}F_{1x}-r_{\mathrm{CoM}/A,x}W_{AB}`,
      CoM: String.raw`r_{A/\mathrm{CoM},x}A_y-r_{A/\mathrm{CoM},y}A_x+r_{B/\mathrm{CoM},x}B_y-r_{B/\mathrm{CoM},y}B_x+r_{P/\mathrm{CoM},x}F_{1y}-r_{P/\mathrm{CoM},y}F_{1x}`,
      B: String.raw`r_{A/B,x}A_y-r_{A/B,y}A_x+r_{P/B,x}F_{1y}-r_{P/B,y}F_{1x}-r_{\mathrm{CoM}/B,x}W_{AB}`,
    };
    return String.raw`\sum M_{${name},z}=${terms[reference]}=0`;
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
    const loadLines: DiagramLine[] = [
      component({ from: this.point('A'), to: { x: -55, y: 0 }, label: 'A_x' }, 'x'),
      component({ from: this.point('A'), to: { x: 0, y: 65 }, label: 'A_y' }, 'y'),
      component({ from: this.point('B'), to: { x: 245, y: 70 }, label: 'B_x' }, 'x'),
      component({ from: this.point('B'), to: { x: 190, y: 135 }, label: 'B_y' }, 'y'),
      component({ from: this.point('CoM'), to: { x: 95, y: -35 }, label: 'W_AB' }, 'y'),
      component({ from: this.point('P'), to: { x: 175, y: 50 }, label: 'F_1x' }, 'x'),
      component({ from: this.point('P'), to: { x: 135, y: 105 }, label: 'F_1y' }, 'y'),
    ];
    if (highlight === 'all') {
      loadLines.splice(
        5,
        2,
        component({ from: this.point('P'), to: { x: 175, y: 105 }, label: 'F_1' }, 'moment')
      );
    }
    return {
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
    };
  }
}
