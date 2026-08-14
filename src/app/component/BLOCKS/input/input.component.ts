import {
  booleanAttribute,
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

@Component({
  selector: 'input-block',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatIcon,
    MatTooltip,
    MatFormField,
    MatInput,
    MatSuffix,
  ],
})
export class InputComponent {
  @Input() unit: string | undefined;
  /** Widens the field for values whose unit suffix does not fit the default. */
  @Input({ transform: booleanAttribute }) wide: boolean = false;
  /**
   * Put the label on its own line, with the field under it.
   *
   * For a label too long to share a line with its field -- "Moment of Inertia"
   * next to a value in kg&middot;cm&sup2; wants 239px of a 220px row, and one
   * of the two gets crushed. The panel already reads this way for Joint
   * Position and Center of Mass.
   */
  @Input({ transform: booleanAttribute }) stacked: boolean = false;
  @Input() tooltip: string | undefined;
  @Input() _formControl!: string;
  @Input() formGroup!: FormGroup;
  /**
   * Turns the static unit suffix into a picker sharing the field's fill, for
   * values whose unit the user chooses rather than types. Needs unitFormControl.
   */
  @Input() unitOptions: { value: string; label: string }[] | undefined;
  @Input() unitFormControl: string | undefined;

  get hasUnitSelect(): boolean {
    return !!this.unitOptions?.length && !!this.unitFormControl;
  }

  /**
   * Hovering or focusing this field asks the canvas to draw what it measures,
   * exactly as `dual-input-block` already does for link length and angle.
   *
   * Lifted here because a cylinder's axis is a single field, not half of a
   * pair: the ram's length and its angle are two unrelated numbers — the size
   * of the part and where it points — so they cannot share a row, and the
   * overlay is the whole reason the link's angle field is legible without one.
   * Silent unless a caller supplies an id, so every other `input-block` in the
   * app is untouched.
   */
  @Output() fieldEntry: EventEmitter<number> = new EventEmitter();
  @Input() emitterOutputID: number = -2;

  private mouseOver = false;
  private focused = false;
  private showing = false;

  updateOverlay(): void {
    const wants = this.mouseOver || this.focused;
    if (wants === this.showing) return;
    this.showing = wants;
    this.fieldEntry.emit(wants ? this.emitterOutputID : -2);
  }

  setMouseOver(over: boolean): void {
    this.mouseOver = over;
    this.updateOverlay();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.updateOverlay();
  }
}
