import { Component, Input, ChangeDetectionStrategy, input } from '@angular/core';
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
  readonly tooltip = input<string>();
  readonly option1 = input<string>();
  readonly option2 = input<string>();
  @Input() option3: string | undefined;
  readonly _formControl = input.required<string>();
  readonly formGroup = input.required<FormGroup>();
  readonly disabled = input<boolean>(false);
}
