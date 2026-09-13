import {
  booleanAttribute,
  Component,
  Input,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { FieldOverlay } from '../field-overlay';

let nextInputId = 0;

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, FormsModule, ReactiveFormsModule, MatFormField, MatInput],
})
export class DualInputComponent {
  protected readonly labelId = `pmks-dual-input-label-${nextInputId++}`;

  /** Speak the quantity, including where the compact caption is only a glyph. */
  protected fieldName(label: string): string {
    const names: Record<string, string> = {
      L: 'Length',
      D: 'Distance',
      M: 'Magnitude',
      '⊾': 'Angle',
    };
    return names[label] ?? label;
  }

  readonly tooltip = input.required<string>();
  readonly formControl1 = input.required<string>();
  readonly label1 = input<string>('X');
  readonly label2 = input<string>('Y');
  readonly formControl2 = input.required<string>();
  readonly formGroup = input.required<FormGroup>();
  /** Optional mixed-value copy and test hooks for bulk-edit forms. */
  readonly placeholder1 = input<string>('');
  readonly placeholder2 = input<string>('');
  readonly dataField1 = input<string>();
  readonly dataField2 = input<string>();
  @Input() formSubGroup: string | undefined;
  /**
   * Drop the label/help header row: for a pair whose caption is provided by
   * the row above it (the mass panel's Center of Mass row owns the frame
   * picker, so the pair beneath carries only the fields).
   */
  readonly noHeader = input<boolean, unknown>(false, { transform: booleanAttribute });

  readonly disabled = input<boolean>(false);
  readonly field1Entry = output<number>();
  readonly field2Entry = output<number>();
  readonly emitterOutputID = input<number>(-2);

  /**
   * One per field, shared with the other three field blocks.
   *
   * This block used to mutate four booleans straight from the template and
   * emit only on a change -- the bug `FieldOverlay` describes, where a
   * dimension the canvas dropped on a committed edit never came back because
   * pointing at the same field again was a no-change.
   */
  private readonly overlays = [
    new FieldOverlay<number>(
      (value) => this.field1Entry.emit(value),
      () => this.emitterOutputID(),
      () => -2,
      () => !this.disabled()
    ),
    new FieldOverlay<number>(
      (value) => this.field2Entry.emit(value),
      () => this.emitterOutputID(),
      () => -2,
      () => !this.disabled()
    ),
  ];

  protected hover(field: 1 | 2, over: boolean): void {
    this.overlays[field - 1].hover(over);
  }

  protected focus(field: 1 | 2, focused: boolean): void {
    this.overlays[field - 1].focus(focused);
  }
}
