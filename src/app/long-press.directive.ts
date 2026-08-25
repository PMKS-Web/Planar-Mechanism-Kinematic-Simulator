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

  private timer?: ReturnType<typeof setTimeout>;
  private startedAt?: { x: number; y: number; id: number; on: Element | null };

  constructor() {
    // Outside Angular: a press that comes to nothing -- which is most of them,
    // every tap and every drag -- must not cost a change-detection pass per
    // pointermove. Only the press that matures re-enters.
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      el.addEventListener('pointerdown', this.onDown, { passive: true });
      el.addEventListener('pointermove', this.onMove, { passive: true });
      el.addEventListener('pointerup', this.cancel, { passive: true });
      el.addEventListener('pointercancel', this.cancel, { passive: true });
      // A press that leaves the canvas is a press that is no longer about
      // anything on it.
      el.addEventListener('pointerleave', this.cancel, { passive: true });
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.cancel);
    el.removeEventListener('pointercancel', this.cancel);
    el.removeEventListener('pointerleave', this.cancel);
    this.cancel();
  }

  private onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return;
    // A second finger is a pinch, and a pinch is not a press being held still
    // however still the first finger is.
    if (this.startedAt) {
      this.cancel();
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

  private cancel = (): void => {
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
    this.swallowTheTapThatFollows();
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
  private swallowTheTapThatFollows(): void {
    const suppress = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      window.removeEventListener('touchend', suppress, true);
    };
    window.addEventListener('touchend', suppress, { capture: true, passive: false });
    // A press that is never lifted -- a finger that slides off the glass, a
    // gesture the browser cancels -- must not leave that listener armed.
    setTimeout(() => window.removeEventListener('touchend', suppress, true), 4000);
  }
}
