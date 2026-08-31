import { Directive, ElementRef, NgZone, OnDestroy, inject, output } from '@angular/core';

/** Where the press happened, in client pixels. */
export interface LongPress {
  x: number;
  y: number;
  /** What was under the finger when the press *started*. */
  target: Element | null;
}

/** How long a finger has to stay put. The platform norm on both phones. */
const HOLD_MS = 500;
/** How far it may drift and still count as staying put. */
const SLOP_PX = 10;

/**
 * A press held still, which is a touch device's right-click.
 *
 * Every verb in PMKS+ that makes something -- add a link, attach a cylinder,
 * ground a joint, apply a force -- is behind the right-click menu, so a device
 * with no right button could open the app, pan it and read it, and never build
 * anything. That is what the warning dialog used to be apologising for.
 *
 * This only detects the gesture. What a long press *means* is the component's
 * business, exactly as what a right-click means already is: the canvas owns
 * both, and does the same three things for either.
 *
 * Touch and pen only. A mouse has a right button already, and firing this for
 * it as well would give a slow right-hand click two meanings at once.
 */
@Directive({
  selector: '[appLongPress]',
})
export class LongPressDirective implements OnDestroy {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);

  readonly longPress = output<LongPress>();

  /**
   * A second finger landed, so whatever the first one had taken hold of must be
   * put down: this is a pinch, and a pinch moves the view rather than the
   * mechanism.
   */
  readonly pinched = output<void>();

  /**
   * Whether a press is still deciding what it is.
   *
   * The canvas asks, because a drag and a press begin identically and only one
   * of them may happen. The drag is held off for 100ms or ten pixels, whichever
   * comes first -- tuned for a mouse, where a press is either a quick click or
   * a deliberate drag. A finger held for half a second passes 100ms long before
   * the press matures, so every tremor in that half second was dragging the
   * joint the reader was trying to open a menu on. Ten pixels is the same
   * number on both sides, so the two never both fire: past it this stops being
   * a press, and the drag it was holding off takes over.
   */
  get pressPending(): boolean {
    return this.startedAt !== undefined;
  }

  /**
   * More than one finger is down, so this is a pinch for as long as that lasts.
   *
   * Canceling the first finger's grip when the second lands is not enough on
   * its own: the second finger has a `pointerdown` of its own, and if it comes
   * down on a part it takes hold of *that* one. A pinch that began on one joint
   * and closed on another dragged the second across the drawing while it
   * zoomed. Nothing is dragged while two fingers are down, whichever of them
   * went where.
   */
  get pinching(): boolean {
    return this.down.size > 1;
  }

  private timer?: ReturnType<typeof setTimeout>;
  private startedAt?: { x: number; y: number; id: number; on: Element | null };
  /** Every finger currently on the glass. */
  private readonly down = new Set<number>();

  constructor() {
    // Outside Angular: a press that comes to nothing -- which is most of them,
    // every tap and every drag -- must not cost a change-detection pass per
    // pointermove. Only the press that matures re-enters.
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      // Capture, not bubble. Parts of the drawing stop propagation on their own
      // pointerdown -- a synthesis position does, so that dragging it does not
      // also pan the canvas -- and a press on one of those never reached a
      // listener waiting on the way back up. Capture runs on the way down,
      // before anything can decide the event goes no further, so every part of
      // the canvas can be held rather than only the parts that let events past.
      el.addEventListener('pointerdown', this.onDown, { passive: true, capture: true });
      el.addEventListener('pointermove', this.onMove, { passive: true, capture: true });
      el.addEventListener('pointerup', this.cancel, { passive: true, capture: true });
      el.addEventListener('pointercancel', this.cancel, { passive: true, capture: true });
      // A press that leaves the canvas is a press that is no longer about
      // anything on it.
      el.addEventListener('pointerleave', this.cancel, { passive: true, capture: true });
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('pointerdown', this.onDown, true);
    el.removeEventListener('pointermove', this.onMove, true);
    el.removeEventListener('pointerup', this.cancel, true);
    el.removeEventListener('pointercancel', this.cancel, true);
    el.removeEventListener('pointerleave', this.cancel, true);
    this.cancel();
  }

  private onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    this.down.add(event.pointerId);
    // A second finger is a pinch, and a pinch is not a press being held still
    // however still the first finger is. It is not a drag either, so the canvas
    // is told to let go of whatever the first finger had taken.
    if (this.startedAt) {
      this.cancel();
      this.zone.run(() => this.pinched.emit());
      return;
    }
    // The part under the finger *now*, not in half a second's time. Asking
    // `elementFromPoint` when the press matures reads whatever has since moved
    // over that spot -- and something moving over that spot is exactly what a
    // press on a phone tends to cause.
    this.startedAt = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      on: event.target instanceof Element ? event.target : null,
    };
    this.timer = setTimeout(() => this.fire(), HOLD_MS);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.startedAt || event.pointerId !== this.startedAt.id) return;
    const drift = Math.hypot(event.clientX - this.startedAt.x, event.clientY - this.startedAt.y);
    // Dragging a joint starts the same way a long press does, so the drag has
    // to be able to win: past the slop this is a drag and never becomes a menu.
    if (drift > SLOP_PX) this.cancel();
  };

  private cancel = (event?: Event): void => {
    if (event instanceof PointerEvent) this.down.delete(event.pointerId);
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.startedAt = undefined;
  };

  private fire(): void {
    const press = this.startedAt;
    if (!press) return;
    this.cancel();
    // The one confirmation a touch device can give that a press has been taken
    // rather than merely held. Absent on iOS, which is why it is asked for
    // rather than relied on.
    navigator.vibrate?.(10);
    this.swallowTheTapThatFollows(press.id);
    this.zone.run(() => this.longPress.emit({ x: press.x, y: press.y, target: press.on }));
  }

  /**
   * Stop the finger lifting from closing the menu it just opened.
   *
   * Lifting after a touch makes the browser send a compatibility `mousedown`,
   * `mouseup` and `click` at the same point, for the benefit of pages written
   * before touch existed. The CDK's overlay closes on an outside `click`, and
   * that click lands on the canvas rather than on the menu -- so the menu
   * appeared under the finger and vanished the instant it was lifted, which is
   * every long press.
   *
   * Preventing the default on `touchend` is what suppresses that whole
   * compatibility sequence. It is done from `window` in the capture phase
   * because svg-pan-zoom halts touch events on the canvas itself, and once for
   * this one lift: a listener left in place would make the canvas untappable.
   */
  private swallowTheTapThatFollows(pointerId: number): void {
    const disarm = () => {
      window.removeEventListener('touchend', suppress, true);
      window.removeEventListener('touchcancel', disarm, true);
      clearTimeout(fuse);
    };
    const suppress = (event: Event) => {
      // Only the finger that opened the menu. Another finger lifting used to
      // spend the suppression meant for this one, and then *this* one's lift
      // sent the compatibility click that closed the menu it had just opened.
      if (event instanceof TouchEvent && event.changedTouches.length) {
        const lifted = [...event.changedTouches].some(
          (touch) => touch.identifier === pointerId || touch.identifier + 1 === pointerId
        );
        if (!lifted) return;
      }
      if (event.cancelable) event.preventDefault();
      disarm();
    };
    window.addEventListener('touchend', suppress, { capture: true, passive: false });
    // A press that is never lifted -- a finger that slides off the glass, or a
    // gesture the browser takes back -- would otherwise leave the listener
    // armed, and the *next* touch would lose the tap it was entitled to. That
    // showed up as the sheet handle needing two presses after a canceled one.
    window.addEventListener('touchcancel', disarm, { capture: true });
    const fuse = setTimeout(disarm, 4000);
  }
}
