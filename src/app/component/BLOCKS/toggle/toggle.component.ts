import {
  booleanAttribute,
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { AbstractControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { FieldOverlay } from '../field-overlay';

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
   * Grays the switch out and refuses it, like `radio-block`'s input of the same
   * name. It reaches the switch through the form control rather than a
   * `[disabled]` binding -- see `holdDisabled`.
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
  /**
   * The switch's accessible name, where the block's own label is hidden or the
   * row says it some other way.
   *
   * It has to be an input rather than an `aria-label` on the tag: the host is
   * a role-less custom element, so an attribute there names nothing, and the
   * `mat-slide-toggle` inside is what carries the `switch` role.
   */
  readonly ariaLabel = input<string>();
  /**
   * The switch alone: no label, no help mark, no spacer, and scaled to sit on
   * a row that has already said what it is.
   *
   * The synthesis panel's requirement rows and its driver row are these. They
   * were reaching into this block's private ids from their own stylesheets to
   * get it, which is the coupling `cell` and `compact` were added to remove
   * elsewhere.
   */
  readonly bare = input<boolean, unknown>(false, { transform: booleanAttribute });

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

  /**
   * Shared with the other three field blocks. This one used to emit only on a
   * change, which is the bug `FieldOverlay` describes: after a committed edit
   * the canvas has dropped the overlay, and pointing at the same field again
   * said nothing.
   */
  private readonly overlay = new FieldOverlay<boolean>(
    (value) => this.fieldEntry.emit(value),
    () => true,
    () => false,
    () => !this.disabled()
  );

  /** The control this block disabled, so it hands back exactly that and nothing else. */
  private disabledHere?: AbstractControl;

  constructor() {
    effect(() => {
      const control = this.formGroup().get(this._formControl());
      const wanted = this.disabled();
      untracked(() => this.holdDisabled(control, wanted));
    });
    // The form outlives the block -- the Edit panel keeps one link form whichever
    // link is selected -- so a control still disabled when the block goes would
    // come back disabled under the next block drawn for it.
    inject(DestroyRef).onDestroy(() => this.holdDisabled(null, false));
  }

  protected setMouseOver(over: boolean): void {
    this.overlay.hover(over);
  }

  protected setFocused(focused: boolean): void {
    this.overlay.focus(focused);
  }

  /**
   * Disable the switch by disabling its control, and undo only that.
   *
   * A reactive form owns its controls' disabled state and pushes it onto the
   * switch whenever it sets a control up, so a `[disabled]` binding beside
   * `formControlName` lost to it: a switch drawn disabled was only painted
   * that way by this block's stylesheet, and still turned from the keyboard.
   * Angular warned once for every switch for asking.
   *
   * Handing back only what it took is the rule `freezePoseBoundFields` in the
   * Edit panel keeps too. The multi-selection panel disables most of its
   * switches' controls itself, for its own reasons, and passes that on as
   * `disabled`; those are not the block's to enable again.
   */
  private holdDisabled(control: AbstractControl | null, wanted: boolean): void {
    const held = this.disabledHere;
    if (held && (held !== control || !wanted)) {
      this.disabledHere = undefined;
      if (held.disabled) held.enable({ emitEvent: false });
    }
    if (wanted && control?.enabled) {
      control.disable({ emitEvent: false });
      this.disabledHere = control;
    }
  }
}
