import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';

@Component({
  selector: 'toggle-block',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatIcon,
    MatTooltip,
    MatFormField,
    MatInput,
    MatSlideToggle,
  ],
})
export class ToggleComponent {
  readonly tooltip = input<string>();
  readonly formGroup = input.required<FormGroup>();
  readonly _formControl = input.required<string>();
  /** Bulk forms can name the control and state that its selected values differ. */
  readonly dataAction = input<string>();
  readonly mixed = input<boolean>(false);

  /**
   * Grays the switch out, like `radio-block`'s input of the same name.
   *
   * `disableInput` beside it is a different question -- that one is about the
   * optional number field this block can carry, not about the switch.
   */
  readonly disabled = input<boolean>(false);
  /**
   * Sized to sit on a subtitle's line rather than on a panel row of its own:
   * a smaller label, a smaller help mark, and the switch scaled to the line.
   *
   * The analysis panel's "compare with before the drag" switch is the one of
   * these. It used to get this by naming `#toggle-block`'s insides from its
   * own stylesheet.
   */
  readonly compact = input<boolean>(false);

  readonly addInput = input<boolean>(false);
  readonly _formControlForInput = input<string | undefined>(undefined);
  readonly disableInput = input<boolean>(false);

  /**
   * Pointed at or typed in, for a caller that draws the field's meaning on the
   * canvas. The Slider toggle carries the slot's angle, and an angle is the
   * kind of number far easier to show than to describe; this is what replaced
   * the sentence that used to sit under it.
   *
   * A boolean, unlike `input-block`'s numeric version. That one identifies
   * *which* of several fields is being pointed at and reports `-2` for none —
   * which means its default id is also `-2`, so a caller who forgets to set one
   * gets "nothing" on the way in and "nothing" on the way out, and no overlay
   * ever appears. This control has one field. It can just say so.
   */
  readonly fieldEntry = output<boolean>();

  private mouseOver = false;
  private focused = false;
  private showing = false;

  protected setMouseOver(over: boolean): void {
    this.mouseOver = over;
    this.updateOverlay();
  }

  protected setFocused(focused: boolean): void {
    this.focused = focused;
    this.updateOverlay();
  }

  private updateOverlay(): void {
    const wants = this.mouseOver || this.focused;
    if (wants === this.showing) return;
    this.showing = wants;
    this.fieldEntry.emit(wants);
  }
}
