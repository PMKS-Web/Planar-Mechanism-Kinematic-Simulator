import { Component, computed, effect, input, output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

@Component({
  selector: 'app-worksheet-loop-editor',
  imports: [InputComponent, ButtonComponent],
  template: `
    <input-block
      [formGroup]="form"
      _formControl="path"
      stacked
      wide
      tooltip="List joint IDs in order, separated by spaces or arrows. Repeat the first joint to close the path."
      >Loop Path</input-block
    >
    <div class="actions">
      <button-block [click]="apply" [disabled]="!!reason()">Apply Path</button-block>
      <button-block [click]="reverseDirection">Reverse Loop</button-block>
    </div>
    @if (reason()) {
      <p class="refusal" role="status">{{ reason() }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        margin-block: var(--card-gap);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--card-gap);
      }
      .actions button-block {
        flex: 1;
        min-width: 120px;
      }
      .refusal {
        color: var(--text-secondary);
        background: var(--warning-bg);
        border-left: 2px solid var(--warning);
        padding: var(--card-gap);
        font-size: 12px;
      }
    `,
  ],
})
export class WorksheetLoopEditorComponent {
  readonly path = input.required<string>();
  readonly validate = input.required<(path: string) => string | undefined>();
  readonly applied = output<string>();
  readonly reversed = output<void>();
  protected readonly form = new FormGroup({ path: new FormControl('', { nonNullable: true }) });
  private readonly draft = toSignal(this.form.controls.path.valueChanges, { initialValue: '' });
  protected readonly reason = computed(() => this.validate()(this.draft()));
  protected readonly apply = () => {
    if (!this.reason()) this.applied.emit(this.draft());
  };
  protected readonly reverseDirection = () => this.reversed.emit();
  constructor() {
    effect(() => this.form.controls.path.setValue(this.path()));
  }
}
