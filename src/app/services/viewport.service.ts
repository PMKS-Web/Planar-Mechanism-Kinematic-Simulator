import { Injectable, signal } from '@angular/core';

/**
 * Where the phone layout starts.
 *
 * Chosen from the panel rather than from a device list: the mode panel is 250px
 * and the analysis one 420px, and below about this a panel standing at the side
 * takes more of the window than it leaves. Above it there is room to stand
 * beside one, which is the layout the rest of the app is built for.
 */
const PHONE_MAX_WIDTH = 600;

/**
 * Whether the window is phone-shaped, as one answer.
 *
 * It exists because two things have to agree about it and they are written in
 * different languages. The panel *looks* like a bottom sheet because of a media
 * query in CSS, and the canvas *frames around* a bottom sheet because of the
 * edge named in `data-canvas-inset`, which is markup. A media query in the
 * stylesheet and a hand-kept boolean in a component would be two breakpoints
 * that drift, and the drift is invisible until a linkage is framed into the
 * space a panel is actually covering.
 *
 * So the query is asked once, here, and the stylesheet keys off the class this
 * puts on the panel rather than off a width of its own.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  /** True while the window is narrow enough for the phone layout. */
  readonly isPhone = signal(false);

  /**
   * True where the pointer is a finger rather than a mouse.
   *
   * A different question from `isPhone`, and asked for a different reason: the
   * layout follows the *window*, because a narrow window on a desktop has the
   * same problem a phone does, while the words for a gesture follow the
   * *input*. A tablet is wide enough for the side panel and still has no right
   * button to tell its reader to press.
   */
  readonly isTouch = signal(false);

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const narrow = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    this.isPhone.set(narrow.matches);
    narrow.addEventListener('change', (event) => this.isPhone.set(event.matches));

    const coarse = window.matchMedia('(pointer: coarse)');
    this.isTouch.set(coarse.matches);
    coarse.addEventListener('change', (event) => this.isTouch.set(event.matches));
  }
}
