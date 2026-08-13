import { NotificationService } from '../app/services/notification.service';

/**
 * A `NotificationService` for specs that build their services by hand.
 *
 * It is the real thing — the service owns its own stack and needs nothing from
 * the DOM — so a spec that wants to know what was said can read `live`, and one
 * that does not can ignore it. A spec asserting on a *particular* message spies
 * on the service's own methods instead, which reads better than matching text.
 */
export function silentNotifications(): NotificationService {
  return new NotificationService();
}
