import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarRef } from '@angular/material/snack-bar';
import { NotificationComponent } from '../component/notification/notification.component';

/**
 * How much the reader is meant to care.
 *
 * The distinction that matters is not severity but *who acted*. A refusal is
 * the app declining something the reader just tried: they are already looking
 * at the place it happened, they know what they asked for, and the message is
 * over as soon as it is read. A warning is the opposite — it reports a state
 * the drawing is now in, which nobody asked for and which is still true after
 * the message goes away. That is the one that has to wait to be dismissed.
 */
export type NotificationKind = 'success' | 'refusal' | 'warning' | 'failure';

/** What the snackbar body is handed. */
export interface NotificationData {
  kind: NotificationKind;
  text: string;
  dismiss: () => void;
}

/** How long each kind stays, in ms. `undefined` means until it is dismissed. */
const DURATION: Record<NotificationKind, number | undefined> = {
  // Confirmation of something the reader already watched happen. It is there to
  // be caught out of the corner of an eye, not read.
  success: 2500,
  refusal: 4000,
  warning: undefined,
  failure: undefined,
};

/** How long the same message stays quiet after saying itself, in ms. */
const DEFAULT_COOLDOWN = 800;

/**
 * Everything the app says out loud, said in one place.
 *
 * Replaces `NewGridComponent.sendNotification`, which had two faults that were
 * not about wording. It kept a single `lastNotificationTime` for the whole
 * app, so an unrelated message a moment earlier silenced the next one — two
 * different refusals in the same second showed only the first. And it
 * initialised that timestamp to the moment the canvas was constructed, so any
 * message asking for a long quiet period was muted for that period *from page
 * load*: the two zoom warnings could not appear in the first twenty seconds of
 * a session, which is when zooming happens.
 *
 * The cooldown here is per message id, and starts unarmed.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private lastSaid = new Map<string, number>();
  private showing?: { id: string; ref: MatSnackBarRef<NotificationComponent> };

  constructor(private snackBar: MatSnackBar) {}

  /** Something the reader asked for, happened. */
  success(id: string, text: string, cooldownMs?: number): void {
    this.say('success', id, text, cooldownMs);
  }

  /** Something the reader asked for, did not happen, and why. */
  refusal(id: string, text: string, cooldownMs?: number): void {
    this.say('refusal', id, text, cooldownMs);
  }

  /** It happened, but the drawing is now in a state worth knowing about. */
  warning(id: string, text: string, cooldownMs?: number): void {
    this.say('warning', id, text, cooldownMs);
  }

  /** Something outside the reader's control went wrong. */
  failure(id: string, text: string, cooldownMs?: number): void {
    this.say('failure', id, text, cooldownMs);
  }

  /** Take down whatever is showing. */
  dismiss(): void {
    this.showing?.ref.dismiss();
    this.showing = undefined;
  }

  private say(
    kind: NotificationKind,
    id: string,
    text: string,
    cooldownMs = DEFAULT_COOLDOWN
  ): void {
    // Already on screen. Reopening would restart the animation and read as a
    // second, identical event -- which is exactly what a reader holding a key
    // down or dragging against a rule would see.
    if (this.showing?.id === id) return;

    const last = this.lastSaid.get(id);
    if (last !== undefined && last + cooldownMs > Date.now()) return;
    this.lastSaid.set(id, Date.now());

    const ref = this.snackBar.openFromComponent(NotificationComponent, {
      data: { kind, text, dismiss: () => ref.dismiss() } as NotificationData,
      panelClass: ['pmksNotification', `pmksNotification--${kind}`],
      horizontalPosition: 'center',
      verticalPosition: 'top',
      duration: DURATION[kind],
      politeness: kind === 'failure' ? 'assertive' : 'polite',
    });

    this.showing = { id, ref };
    ref.afterDismissed().subscribe(() => {
      if (this.showing?.ref === ref) this.showing = undefined;
    });
  }
}
