import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/**
 * A bare field with a derived-vs-typed marker, and nothing else.
 *
 * It renders the same `#input-block` / `customInputForm` structure as
 * input-block, so every style, focus animation and behavior of the app's
 * fields applies to it by construction — it *is* one of them, minus the
 * label row, plus the state suffix: a hollow dot for a value that follows
 * the shape, a filled one with a clear for a value somebody typed.
 *
 * Exists because the centre-of-mass pair needs the marker inside each field
 * and the shared dual-input could not take it without a template rework;
 * this is the smaller honest component.
 */
@Component({
  selector: 'state-input',
  standalone: true,
  imports: [ReactiveFormsModule, MatFormField, MatInput, MatSuffix],
  template: `
    <div id="input-block" class="state-input-host">
      <div class="row" [formGroup]="formGroup">
        <mat-form-field
          class="customInputForm"
          (click)="field.select()"
          (mouseenter)="hovered.emit(true)"
          (mouseleave)="hovered.emit(false)"
        >
          <input
            matInput
            class="customInput"
            type="text"
            #field
            (keyup.enter)="field.blur()"
            [formControlName]="_formControl"
          />
          @if (state !== 'none') {
            <span matTextSuffix class="state-suffix">
              <span class="state-dot" [class.filled]="state === 'custom'"></span>
              @if (state === 'custom') {
                <button
                  type="button"
                  class="state-clear"
                  [title]="clearTitle"
                  (click)="cleared.emit(); $event.stopPropagation()"
                >
                  &#10005;
                </button>
              }
            </span>
          }
        </mat-form-field>
      </div>
    </div>
  `,
  styleUrl: './state-input.component.scss',
})
export class StateInputComponent {
  @Input() formGroup!: FormGroup;
  @Input() _formControl!: string;
  @Input() state: 'none' | 'auto' | 'custom' = 'none';
  @Input() clearTitle = 'Back to the shape';
  @Output() cleared = new EventEmitter<void>();
  /** Fires on pointer enter/leave, for panels that preview on the grid. */
  @Output() hovered = new EventEmitter<boolean>();
}
