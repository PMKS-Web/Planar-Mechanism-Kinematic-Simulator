import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../app/services/notification.service';

/**
 * A `NotificationService` that opens nothing.
 *
 * The specs that build services by hand have no overlay to open into, and none
 * of them is about what the app said -- they are about what it did. A spec that
 * *is* about the message spies on the service's own methods instead, which is
 * why this stubs the snackbar underneath rather than the service itself.
 */
export function silentNotifications(): NotificationService {
  const snackBar = {
    openFromComponent: () => ({
      dismiss: () => {},
      afterDismissed: () => ({ subscribe: () => {} }),
    }),
  } as unknown as MatSnackBar;
  return new NotificationService(snackBar);
}
