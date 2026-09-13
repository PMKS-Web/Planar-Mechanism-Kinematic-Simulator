/** Fade it out, then let it go. Idempotent: it can only be removed once. */
export function hideBootSplash(): void {
  const splash = document.getElementById('bootSplash');
  if (!splash) return;
  splash.style.transition = 'opacity 180ms ease-out';
  splash.style.opacity = '0';
  // Not `transitionend`: a reader with reduced motion, or a browser that
  // never runs the transition because the tab was in the background for it,
  // would leave a white sheet over the whole app forever. A timer always
  // fires.
  setTimeout(() => splash.remove(), 220);
}
