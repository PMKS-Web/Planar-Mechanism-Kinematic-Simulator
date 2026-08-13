import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { NotificationData, NotificationKind } from '../../services/notification.service';

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
  failure: 'error',
};

/**
 * The body of a notification.
 *
 * Every message used to be the same white bar for the same four seconds, so
 * "Message sent. Thank you for your feedback!" and "A cylinder cannot fold
 * onto itself" were the same object until you had read them both.
 */
@Component({
  selector: 'app-notification',
  templateUrl: './notification.component.html',
  styleUrls: ['./notification.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class NotificationComponent {
  constructor(@Inject(MAT_SNACK_BAR_DATA) public data: NotificationData) {}

  get icon(): string {
    return ICONS[this.data.kind];
  }
}
