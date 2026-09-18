import { Component, computed, input, signal } from '@angular/core';
import { Diagram, SolverDiagramComponent } from './solver-diagram.component';
import { SolverMathComponent } from './solver-math.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

@Component({
  selector: 'app-force-balance',
  imports: [SolverDiagramComponent, SolverMathComponent, SegmentedComponent],
  template: `
    <div class="balanceLayout">
      <figure>
        <h4>1 · Isolate {{ name() }}</h4>
        <app-solver-diagram [diagram]="sketch()" [label]="'Free-body diagram of ' + name()" />
        <figcaption>
          All loads acting on this body · {{ assumed() ? 'assumed' : 'solved' }} directions
        </figcaption>
        @if (diagram().note) {
          <p>{{ diagram().note }}</p>
        }
        <segmented-block
          [dropdown]="true"
          label="Read the FBD"
          [options]="options()"
          [selected]="selected()"
          (selectedChange)="selected.set($event)"
        />
        <p aria-live="polite">{{ hint() }}</p>
        <ng-content />
      </figure>
      <div class="equations">
        <h4>2 · Write the {{ equations().length }} Balance Equations</h4>
        <p>Use the arrow labels in the diagram. Add their signed contributions on the left.</p>
        @for (equation of equations(); track $index) {
          <div
            class="equationStep"
            [class.selected]="selected() === $index + 1"
            [attr.data-balance-axis]="$index"
          >
            <strong [attr.data-equation-number]="startRow() + $index + 1"
              >({{ startRow() + $index + 1 }}) {{ equation.label }}</strong
            >
            <app-solver-math [equation]="equation.symbolic" />
          </div>
        }
        <p>
          {{
            dynamic()
              ? 'The right side is the required inertia from this sample’s motion.'
              : 'In static equilibrium, each balance equals zero.'
          }}
        </p>
        @if (equations().length === 2) {
          <p>The ideal slider block has no independent moment equation.</p>
        }
        @if (!assumed()) {
          <p>
            Equations retain your chosen positive directions. A negative answer reverses its assumed
            arrow in this solved view.
          </p>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        container-type: inline-size;
      }
      figure {
        margin: 0;
        min-width: 0;
      }
      h4 {
        font-size: 15px;
        color: var(--text-strong);
        margin: 12px 0;
      }
      p,
      figcaption {
        font-size: 12px;
        color: var(--text-secondary);
        margin: 8px 0;
      }
      figcaption {
        text-align: center;
      }
      .equations {
        min-width: 0;
      }
      .equationStep {
        border-left: 3px solid var(--border-rule);
        padding: 8px 12px;
        margin: 12px 0;
        border-radius: var(--border-radius);
      }
      .equationStep.selected {
        border-color: var(--warning);
        background: var(--warning-bg);
      }
      strong {
        font-size: 12px;
        color: var(--text-strong);
      }
      @container (min-width: 650px) {
        .balanceLayout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 24px;
          align-items: start;
        }
        figure {
          position: sticky;
          top: 15px;
        }
      }
    `,
  ],
})
export class ForceBalanceComponent {
  readonly diagram = input.required<Diagram>();
  readonly startRow = input(0);
  readonly name = input.required<string>();
  readonly equations = input.required<{ label: string; symbolic: string }[]>();
  readonly assumed = input(true);
  readonly dynamic = input(false);
  readonly reference = input('CoM');
  protected readonly selected = signal(0);
  protected readonly options = computed(() => [
    'All Loads',
    'X Balance',
    'Y Balance',
    ...(this.equations().length === 3 ? ['Moment Balance'] : []),
  ]);
  protected readonly sketch = computed<Diagram>(() => ({
    ...this.diagram(),
    lines: this.diagram().lines.map((line) =>
      !this.selected() || !line.balanceAxes
        ? line
        : {
            ...line,
            color: line.balanceAxes.includes(this.selected() - 1)
              ? 'var(--warning)'
              : 'var(--text-tertiary)',
          }
    ),
  }));
  protected readonly hint = computed(
    () =>
      [
        `Start with the complete free-body diagram, then read its ${this.equations().length === 3 ? 'X, Y, and moment' : 'X and Y'} balances. Arrow lengths are schematic.`,
        'Orange arrows supply x components along the displayed +x axis. The opposite direction is −x.',
        'Orange arrows supply y components along the displayed +y axis. The opposite direction is −y.',
        `Take moments about ${this.reference()} (blue ring): use rₓFᵧ − rᵧFₓ and add couples. Gray forces have zero moment here: their line of action passes through the reference.`,
      ][this.selected()]
  );
}
