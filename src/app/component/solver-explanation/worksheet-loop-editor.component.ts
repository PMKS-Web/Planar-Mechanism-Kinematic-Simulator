import { Component, computed, input, output } from '@angular/core';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

@Component({
  selector: 'app-worksheet-loop-editor',
  imports: [SegmentedComponent, ButtonComponent],
  template: `
    <segmented-block
      [dropdown]="true"
      label="Loop Path"
      [options]="labels()"
      [selected]="selected()"
      [disabledAt]="disabledAt()"
      (selectedChange)="choose($event)"
    ></segmented-block>
    <button-block [click]="reverseDirection">Reverse Loop</button-block>
    <p>
      Choose a closed path. Dependent paths are unavailable because the other loops already supply
      those equations.
    </p>
    @if (limited()) {
      <p>
        The menu shows a bounded selection for this large mechanism, including the current loops.
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: grid;
        gap: var(--card-gap);
        margin-block: var(--card-gap);
      }
      p {
        margin: 0;
        font-size: 12px;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class WorksheetLoopEditorComponent {
  readonly path = input.required<string>();
  readonly options = input.required<{ value: string; label: string; disabled: boolean }[]>();
  readonly limited = input(false);
  readonly applied = output<string>();
  readonly reversed = output<void>();
  protected readonly labels = computed(() => this.options().map((o) => o.label));
  protected readonly selected = computed(() =>
    this.options().findIndex((o) => o.value === this.path())
  );
  protected readonly disabledAt = computed(() =>
    this.options().flatMap((o, i) => (o.disabled ? [i] : []))
  );
  protected choose(index: number) {
    const option = this.options()[index];
    if (option && !option.disabled) this.applied.emit(option.value);
  }
  protected readonly reverseDirection = () => this.reversed.emit();
}
