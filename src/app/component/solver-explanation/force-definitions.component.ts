import { Component } from '@angular/core';
import { SolverDiagramComponent, Diagram } from './solver-diagram.component';
import { SolverMathComponent } from './solver-math.component';

/** A mechanism-independent, layered introduction to planar free-body diagrams. */
@Component({
  selector: 'app-force-definitions',
  imports: [SolverDiagramComponent, SolverMathComponent],
  template: `
    <details class="definitionStep" open>
      <summary>1 · Start with the General Balance Equations</summary>
      <h3>Every planar rigid body supplies three balances</h3>
      <app-solver-math [equation]="generalBalance" />
      <p>
        Resolve the vector force balance into x and y. A moment from planar forces only has a z
        component, so the x and y moment balances are 0 = 0.
      </p>
      <app-solver-math [equation]="generalComponents" />
      <details class="subsection">
        <summary>Why only the z moment equation remains</summary>
        <app-solver-math [equation]="momentExpansion" />
        <app-solver-math [equation]="momentComponents" />
        <p>
          Position vectors and forces lie in the x–y plane: r_z = 0 and F_z = 0. Positive z points
          out of the page, so positive M_z is counterclockwise.
        </p>
      </details>
    </details>

    <details class="definitionStep">
      <summary>2 · Variables in This Example</summary>
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
      <summary>3 · Build a Free-Body Diagram</summary>
      <h3>Isolate the slanted link AB</h3>
      <p>
        Replace the two connections with reactions, keep the weight at CoM, and show the applied
        force at P. Orange arrows are assumed directions, not calculated answers.
      </p>
      <app-solver-diagram
        [diagram]="example"
        label="Slanted two-joint bar AB with reactions, weight W_ab at its center, force F_1 at P, and r_x and r_y from A to P"
      />
      <p class="caption">
        The dashed green and blue steps start at A and end at P. They are the signed r_x and r_y
        components used for the moment of F_1 about A.
      </p>
      <details class="subsection" open>
        <summary>Use This FBD to Fill the Three Equations</summary>
        <details class="equationExample" open>
          <summary>Sum of Forces in x</summary>
          <p>Read every horizontal component from the diagram. Right is positive x.</p>
          <app-solver-math [equation]="exampleFx" />
        </details>
        <details class="equationExample" open>
          <summary>Sum of Forces in y</summary>
          <p>Read every vertical component from the diagram. Up is positive y.</p>
          <app-solver-math [equation]="exampleFy" />
        </details>
        <details class="equationExample" open>
          <summary>Sum of Moments about A in z</summary>
          <p>Forces at A have no arm. Use r_xF_y − r_yF_x for forces at B, P, and CoM.</p>
          <app-solver-math [equation]="exampleMz" />
          <app-solver-math [equation]="cross" />
        </details>
      </details>
    </details>

    <details class="definitionStep">
      <summary>When the Body Is Accelerating</summary>
      <app-solver-math [equation]="dynamic" />
      <p>
        These moment equations use the center of mass (CoM). Other reference points require the
        additional moment of m a at CoM.
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
      .subsection,
      .equationExample {
        margin-left: 12px;
      }
      .equationExample {
        border-left: 2px solid var(--warning);
        padding-left: 12px;
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
    `,
  ],
})
export class ForceDefinitionsComponent {
  protected readonly generalBalance = String.raw`\sum\vec F=\vec0,\qquad\sum\vec M_O=\vec0`;
  protected readonly generalComponents = String.raw`\sum F_x=0,\qquad\sum F_y=0,\qquad\sum M_{O,z}=0`;
  protected readonly momentExpansion = String.raw`\vec r\times\vec F=\begin{bmatrix}r_y\,0-0\,F_y\\0\,F_x-r_x\,0\\r_xF_y-r_yF_x\end{bmatrix}`;
  protected readonly momentComponents = String.raw`\begin{aligned}\sum M_{O,x}&=0=0\\\sum M_{O,y}&=0=0\\\sum M_{O,z}&=\sum(r_xF_y-r_yF_x)=0\end{aligned}`;
  protected readonly cross = String.raw`(\vec r_{P/A}\times\vec F_1)_z=r_{P/A,x}F_{1y}-r_{P/A,y}F_{1x}`;
  protected readonly exampleFx = String.raw`\sum F_x=-A_x+B_x+F_{1x}=0`;
  protected readonly exampleFy = String.raw`\sum F_y=A_y+B_y+F_{1y}-W_{AB}=0`;
  protected readonly exampleMz = String.raw`\sum M_{A,z}=r_{B/A,x}B_y-r_{B/A,y}B_x+r_{P/A,x}F_{1y}-r_{P/A,y}F_{1x}-r_{\mathrm{CoM}/A,x}W_{AB}=0`;
  protected readonly dynamic = String.raw`\sum F_x=ma_{\mathrm{CoM},x},\quad\sum F_y=ma_{\mathrm{CoM},y},\quad\sum M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\alpha`;
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
      symbol: String.raw`r_{P/A,x},\ r_{P/A,y}`,
      meaning: 'Signed x and y components from A to P.',
    },
    {
      symbol: String.raw`r_{\mathrm{CoM}/A,x}`,
      meaning: 'Signed horizontal component from A to CoM.',
    },
  ];
  protected readonly example: Diagram = {
    axisMomentLabel: '+M_z',
    points: [
      { x: 0, y: 0, label: 'A' },
      { x: 190, y: 70, label: 'B' },
      { x: 135, y: 50, label: 'P' },
      { x: 95, y: 35, label: 'CoM' },
    ],
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
    lines: [
      { from: { x: 0, y: 0 }, to: { x: -55, y: 0 }, label: 'Ax' },
      { from: { x: 0, y: 0 }, to: { x: 0, y: 65 }, label: 'Ay' },
      { from: { x: 190, y: 70 }, to: { x: 245, y: 70 }, label: 'Bx' },
      { from: { x: 190, y: 70 }, to: { x: 190, y: 135 }, label: 'By' },
      { from: { x: 95, y: 35 }, to: { x: 95, y: -35 }, label: 'W_AB' },
      { from: { x: 135, y: 50 }, to: { x: 175, y: 105 }, label: 'F_1' },
      {
        from: { x: 0, y: 0 },
        to: { x: 135, y: 0 },
        label: 'r_x',
        dashed: true,
        arrow: true,
        color: 'var(--success)',
        width: 1.4,
        midpointLabel: true,
      },
      {
        from: { x: 135, y: 0 },
        to: { x: 135, y: 50 },
        label: 'r_y',
        dashed: true,
        arrow: true,
        color: 'var(--brand)',
        width: 1.4,
        midpointLabel: true,
      },
    ].map((line) =>
      line.color ? line : { ...line, arrow: true, color: 'var(--warning)', width: 1.7 }
    ),
  };
}
