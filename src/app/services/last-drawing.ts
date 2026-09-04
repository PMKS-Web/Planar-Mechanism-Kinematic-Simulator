/**
 * The drawing this browser was last standing on, kept between page loads.
 *
 * The whole document lives in memory, and the address bar is stripped once a
 * shared link has been decoded — so a refresh, a Back, a crash or a stray
 * keystroke took everything, with no prompt on the way out and nothing to come
 * back to. Every state the history records is already a complete URL, so
 * remembering the current one is the whole of a recovery.
 *
 * Not a save file and not a second history: one string, replaced each time the
 * reader moves. What decides whether it is *read* is the kind of navigation —
 * see `UrlProcessorService`, which restores it only after a reload or a Back.
 *
 * Its own module, and deliberately dependency-free: the service that writes it
 * and the service that reads it already point at each other, and a shared
 * function is the one way to let both reach it without closing that ring.
 */

const LAST_DRAWING = 'lastDrawing';

/**
 * Keep a state for the next load.
 *
 * Storage can throw outright — a private window, a browser set to refuse site
 * data — and losing the ability to *recover* work is not a reason to fail the
 * edit that was being recorded.
 */
export function rememberDrawing(url: string | undefined): void {
  if (!url) return;
  try {
    localStorage.setItem(LAST_DRAWING, url);
  } catch {
    // Nothing to be done, and nothing worth saying: the drawing is fine.
  }
}

/** What the last visit was standing on, if this browser kept it. */
export function recallDrawing(): string | null {
  try {
    const kept = localStorage.getItem(LAST_DRAWING);
    return kept && kept.length > 0 ? kept : null;
  } catch {
    return null;
  }
}
