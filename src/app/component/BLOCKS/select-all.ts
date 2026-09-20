/**
 * Clicking a field in this app selects what is in it, so the next keystroke
 * replaces the value rather than inserting into it.
 *
 * Every block used to say that as `(click)="field.select()"`, and it is only
 * *almost* enough. On a field that does not yet have focus it works, because
 * the focus and the caret are settled before the click handler runs. On a
 * field that already has focus the browser applies the caret that click asks
 * for **after** the click handlers — so the selection made in the handler is
 * put straight back to a caret, and the second click on a field reads as doing
 * nothing at all. Which is exactly how it was reported: click the Length field,
 * get a caret.
 *
 * So the selection is asserted twice: once now, which is what the reader sees
 * with no delay, and once on the next frame if the browser has since collapsed
 * it. A range the reader *chose* — a drag across part of the value — is left
 * alone, because a drag ends in a range and a plain click ends in a caret.
 */
export function selectAll(field: HTMLInputElement | null | undefined): void {
  if (!field) return;
  const was = field.value;
  field.select();
  requestAnimationFrame(() => {
    // Gone, blurred, holding a range somebody dragged, or already being typed
    // into: none of those is a plain click waiting to have its value replaced,
    // and selecting over the last one would eat the first character typed.
    if (!field.isConnected || document.activeElement !== field) return;
    if (field.value !== was) return;
    if (field.selectionStart !== field.selectionEnd) return;
    field.select();
  });
}
