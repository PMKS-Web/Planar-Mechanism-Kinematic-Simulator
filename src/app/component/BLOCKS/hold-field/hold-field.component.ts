import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { LinkHold, RealLink } from '../../../model/link';
import { holdOf, holdableBar } from '../../../model/link-holds';
import { GridUtilsService } from '../../../services/grid-utils.service';
import { MechanismService } from '../../../services/mechanism.service';

/** One of the two values this block shows and can hold. */
type Which = 'length' | 'angle';

/**
 * A bar's length and angle, each with a padlock.
 *
 * The two used to share a row as `L` and `⊾`. Each now has a labeled field of
 * its own, because each has a control of its own: the padlock inside the
 * field locks that one value against edits. A locked field stays typeable --
 * the number typed becomes the number locked, which the panel's commit solves
 * as a constraint -- so only the word and the padlock say it is locked.
 *
 * A link locked in place holds both already: the padlocks step aside, and the
 * panel's own strip under the title says why (`app-lock-banner`).
 *
 * The form controls stay the panel's `length` and `angle`, so what a typed
 * number does is unchanged; this block only decides when one may be typed.
 */
@Component({
  selector: 'hold-field-block',
  templateUrl: './hold-field.component.html',
  styleUrls: ['./hold-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, FormsModule, ReactiveFormsModule, MatFormField, MatInput],
})
export class HoldFieldComponent {
  readonly formGroup = input.required<FormGroup>();
  readonly link = input.required<RealLink>();
  /** True for a link whose length and angle are not single numbers -- a body of three or more joints. */
  readonly disabled = input<boolean>(false);
  /** -1 while the length field is hovered or focused, -2 when it is left; the canvas draws the dimension. */
  readonly lengthEntry = output<number>();
  readonly angleEntry = output<number>();

  private mechanism = inject(MechanismService);
  private gridUtils = inject(GridUtilsService);

  private hovered = { length: false, angle: false };
  private focused = { length: false, angle: false };
  private shown = { length: false, angle: false };

  readonly lockPath =
    'M7 10V7a5 5 0 0 1 10 0v3h2.5v11h-15V10H7Zm2 0h6V7a3 3 0 0 0-6 0v3ZM6.5 12v7h11v-7h-11Z';
  readonly unlockPath =
    'M7 10V7a5 5 0 0 1 10 0v1.5h-2V7a3 3 0 0 0-6 0v3H7Zm-2.5 0h15v11h-15V10Zm2 2v7h11v-7h-11Z';

  /** The hold this bar is under, if any. */
  hold(): LinkHold {
    return holdOf(this.link());
  }

  /** Whether this bar can hold a value at all: a two-joint bar, not locked in place. */
  holdable(): boolean {
    return holdableBar(this.link()) && !this.disabled() && !this.lockedInPlace();
  }

  /** Every joint of the link held by a Lock mark: the whole bar is pinned. */
  lockedInPlace(): boolean {
    const frozen = this.gridUtils.frozenJointIds();
    return this.link().joints.some((joint) => frozen.has(joint.id));
  }

  held(which: Which): boolean {
    return this.hold() === which;
  }

  padlockTitle(which: Which): string {
    const other = which === 'length' ? 'angle' : 'length';
    if (this.held(which))
      return `Unlock the ${which}. Typing a number keeps it locked at that number`;
    if (this.hold() === other) return `Lock the ${which} instead — the ${other} is unlocked`;
    return `Lock the ${which}`;
  }

  toggle(which: Which, event: Event): void {
    event.stopPropagation();
    if (!this.holdable()) return;
    this.mechanism.setHold(this.link(), this.held(which) ? undefined : which);
  }

  enter(which: Which): void {
    this.hovered[which] = true;
    this.announce(which);
  }

  leave(which: Which): void {
    this.hovered[which] = false;
    this.announce(which);
  }

  focus(which: Which, field: HTMLInputElement): void {
    this.focused[which] = true;
    field.select();
    this.announce(which);
  }

  blur(which: Which): void {
    this.focused[which] = false;
    this.announce(which);
  }

  /** Tell the canvas when the dimension for this field should appear and go. */
  private announce(which: Which): void {
    const show = !this.disabled() && (this.hovered[which] || this.focused[which]);
    if (show === this.shown[which]) return;
    this.shown[which] = show;
    (which === 'length' ? this.lengthEntry : this.angleEntry).emit(show ? -1 : -2);
  }
}
