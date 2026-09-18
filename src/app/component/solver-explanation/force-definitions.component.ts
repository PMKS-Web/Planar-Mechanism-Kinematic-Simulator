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
      label="Example two-joint bar AB with reactions, weight W_ab at its center, and force F_1 at P"
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
    <app-solver-math [equation]="momentExpansion" />
    <app-solver-math [equation]="momentComponents" />
    <p>
      Position vectors and forces lie in the x–y plane: r_z = 0 and F_z = 0. Their cross products
      have zero x and y components, so those moment equations reduce to 0 = 0. Only the z equation
      supplies a balance to solve. The arrow over M denotes a vector; positive z points out of the
      page and counterclockwise is positive.
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
  protected readonly moment = String.raw`\sum\vec M_O=\vec0`;
  protected readonly momentExpansion = String.raw`\vec r\times\vec F=\begin{bmatrix}r_y\,0-0\,F_y\\0\,F_x-r_x\,0\\r_xF_y-r_yF_x\end{bmatrix}`;
  protected readonly momentComponents = String.raw`\begin{aligned}\sum M_{O,x}&=0=0\\\sum M_{O,y}&=0=0\\\sum M_{O,z}&=\sum(r_xF_y-r_yF_x)=0\end{aligned}`;
  protected readonly cross = String.raw`(\vec r_{P/O}\times\vec F)_z=r_xF_y-r_yF_x`;
  protected readonly dynamic = String.raw`\sum F_x=ma_{\mathrm{CoM},x},\quad\sum F_y=ma_{\mathrm{CoM},y},\quad\sum M_{\mathrm{CoM}}=I_{\mathrm{CoM}}\alpha`;
  protected readonly example: Diagram = {
    points: [
      { x: 0, y: 0, label: 'A' },
      { x: 200, y: 0, label: 'B' },
      { x: 150, y: 0, label: 'P' },
      { x: 100, y: 0, label: 'CoM' },
    ],
    outlines: [
      [
        { x: -10, y: -12 },
        { x: 210, y: -12 },
        { x: 210, y: 12 },
        { x: -10, y: 12 },
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
      { from: { x: 100, y: 0 }, to: { x: 100, y: -65 }, label: 'W_ab' },
      { from: { x: 150, y: 0 }, to: { x: 195, y: 75 }, label: 'F_1' },
    ].map((l) => ({ ...l, arrow: true, color: 'var(--warning)', width: 1.7 })),
  };
}
