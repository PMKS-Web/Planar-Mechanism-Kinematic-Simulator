import { Component, Input, ChangeDetectionStrategy, input, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, FormsModule, ReactiveFormsModule, MatFormField, MatInput],
})
export class DualInputComponent {
  readonly tooltip = input.required<string>();
  readonly formControl1 = input.required<string>();
  readonly label1 = input<string>('X');
  readonly label2 = input<string>('Y');
  readonly formControl2 = input.required<string>();
  readonly formGroup = input.required<FormGroup>();
  @Input() formSubGroup: string | undefined;
  readonly disabled = input<boolean>(false);
  readonly field1Entry = output<number>();
  readonly field2Entry = output<number>();
  readonly emitterOutputID = input<number>(-2);

  isField1MouseOver: boolean = false;
  isField1Focused: boolean = false;
  showField1Overlay: boolean = false;
  lastShowField1Overlay: boolean = false;

  isField2MouseOver: boolean = false;
  isField2Focused: boolean = false;
  showField2Overlay: boolean = false;
  lastShowField2Overlay: boolean = false;

  updateOverlay() {
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

  constructor() {}
}
