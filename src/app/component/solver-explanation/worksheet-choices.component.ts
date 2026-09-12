import { Component, input, output } from '@angular/core';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

export interface WorksheetChoice {
  key: string;
  label: string;
  description: string;
  options: string[];
  selected: number;
}

@Component({
  selector: 'app-worksheet-choices',
  imports: [SegmentedComponent],
  template: `
    @for (choice of choices(); track choice.key) {
      <div class="choice" [attr.data-convention]="choice.label">
        <h4>{{ choice.label }}</h4>
        <segmented-block
          [attr.aria-label]="choice.label"
          [options]="choice.options"
          [selected]="choice.selected"
          (selectedChange)="chosen.emit({ key: choice.key, index: $event })"
        ></segmented-block>
        <p>{{ choice.description }}</p>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
        gap: var(--card-gap);
      }
      .choice {
        min-width: 0;
        padding-block: var(--card-gap);
        border-bottom: 1px solid var(--border-rule);
      }
      h4 {
        margin: 0 0 var(--card-gap);
        font-size: 13px;
        color: var(--text-strong);
      }
      p {
        margin: var(--card-gap) 0 0;
        font-size: 12px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class WorksheetChoicesComponent {
  readonly choices = input.required<WorksheetChoice[]>();
  readonly chosen = output<{ key: string; index: number }>();
}
