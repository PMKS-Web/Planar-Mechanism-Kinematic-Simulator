import { Component } from '@angular/core';
import { SolverDiagramComponent, Diagram } from './solver-diagram.component';
import { SolverMathComponent } from './solver-math.component';

/** An illustrative isolated body, independent of the student's mechanism. */
@Component({
  selector: 'app-force-definitions',
  imports: [SolverDiagramComponent, SolverMathComponent],
  template: `
    <h3>Start with a Free-Body Diagram</h3>
    <p>
      Isolate one link. Replace its connections with reaction forces and show the applied loads.
    </p>
    <app-solver-diagram
      [diagram]="example"
      label="Example isolated link with reactions at A and B, weight at CoM, and an applied force at P"
    />
    <p class="caption">
      Illustrative link · the arrows are assumed directions, not calculated answers.
    </p>
    <h3>Two Force Equations</h3>
    <app-solver-math [equation]="force" />
    <p>Forces lie in the x–y plane. Resolve each force into horizontal and vertical components.</p>
    <app-solver-math [equation]="components" />
    <h3>One Moment Equation</h3>
    <app-solver-math [equation]="moment" />
    <p>
      Choose a point O and sum moments about it. For planar forces, moments always point along the z
      axis, perpendicular to the diagram. Counterclockwise is positive.
    </p>
    <app-solver-math [equation]="cross" />
    <p>
      A force whose line of action passes through O has zero moment. A pure couple contributes
      directly, regardless of O.
    </p>
    <p>
      <strong
        >Each rigid link supplies three equations: two force equations and one moment
        equation.</strong
      >
    </p>
    <details>
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
        margin-top: 20px;
      }
      p {
        font-size: 13px;
        line-height: 1.6;
        color: var(--text-secondary);
      }
      app-solver-diagram {
        max-width: 480px;
        margin: auto;
      }
      .caption {
        font-size: 11px;
        text-align: center;
      }
      details {
        border-top: 1px solid var(--border-rule);
        padding-top: 12px;
      }
      summary {
        cursor: pointer;
        color: var(--brand);
      }
    `,
  ],
})
export class ForceDefinitionsComponent {
  protected readonly force = String.raw`\sum\vec F=\vec0`;
  protected readonly components = String.raw`\sum F_x=0,\qquad\sum F_y=0`;
  protected readonly moment = String.raw`\sum M_O=0`;
  protected readonly cross = String.raw`(\vec r_{P/O}\times\vec F)_z=r_xF_y-r_yF_x`;
  protected readonly dynamic = String.raw`\sum F_x=ma_{\mathrm{CoM},x},\quad\sum F_y=ma_{\mathrm{CoM},y},\quad\sum M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\alpha`;
  protected readonly example: Diagram = {
    points: [
      { x: 0, y: 0, label: 'A' },
      { x: 200, y: 0, label: 'B' },
      { x: 100, y: 40, label: 'P' },
      { x: 100, y: 0, label: 'CoM' },
    ],
    outlines: [
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 100, y: 40 },
      ],
    ],
    framingPoints: [
      { x: -70, y: -90 },
      { x: 270, y: 120 },
    ],
    lines: [
      { from: { x: 0, y: 0 }, to: { x: -55, y: 0 }, label: 'Ax' },
      { from: { x: 0, y: 0 }, to: { x: 0, y: 65 }, label: 'Ay' },
      { from: { x: 200, y: 0 }, to: { x: 255, y: 0 }, label: 'Bx' },
      { from: { x: 200, y: 0 }, to: { x: 200, y: 65 }, label: 'By' },
      { from: { x: 100, y: 0 }, to: { x: 100, y: -65 }, label: 'W' },
      { from: { x: 100, y: 40 }, to: { x: 145, y: 100 }, label: 'F' },
    ].map((l) => ({ ...l, arrow: true, color: 'var(--warning)', width: 1.7 })),
  };
}
