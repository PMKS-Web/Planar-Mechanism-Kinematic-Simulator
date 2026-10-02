import { Injectable, signal } from '@angular/core';

/**
 * The screen the app puts up while it is too busy to draw.
 *
 * Opening a mechanism is not a request that goes anywhere: the URL is decoded
 * and then every sample of every joint for the whole cycle is solved, on this
 * thread, before anything is drawn. On a six-bar that is a few seconds during
 * which the window does not repaint, does not answer a click and gives no sign
 * that it is working -- which reads as a crash rather than as a wait, and the
 * usual response to it is a second click that queues a second copy of the work.
 *
 * Nothing here makes that faster. It makes it *visible*, which is the part the
 * reader needs: something on screen that says the app has their instruction and
 * is carrying it out.
 *
 * The whole difficulty is that a spinner shown at the top of a synchronous
 * block never appears -- the browser has no chance to paint between the flag
 * going up and the thread being taken. So `during` does not run the work; it
 * schedules it, after a frame has actually reached the glass. Everything that
 * replaces the drawing goes through it, and the work itself stays synchronous.
 */
/**
 * The longest the cover waits, after the work, for its result to be shown.
 * A fit lands within a frame or two of the render; this is only for one that
 * never comes.
 */
const SHOWN_LONGEST_MS = 2000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable({ providedIn: 'root' })
export class LoadingService {
  /** Whether to cover the app, and what to say while it is covered. */
  readonly busy = signal(false);
  readonly label = signal('');

  /**
   * Put the cover up, let it be seen, then do the work behind it.
   *
   * Rejections are not swallowed but the cover always comes down: a failed load
   * leaves the reader with the drawing they had and a notification saying why,
   * which is recoverable. A cover with nothing behind it is not.
   *
   * `shown`, when the work leaves something still to happen before its result
   * is fit to be seen -- a new drawing is framed a render after it is decoded
   * -- keeps the cover up until that has happened too, or for at most
   * `SHOWN_LONGEST_MS` if it never does.
   */
  async during<T>(label: string, work: () => T, shown?: () => Promise<void>): Promise<T> {
    this.label.set(label);
    this.busy.set(true);
    await this.painted();
    try {
      const done = work();
      if (shown) await Promise.race([shown(), wait(SHOWN_LONGEST_MS)]);
      return done;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Resolve once the cover is genuinely on screen.
   *
   * Two waits because they answer two different questions. The timeout gives
   * Angular's change detection a turn, so the element exists at all; the pair
   * of frames then gives the browser a turn to lay it out and paint it. One
   * animation frame is not enough -- the first fires before the style and
   * layout work that the newly inserted element causes, so resolving on it
   * hands the thread back and blocks before the pixels are drawn.
   */
  private painted(): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
  }
}
