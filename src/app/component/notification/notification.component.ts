import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import {
  LiveNotification,
  NotificationKind,
  NotificationService,
} from '../../services/notification.service';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/**
 * The glyph that says which of the four this is before the sentence is read.
 *
 * `block` rather than an exclamation for a refusal: the app is declining, not
 * reporting damage, and the reader has done nothing wrong by asking.
 */
const ICONS: Record<NotificationKind, string> = {
  success: 'check_circle',
  refusal: 'block',
  warning: 'warning',
  // Information, not a fault: the plain (i) every reader knows.
  news: 'info',
  failure: 'error',
};

/**
 * What the app is saying right now, stacked newest last.
 *
 * Every message used to be the same white bar for the same four seconds, one
 * at a time — so "Message sent. Thank you for your feedback!" and "A cylinder
 * cannot fold onto itself" were the same object until you had read them both,
 * and a refusal arriving took away a warning nobody had read yet.
 */
@Component({
  selector: 'app-notification-stack',
  animations: [
    // In from above, out by collapsing so the ones below close the gap rather
    // than jumping up into it.
    trigger('card', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('160ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate(
          '140ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-6px)' })
        ),
      ]),
    ]),
  ],
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon],
})
export class NotificationComponent implements AfterViewInit, DoCheck {
  notifications = inject(NotificationService);

  private readonly stack = viewChild.required<ElementRef<HTMLElement>>('stack');
  /** The newest message the stack was raised for. */
  private raisedFor?: number;

  constructor() {
    // A message still up when a dialog opens would go under it: a failure the
    // reader has not dismissed yet is as much about the screen as a new one.
    inject(MatDialog)
      .afterOpened.pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.notifications.live.length > 0) this.raise();
      });
  }

  ngAfterViewInit(): void {
    this.raise();
  }

  /** Asked every pass, because a message arriving is a change to a plain array. */
  ngDoCheck(): void {
    const newest = this.notifications.live.at(-1)?.key;
    if (newest === undefined || newest === this.raisedFor) return;
    this.raisedFor = newest;
    this.raise();
  }

  /**
   * Put the stack on top of everything, dialogs included.
   *
   * Angular's CDK opens dialogs, menus and tooltips as popovers in the
   * browser's top layer, which no z-index reaches: the library's Suggest a
   * Mechanism form refused, failed and offered Try again entirely behind its
   * own dialog. The stack is a popover too, and the top layer is ordered by
   * who was shown last, so it is shown again whenever a message arrives or a
   * dialog opens. Skipped where there is no popover API (the
   * unit tests' DOM), which leaves it an ordinary fixed element.
   */
  private raise(): void {
    const stack = this.stack().nativeElement;
    if (typeof stack.showPopover !== 'function') return;
    if (stack.matches(':popover-open')) stack.hidePopover();
    stack.showPopover();
  }

  iconFor(one: LiveNotification): string {
    return ICONS[one.kind];
  }

  /**
   * How a screen reader is told.
   *
   * A failure interrupts; the rest wait for a pause. Both are announced, which
   * is the point of the region existing at all.
   */
  politenessFor(one: LiveNotification): string {
    return one.kind === 'failure' ? 'assertive' : 'polite';
  }
}
