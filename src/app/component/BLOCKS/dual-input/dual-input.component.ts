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

  protected isField1MouseOver: boolean = false;
  protected isField1Focused: boolean = false;
  private showField1Overlay: boolean = false;
  private lastShowField1Overlay: boolean = false;

  protected isField2MouseOver: boolean = false;
  protected isField2Focused: boolean = false;
  private showField2Overlay: boolean = false;
  private lastShowField2Overlay: boolean = false;

  protected updateOverlay() {
    if (this.disabled()) {
      this.showField1Overlay = false;
      this.showField2Overlay = false;
      return;
    }

    this.showField1Overlay = this.isField1MouseOver || this.isField1Focused;
    const emitterOutputID = this.emitterOutputID();
    if (this.lastShowField1Overlay != this.showField1Overlay) {
      if (this.showField1Overlay) {
        this.field1Entry.emit(emitterOutputID);
      } else {
        this.field1Entry.emit(-2);
      }
    }
    this.lastShowField1Overlay = this.showField1Overlay;

    this.showField2Overlay = this.isField2MouseOver || this.isField2Focused;
    if (this.lastShowField2Overlay != this.showField2Overlay) {
      if (this.showField2Overlay) {
        this.field2Entry.emit(emitterOutputID);
      } else {
        this.field2Entry.emit(-2);
      }
    }
    this.lastShowField2Overlay = this.showField2Overlay;
  }
}
