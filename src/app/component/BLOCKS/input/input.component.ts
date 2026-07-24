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
}
