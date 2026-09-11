import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { NotificationComponent } from '../../app/component/notification/notification.component';
import {
  NotificationAction,
  NotificationKind,
  NotificationService,
} from '../../app/services/notification.service';

/**
 * One sentence per kind, taken from where the app says it, so the gallery
 * shows real lengths rather than lorem ipsum.
 */
const SAMPLES: Record<NotificationKind, { text: string; actions?: NotificationAction[] }> = {
  success: { text: 'Link copied. It opens this exact mechanism.' },
  refusal: { text: 'Nothing was written: the chosen objects no longer have numbers to give.' },
  warning: { text: 'Merged C into D. The weld did not carry over — D cannot be welded.' },
  news: {
    text: 'M2 starts here now — its old start is out of reach.',
    actions: [{ label: 'Undo', run: () => undefined }],
  },
  failure: { text: 'The export could not be written.' },
};

/**
 * The real notification stack, holding the messages a story asks for.
 *
 * Written into `live` directly rather than through `success()` and friends:
 * those take a message away after a few seconds and keep at most three on
 * screen, and a gallery wants all five to stay put while they are looked at.
 */
@Component({
  selector: 'sb-notification-gallery',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [NotificationComponent],
  template: `<app-notification-stack />`,
})
export class NotificationGalleryComponent implements OnInit {
  readonly kinds = input<NotificationKind[]>(['success', 'refusal', 'warning', 'news', 'failure']);
  private notifications = inject(NotificationService);

  ngOnInit(): void {
    this.notifications.dismissAll();
    this.kinds().forEach((kind, index) => {
      const sample = SAMPLES[kind];
      this.notifications.live.push({
        key: index + 1,
        id: `gallery.${kind}`,
        kind,
        text: sample.text,
        actions: sample.actions ?? [],
      });
    });
  }
}
