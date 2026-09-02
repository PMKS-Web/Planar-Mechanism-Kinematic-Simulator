import { Component, Input, ChangeDetectionStrategy, input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { SegmentedComponent } from '../segmented/segmented.component';

/**
 * A labeled pick-one bound to a reactive form control.
 *
 * The control holds the chosen option's index as a string -- '0', '1', '2' --
 * which is what every form in the app was built around when this was a
 * Material button toggle with `value="0"` on each button.
 */
@Component({
  selector: 'radio-block',
  templateUrl: './radio.component.html',
  styleUrls: ['./radio.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, SegmentedComponent],
})
export class RadioComponent {
  readonly tooltip = input<string>();
  readonly option1 = input<string>();
  readonly option2 = input<string>();
  @Input() option3: string | undefined;
  readonly _formControl = input.required<string>();
  readonly formGroup = input.required<FormGroup>();
  readonly disabled = input<boolean>(false);

  private cachedOptions: string[] = [];

  /** The labels, held so the pill is not handed a new array every pass. */
  get options(): string[] {
    const next = [this.option1() ?? '', this.option2() ?? '', this.option3].filter(
      (label): label is string => label !== undefined
    );
    if (next.join('\u0001') !== this.cachedOptions.join('\u0001')) this.cachedOptions = next;
    return this.cachedOptions;
  }

  get selectedIndex(): number {
    const value = Number(this.formGroup().get(this._formControl())?.value);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  choose(index: number): void {
    const control = this.formGroup().get(this._formControl());
    if (!control || control.value === String(index)) return;
    control.markAsDirty();
    control.setValue(String(index));
  }
}
