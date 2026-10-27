import { Injectable, signal } from '@angular/core';

/**
 * Which of the machine panel's sections the reader has folded, for the session.
 *
 * The panel is a new component in every mode -- Edit and the two analyses each
 * mount their own -- so state kept on it came back open at every mode switch,
 * and a reader who had closed Mechanism Overview found it open again the moment
 * they changed tabs. Kept here, one choice holds across all three. View state
 * only: it never touches the document, and a reload starts open again.
 */
@Injectable({ providedIn: 'root' })
export class MechanismPanelStateService {
  readonly overviewOpen = signal(true);
  readonly linksOpen = signal(true);
}
