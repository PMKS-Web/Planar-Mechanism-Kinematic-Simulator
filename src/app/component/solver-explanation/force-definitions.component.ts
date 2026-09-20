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
      <h3>Static equilibrium</h3>
      <app-solver-math [equation]="staticBalance" />
      <p>For statics, external forces and moments balance to zero.</p>
      <details class="subsection" open>
        <summary>Separate each balance into x, y, and z</summary>
        <app-solver-math [equation]="forceComponents" />
        <app-solver-math [equation]="momentComponents" />
        <p>
          Planar forces have F_z = 0 and position vectors have r_z = 0. Therefore ΣM_x and ΣM_y
          reduce to 0 = 0; ΣF_x, ΣF_y, and ΣM_z provide the three equations for a rigid link.
        </p>
      </details>
      <details class="subsection">
        <summary>Where the terms go in an in-motion balance</summary>
        <app-solver-math [equation]="dynamicAtCom" />
        <app-solver-math [equation]="dynamicAtReference" />
        <table class="sidesTable">
          <thead>
            <tr>
              <th scope="col">Left side: applied loads</th>
              <th scope="col">Right side: inertia</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Reaction forces, external forces, weight, and applied couples.</td>
              <td>ΣF = 0 and ΣM = 0 for statics.</td>
            </tr>
            <tr>
              <td>These stay on the left when the mechanism moves.</td>
              <td>m a at CoM and I_CoM α; add r_CoM/O × m a when moments are about O.</td>
            </tr>
          </tbody>
        </table>
      </details>
      <details class="subsection">
        <summary>Why changing the moment reference changes the written equation</summary>
        <p>
          A different reference changes every moment arm r, so it changes the terms on the left. The
          physical force answer remains the same. In motion, the right side also gains the
          translation term when the reference is not CoM.
        </p>
        <app-solver-math [equation]="momentExpansion" />
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
      <p class="caption">
        The moment symbol sits beside the x/y axes because positive M_z is defined by that frame.
      </p>
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
        <summary>Sum of Forces</summary>
        <p>Right is positive x and up is positive y in this example.</p>
        <app-solver-math [equation]="exampleFx" />
        <app-solver-math [equation]="exampleFy" />
      </details>
      <details class="subsection" open>
        <summary>Sum of Moments</summary>
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
          The blue ring is the selected reference. The dashed steps show r_x and r_y from that point
          to P, which are the moment-arm components for F_1.
        </p>
        <app-solver-diagram
          [diagram]="referenceDiagram()"
          [label]="'Free-body diagram with moments about ' + referenceLabel()"
        />
        <app-solver-math [equation]="referenceDistances()" />
        <app-solver-math [equation]="momentEquation()" />
        <app-solver-math [equation]="crossProduct()" />
        <p class="caption">
          Move the reference to see which force arms become zero and how the symbolic z-moment
          equation changes. This example is static, so the right side remains zero.
        </p>
      </details>
    </details>

    <details class="definitionStep">
      <summary>Optional: See the Accelerating-Body Form</summary>
      <app-solver-math [equation]="dynamicAtCom" />
      <p>
        When taking moments about a point other than CoM, use the translated moment equation shown
        in the first section.
      </p>
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
  protected readonly initialDiagram = this.exampleDiagram('A', false);
  protected readonly referenceDiagram = computed(() => this.exampleDiagram(this.reference(), true));
  protected readonly referenceLabel = computed(
    () => this.referenceOptions.find((option) => option.id === this.reference())!.label
  );
  protected readonly referenceDistances = computed(() => {
    const reference = this.point(this.reference());
    return String.raw`r_{P/${this.reference()},x}=${this.number(135 - reference.x)},\qquad r_{P/${this.reference()},y}=${this.number(50 - reference.y)}`;
  });
  protected readonly crossProduct = computed(
    () =>
      String.raw`(\vec r_{P/${this.reference()}}\times\vec F_1)_z=r_{P/${this.reference()},x}F_{1y}-r_{P/${this.reference()},y}F_{1x}`
  );
  protected readonly momentEquation = computed(() => this.momentFor(this.reference()));
  protected readonly staticBalance = String.raw`\sum\vec F=\vec0,\qquad\sum\vec M_O=\vec0`;
  protected readonly forceComponents = String.raw`\begin{aligned}\sum F_x&=0\\\sum F_y&=0\\\sum F_z&=0\end{aligned}`;
  protected readonly momentComponents = String.raw`\begin{aligned}\sum M_{O,x}&=0\\\sum M_{O,y}&=0\\\sum M_{O,z}&=0\end{aligned}`;
  protected readonly dynamicAtCom = String.raw`\sum\vec F=m\vec a_{\mathrm{CoM}},\qquad\sum\vec M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\vec\alpha`;
  protected readonly dynamicAtReference = String.raw`\sum\vec M_O=I_{\mathrm{CoM}}\vec\alpha+\vec r_{\mathrm{CoM}/O}\times m\vec a_{\mathrm{CoM}}`;
  protected readonly momentExpansion = String.raw`(\vec r\times\vec F)_z=r_xF_y-r_yF_x`;
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
      symbol: String.raw`\vec r_{P/O}`,
      meaning: 'Position vector from the chosen moment reference O to P.',
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

  private momentFor(reference: ReferenceId) {
    const name = reference === 'CoM' ? '\\mathrm{CoM}' : reference;
    const terms: Record<ReferenceId, string> = {
      A: String.raw`r_{B/A,x}B_y-r_{B/A,y}B_x+r_{P/A,x}F_{1y}-r_{P/A,y}F_{1x}-r_{\mathrm{CoM}/A,x}W_{AB}`,
      CoM: String.raw`r_{A/\mathrm{CoM},x}A_y-r_{A/\mathrm{CoM},y}A_x+r_{B/\mathrm{CoM},x}B_y-r_{B/\mathrm{CoM},y}B_x+r_{P/\mathrm{CoM},x}F_{1y}-r_{P/\mathrm{CoM},y}F_{1x}`,
      B: String.raw`r_{A/B,x}A_y-r_{A/B,y}A_x+r_{P/B,x}F_{1y}-r_{P/B,y}F_{1x}-r_{\mathrm{CoM}/B,x}W_{AB}`,
    };
    return String.raw`\sum M_{${name},z}=${terms[reference]}=0`;
  }

  private exampleDiagram(reference: ReferenceId, showArms: boolean): Diagram {
    const from = this.point(reference);
    const target = this.point('P');
    const loadLines: DiagramLine[] = [
      { from: this.point('A'), to: { x: -55, y: 0 }, label: 'Ax' },
      { from: this.point('A'), to: { x: 0, y: 65 }, label: 'Ay' },
      { from: this.point('B'), to: { x: 245, y: 70 }, label: 'Bx' },
      { from: this.point('B'), to: { x: 190, y: 135 }, label: 'By' },
      { from: this.point('CoM'), to: { x: 95, y: -35 }, label: 'W_AB' },
      { from: this.point('P'), to: { x: 175, y: 105 }, label: 'F_1' },
    ].map((line) => ({ ...line, arrow: true, color: 'var(--warning)', width: 1.7 }));
    const armLines: DiagramLine[] = showArms
      ? [
          {
            from,
            to: { x: target.x, y: from.y },
            label: 'r_x',
            dashed: true,
            arrow: true,
            color: 'var(--success)',
            width: 1.4,
            midpointLabel: true,
          },
          {
            from: { x: target.x, y: from.y },
            to: target,
            label: 'r_y',
            dashed: true,
            arrow: true,
            color: 'var(--brand)',
            width: 1.4,
            midpointLabel: true,
          },
        ].filter((line) => Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y) > 1e-8)
      : [];
    return {
      axisMomentLabel: `+M_z @ ${reference}`,
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
      lines: [...loadLines, ...armLines],
    };
  }
}
