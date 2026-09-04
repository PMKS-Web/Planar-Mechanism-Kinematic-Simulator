/**
 * The drawing this tab was last standing on, kept between page loads.
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
    // localStorage is shared by every tab. Using it here let an edit in a
    // second project replace this tab's drawing on refresh, with no undo.
    sessionStorage.setItem(LAST_DRAWING, url);
  } catch {
    // Nothing to be done, and nothing worth saying: the drawing is fine.
  }
  try {
    // Keep recovery across browser visits too. Only a new tab without its own
    // session backup reads this shared fallback.
    localStorage.setItem(LAST_DRAWING, url);
  } catch {
    // The tab's session backup can still work without persistent storage.
  }
}

/** What this tab was standing on, if its session kept it. */
export function recallDrawing(): string | null {
  try {
    const kept = sessionStorage.getItem(LAST_DRAWING);
    if (kept && kept.length > 0) return kept;
  } catch {
    // A browser that denies session storage may still allow saved recovery.
  }
  try {
    const kept = localStorage.getItem(LAST_DRAWING);
    return kept && kept.length > 0 ? kept : null;
  } catch {
    return null;
  }
}
