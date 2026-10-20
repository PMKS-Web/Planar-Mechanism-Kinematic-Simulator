import { Injectable } from '@angular/core';
import { blankSuggestion, SentSuggestion } from './suggestion';

/**
 * The suggestion being written, kept for the session rather than for one
 * opening of the library.
 *
 * Held by the dialog it was lost with the dialog: a reader who typed a title,
 * stepped back to the library and pressed Escape found a blank form the next
 * time. Here it outlives the dialog, and closing the library costs nothing.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionDraftService {
  form = blankSuggestion();
  /** What went, once something has; the next suggestion starts blank. */
  lastSent?: SentSuggestion;
  /**
   * A send is on its way. The views behind it hold still until it answers,
   * so its answer has a form to come back to and cannot be sent twice.
   */
  sending = false;

  startOver(): void {
    this.form = blankSuggestion();
    this.lastSent = undefined;
  }
}
