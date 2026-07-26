import { booleanAttribute, Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'input-block',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class InputComponent {
  @Input() unit: string | undefined;
  /** Widens the field for values whose unit suffix does not fit the default. */
  @Input({ transform: booleanAttribute }) wide: boolean = false;
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
}
