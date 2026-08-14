import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatButtonToggleGroup, MatButtonToggle } from '@angular/material/button-toggle';

@Component({
  selector: 'radio-block',
  templateUrl: './radio.component.html',
  styleUrls: ['./radio.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIcon,
    MatTooltip,
    FormsModule,
    ReactiveFormsModule,
    MatButtonToggleGroup,
    MatButtonToggle,
  ],
})
export class RadioComponent {
  @Input() tooltip: string | undefined;
  @Input() option1: string | undefined;
  @Input() option2: string | undefined;
  @Input() option3: string | undefined;
  @Input() _formControl!: string;
  @Input() formGroup!: FormGroup;
  @Input() disabled: boolean = false;
}
