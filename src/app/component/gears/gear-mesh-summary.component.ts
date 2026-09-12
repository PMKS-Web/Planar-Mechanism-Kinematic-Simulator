import { Component, input, output } from '@angular/core';
import { Gear } from '../../model/gear';
import { ButtonComponent } from '../BLOCKS/button/button.component';

@Component({
  selector: 'app-gear-mesh-summary',
  imports: [ButtonComponent],
  template: `
    <p>{{ a().name || a().id }} ({{ a().teeth }}T) → {{ b().name || b().id }} ({{ b().teeth }}T)</p>
    <p>Ratio: {{ ratio() }} · Opposite direction</p>
    <p>
      Center distance: {{ number(actual()) }} {{ unit() }} · Required: {{ number(required()) }}
      {{ unit() }}
    </p>
    @for (issue of diagnostics(); track $index) {
      <p class="invalid" role="status">{{ issue }}</p>
    }
    @if (!diagnostics().length) {
      <p>Compatible external mesh</p>
    }
    @if (canCommit()) {
      <button-block [click]="commit" [disabled]="disabled() || diagnostics().length > 0" icon="link"
        >Create Mesh</button-block
      >
    }
  `,
  styles: [
    `
      p {
        font-size: 12px;
        white-space: normal;
        overflow-wrap: anywhere;
        color: var(--text-secondary);
      }
      .invalid {
        color: var(--danger-dark);
      }
    `,
  ],
})
export class GearMeshSummaryComponent {
  readonly a = input.required<Gear>();
  readonly b = input.required<Gear>();
  readonly actual = input.required<number>();
  readonly required = input.required<number>();
  readonly unit = input('cm');
  readonly diagnostics = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly canCommit = input(false);
  readonly committed = output<void>();
  protected number(value: number) {
    return Number(value.toPrecision(8));
  }
  protected ratio() {
    return Number((-this.a().teeth / this.b().teeth).toPrecision(8));
  }
  protected commit = () => this.committed.emit();
}
