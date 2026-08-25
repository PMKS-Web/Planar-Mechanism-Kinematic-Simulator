import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { WhatsNewComponent } from '../component/MODALS/whats-new/whats-new.component';
import { local_storage_available } from '../model/utils';
import { WHATS_NEW_VERSION } from '../model/whats-new';

const SEEN_KEY = 'whatsNewSeen';

/**
 * Every mark the app leaves on a machine it has been opened on.
 *
 * Used to tell a returning reader from a new one. There is no account and
 * nothing on a server, so the only evidence that somebody has been here before
 * is that something they did last time is still written down: a preference they
 * changed, a tutorial they finished, a dialog they dismissed. Any one of them
 * is proof enough.
 *
 * `dismiss` is on the list although nothing writes it any more -- it belonged to
 * the touchscreen warning, which is gone. A reader who dismissed that dialog is
 * exactly the returning reader this is looking for.
 */
const TRACES_OF_A_PREVIOUS_VISIT = [
  'tutorialSeen',
  'snapToGrid',
  'snapToAlignment',
  'showCoM',
  'dismiss',
  SEEN_KEY,
];

/**
 * Whether to tell this reader what changed while they were away.
 *
 * Two readers, two different needs, and the difference matters more than it
 * looks. Somebody opening PMKS+ for the first time has nothing to compare it
 * to: a list of what is new is a list of things they have never missed, and it
 * stands between them and an empty grid they do not yet know how to use. They
 * get the tutorial instead. Somebody who was here in July gets the notes,
 * because the modes have moved and the thing they came to do is somewhere else
 * now.
 *
 * So this shows only where there is evidence of a previous visit -- and the
 * tutorial, which asks the opposite question, stays out of the way when it
 * finds the same evidence.
 */
@Injectable({ providedIn: 'root' })
export class WhatsNewService {
  private dialog = inject(MatDialog);

  /** Whether these notes are still worth showing on this machine. */
  get unread(): boolean {
    if (!local_storage_available()) return false;
    if (localStorage.getItem(SEEN_KEY) === WHATS_NEW_VERSION) return false;
    return this.hasBeenHereBefore();
  }

  /** Whether anything at all says this reader has opened PMKS+ before. */
  hasBeenHereBefore(): boolean {
    if (!local_storage_available()) return false;
    return TRACES_OF_A_PREVIOUS_VISIT.some((key) => localStorage.getItem(key) !== null);
  }

  /**
   * Closed is read. Once, permanently, whichever way it was closed -- the
   * button, the backdrop or Escape -- because a reader who shut it has decided
   * about it, and a dialog that comes back after that is a dialog nobody trusts
   * the close button on.
   */
  markRead(): void {
    if (local_storage_available()) localStorage.setItem(SEEN_KEY, WHATS_NEW_VERSION);
  }

  /**
   * Show them, unconditionally -- the caller decides whether they are due.
   *
   * Shown over a shared mechanism as well as an empty grid, which is where this
   * parts company with the tutorial. The tutorial stays away from somebody
   * else's linkage because it is a lesson in drawing your own and it lives in
   * the drawer for as long as it takes. These are eight lines and a button, and
   * a reader opening a link into a layout that has moved since July is the one
   * who most needs them.
   */
  show(): void {
    this.dialog
      .open(WhatsNewComponent, { autoFocus: false, maxWidth: '92vw', panelClass: 'whatsNewPanel' })
      .afterClosed()
      .subscribe(() => this.markRead());
  }
}
