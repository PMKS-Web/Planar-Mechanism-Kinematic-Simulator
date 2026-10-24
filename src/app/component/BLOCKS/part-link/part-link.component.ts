import { ChangeDetectionStrategy, Component, inject, input, OnDestroy } from '@angular/core';
import type { Joint } from '../../../model/joint';
import type { Link } from '../../../model/link';
import { PART_LINK_TARGET } from './part-link-target';

/**
 * A part of the drawing named in text, as a link to it: "joint C", "link DE".
 *
 * A name is not a place. A reader told that joint C is welded has to find C
 * among the letters on the grid, so the name itself is the way there: pointing
 * at it lights the part on the grid, and pressing it selects the part so its
 * panel opens. The words stay the words of the sentence around it; the tint is
 * what says they can be pressed.
 *
 * A button, so it takes focus and Enter like any other control, and focusing it
 * lights the part as pointing does.
 */
@Component({
  selector: 'part-link',
  templateUrl: './part-link.component.html',
  styleUrls: ['./part-link.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartLinkComponent implements OnDestroy {
  /** The joint or link this names. */
  readonly part = input.required<Joint | Link>();

  /**
   * Optional so a block test or a host that has not wired one up still renders
   * the name: it simply goes nowhere.
   */
  private readonly target = inject(PART_LINK_TARGET, { optional: true });
  private pointing = false;

  protected point(on: boolean): void {
    this.pointing = on;
    this.target?.point(on ? this.part() : undefined);
  }

  protected open(): void {
    this.pointing = false;
    this.target?.open(this.part());
  }

  /** A link that disappears under the pointer -- its issue fixed -- lets go of the grid. */
  ngOnDestroy(): void {
    if (this.pointing) this.target?.point(undefined);
  }
}
