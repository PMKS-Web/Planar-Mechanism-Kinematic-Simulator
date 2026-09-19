import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Joint } from '../../../model/joint';
import { LinkHold, RealLink } from '../../../model/link';
import { holdableBar } from '../../../model/link-holds';
import { GridUtilsService } from '../../../services/grid-utils.service';
import { MechanismService } from '../../../services/mechanism.service';
import { FieldOverlay } from '../field-overlay';

/** One of the two values this block shows and can hold. */
type Which = 'length' | 'angle';

/** The two rows, in the order they are drawn. */
const ROWS: Which[] = ['length', 'angle'];

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
 *
 * A cylinder's barrel and rod are bars like any other here, with both rows
 * (decision D12). They were one row -- the angle -- while a cylinder was one
 * part with one size, and a member's own length is a number now. The two rows
 * read from different places, which is decision S5: the length is this
 * member's own flag, the angle is the *part's*, carried by whichever member it
 * was written on and shown on both.
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
  /** What the length row's help says, when this is not a plain bar. */
  readonly lengthHelp = input<string | undefined>(undefined);
  /** What the angle row's help says, when this is not a plain bar. */
  readonly angleHelp = input<string | undefined>(undefined);
  /** -1 while the length field is hovered or focused, -2 when it is left; the canvas draws the dimension. */
  readonly lengthEntry = output<number>();
  readonly angleEntry = output<number>();

  private mechanism = inject(MechanismService);
  private gridUtils = inject(GridUtilsService);

  /**
   * One per field, shared with the other three field blocks. These used to
   * emit only on a change -- the bug `FieldOverlay` describes, where a
   * dimension dropped by a committed edit never came back.
   */
  private readonly overlays: Record<Which, FieldOverlay<number>> = {
    length: new FieldOverlay<number>(
      (value) => this.lengthEntry.emit(value),
      () => -1,
      () => -2,
      () => !this.disabled()
    ),
    angle: new FieldOverlay<number>(
      (value) => this.angleEntry.emit(value),
      () => -1,
      () => -2,
      () => !this.disabled()
    ),
  };

  protected readonly lockPath =
    'M7 10V7a5 5 0 0 1 10 0v3h2.5v11h-15V10H7Zm2 0h6V7a3 3 0 0 0-6 0v3ZM6.5 12v7h11v-7h-11Z';
  protected readonly unlockPath =
    'M7 10V7a5 5 0 0 1 10 0v1.5h-2V7a3 3 0 0 0-6 0v3H7Zm-2.5 0h15v11h-15V10Zm2 2v7h11v-7h-11Z';

  /** The rows to show. Both values: a bar has the two, and so does a member. */
  protected rows(): Which[] {
    return ROWS;
  }

  /** The word this row is about, for its caption and for its field's name. */
  protected labelFor(which: Which): string {
    return which === 'length' ? 'Length' : 'Angle';
  }

  protected helpFor(which: Which): string {
    if (which === 'length') {
      return this.lengthHelp() ?? 'Distance between the two joints of this link.';
    }
    return (
      this.angleHelp() ??
      'Angle of this link measured from the positive x axis. Counter-clockwise is positive.'
    );
  }

  /** The cylinder this link is a member of, when it is one. */
  private member(): boolean {
    return this.mechanism.cylinderOfLink(this.link()) !== undefined;
  }

  /** The hold this bar is under, if any. */
  private hold(): LinkHold {
    // Through the service, which has the drawing: a cylinder is recognized
    // from its joints, and its hold is written on a member the reader may not
    // be the one looking at.
    return this.mechanism.holdOf(this.link());
  }

  /** Whether this part can hold a value at all, and is not already pinned in place. */
  protected holdable(): boolean {
    const shaped =
      this.mechanism.cylinderOfLink(this.link()) !== undefined || holdableBar(this.link());
    return shaped && !this.disabled() && !this.lockedInPlace();
  }

  /**
   * Every joint of the link held by a Lock mark: the whole bar is pinned.
   *
   * Every, not any: with one end locked the bar can still turn about it and
   * stretch from it, so locking its length or angle still means something,
   * and the padlocks stay.
   */
  private lockedInPlace(): boolean {
    const frozen = this.gridUtils.frozenJointIds();
    const joints = this.pinned();
    return joints.length > 0 && joints.every((joint) => frozen.has(joint.id));
  }

  /**
   * The joints holding this part still: its own, or a cylinder's two mounts.
   *
   * A cylinder's other joints are machinery -- the barrel's buried end and the
   * welded pin are placed by the layout and re-derived on every normalize --
   * so they are not what a reader locked and not what pins the part.
   */
  private pinned(): Joint[] {
    const sealed = this.mechanism.cylinderOfLink(this.link());
    return sealed ? [sealed.mountA, sealed.mountB] : this.link().joints;
  }

  protected held(which: Which): boolean {
    // A member can be under two at once -- its own fixed length and the part's
    // fixed angle -- which is more than `holdOf` can say, since that answers
    // with one value for the whole link (decision S5).
    if (this.member()) return this.mechanism.memberHoldOf(this.link(), which);
    return this.hold() === which;
  }

  protected padlockTitle(which: Which): string {
    const other = which === 'length' ? 'angle' : 'length';
    if (this.held(which))
      return `Release the fixed ${which}. Typing a number keeps it fixed at that number`;
    if (this.held(other)) return `Fix the ${which} instead — the ${other} is released`;
    return `Fix the ${which}`;
  }

  protected toggle(which: Which, event: Event): void {
    event.stopPropagation();
    if (!this.holdable()) return;
    // The row knows which of the two values it is about, and on a member that
    // is the whole question: releasing there is ambiguous to `setHold`, which
    // takes one hold for the link and has to guess between the member's length
    // and the part's angle. `setMemberHold` is the door for a row that knows.
    if (this.member()) {
      this.mechanism.setMemberHold(this.link(), which, !this.held(which));
      return;
    }
    this.mechanism.setHold(this.link(), this.held(which) ? undefined : which);
  }

  protected enter(which: Which): void {
    this.overlays[which].hover(true);
  }

  protected leave(which: Which): void {
    this.overlays[which].hover(false);
  }

  protected focus(which: Which, field: HTMLInputElement): void {
    field.select();
    this.overlays[which].focus(true);
  }

  protected blur(which: Which): void {
    this.overlays[which].focus(false);
  }
}
