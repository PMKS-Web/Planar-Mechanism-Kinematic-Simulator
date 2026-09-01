import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import {
  LiveNotification,
  NotificationKind,
  NotificationService,
} from '../../services/notification.service';
import { MatIcon } from '@angular/material/icon';

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
  // A flag, not a warning triangle: this one marks a place rather than
  // reporting a fault.
  news: 'flag',
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
export class NotificationComponent {
  notifications = inject(NotificationService);

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
