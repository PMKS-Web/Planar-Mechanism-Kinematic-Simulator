import { effect } from '@angular/core';

/**
 * Keep the focus, caret and selection in a field the layout rebuilds.
 *
 * The library draws its phone and desktop layouts from different template
 * branches, so turning a phone on its side builds the search box and the
 * suggest form's fields again, and the one being typed in is gone from under
 * the caret. Its replacement, found by id, gets the focus and the caret back
 * -- but only where the focus has fallen to the page: a control that survived
 * the turn keeps it, or a Back arrow would lose its focus to a field and the
 * next Enter would send the form.
 *
 * Built in an injection context, since it watches the layout with an effect;
 * the host's focus events are handed to `note`.
 */
export class FocusAcrossLayouts {
  private focused?: { id: string; start: number | null; end: number | null };

  constructor(
    private host: () => HTMLElement,
    layout: () => unknown
  ) {
    let first = true;
    effect(() => {
      layout();
      if (first) {
        first = false;
        return;
      }
      const was = this.focused;
      if (was) setTimeout(() => this.restore(was));
    });
  }

  /** Where the focus and caret are now, from a focus, input, key or pointer event. */
  note(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.id) return;
    const text =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : null;
    let start: number | null = null;
    let end: number | null = null;
    try {
      start = text?.selectionStart ?? null;
      end = text?.selectionEnd ?? null;
    } catch {
      // Some input types refuse to say where the caret is.
    }
    this.focused = { id: target.id, start, end };
  }

  private restore(was: { id: string; start: number | null; end: number | null }): void {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const field = this.host().querySelector<HTMLElement>(`#${was.id}`);
    field?.focus();
    if (
      (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) &&
      was.start !== null &&
      was.end !== null
    ) {
      try {
        field.setSelectionRange(was.start, was.end);
      } catch {
        // A field type without a caret, such as email in some browsers.
      }
    }
    // Focusing it was itself a focus event, which noted the caret at the end
    // before the line above moved it back: noted again, or a second turn
    // would give back the end.
    this.focused = was;
  }
}
