import { Injectable } from '@angular/core';

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

/**
 * The thing to do about it, when there is one obvious thing.
 *
 * A message that says "set the object scale in Settings" is asking the reader
 * to go and find a control in order to carry out an instruction the app could
 * simply follow. Where the fix is unambiguous, it goes on the message.
 */
export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface NotificationOptions {
  /** How long this message stays quiet after saying itself, in ms. */
  cooldownMs?: number;
  action?: NotificationAction;
}

/** One message, while it is on screen. */
export interface LiveNotification {
  /** Distinct per appearance, so a message said twice animates twice. */
  key: number;
  id: string;
  kind: NotificationKind;
  text: string;
  action?: NotificationAction;
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
 * How many may be on screen at once.
 *
 * More than three is a wall of text over the drawing, and the fourth is worth
 * less than the view it covers. The oldest that was going to leave by itself
 * makes room; one waiting to be dismissed is not pushed out from under the
 * reader.
 */
const MAX_STACK = 3;

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
 *
 * This keeps its own stack rather than driving `MatSnackBar`, which shows one
 * message at a time and takes the previous one away to do it — so a refusal
 * could silently swallow a warning the reader had not read yet.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  /** What is on screen, oldest first. Read by the stack component. */
  readonly live: LiveNotification[] = [];

  private lastSaid = new Map<string, number>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextKey = 1;

  /** Something the reader asked for, happened. */
  success(id: string, text: string, options?: NotificationOptions): void {
    this.say('success', id, text, options);
  }

  /** Something the reader asked for, did not happen, and why. */
  refusal(id: string, text: string, options?: NotificationOptions): void {
    this.say('refusal', id, text, options);
  }

  /** It happened, but the drawing is now in a state worth knowing about. */
  warning(id: string, text: string, options?: NotificationOptions): void {
    this.say('warning', id, text, options);
  }

  /** Something outside the reader's control went wrong. */
  failure(id: string, text: string, options?: NotificationOptions): void {
    this.say('failure', id, text, options);
  }

  dismiss(key: number): void {
    const at = this.live.findIndex((one) => one.key === key);
    if (at === -1) return;
    this.live.splice(at, 1);
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }

  dismissAll(): void {
    [...this.live].forEach((one) => this.dismiss(one.key));
  }

  /** Do what the message offers, and take the message away. */
  act(one: LiveNotification): void {
    one.action?.run();
    this.dismiss(one.key);
  }

  private say(
    kind: NotificationKind,
    id: string,
    text: string,
    { cooldownMs = DEFAULT_COOLDOWN, action }: NotificationOptions = {}
  ): void {
    // Already on screen. Saying it again would stack the same sentence twice --
    // which is exactly what a reader holding a key down or dragging against a
    // rule would produce.
    if (this.live.some((one) => one.id === id)) return;

    const last = this.lastSaid.get(id);
    if (last !== undefined && last + cooldownMs > Date.now()) return;
    this.lastSaid.set(id, Date.now());

    const one: LiveNotification = { key: this.nextKey++, id, kind, text, action };
    this.live.push(one);
    this.makeRoom();

    const duration = DURATION[kind];
    if (duration !== undefined) {
      this.timers.set(
        one.key,
        setTimeout(() => this.dismiss(one.key), duration)
      );
    }
  }

  /** Drop the oldest message that was leaving anyway, until the stack fits. */
  private makeRoom(): void {
    while (this.live.length > MAX_STACK) {
      const leaving = this.live.find((one) => DURATION[one.kind] !== undefined);
      // Nothing but messages waiting to be dismissed. The newest is the one the
      // reader has a chance of connecting to what they just did, so the oldest
      // still goes -- but it has at least been on screen the longest.
      this.dismiss((leaving ?? this.live[0]).key);
    }
  }
}
