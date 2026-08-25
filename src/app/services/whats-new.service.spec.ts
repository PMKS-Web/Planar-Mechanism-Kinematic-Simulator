import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { WhatsNewService } from './whats-new.service';
import { WHATS_NEW_VERSION } from '../model/whats-new';

/**
 * The question this service exists to answer is "has this reader been here
 * before", and it answers it from marks other parts of the app leave behind.
 * That makes it exactly the kind of thing a rename breaks silently: nothing
 * would fail, everybody would look like a first-time visitor forever, and the
 * release notes would simply never appear.
 */
describe('WhatsNewService', () => {
  let opened: number;

  beforeEach(() => {
    localStorage.clear();
    opened = 0;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MatDialog,
          useValue: {
            open: () => {
              opened++;
              return { afterClosed: () => ({ subscribe: (fn: () => void) => fn() }) };
            },
          },
        },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  const service = () => TestBed.inject(WhatsNewService);

  it('says nothing to a reader who has never been here', () => {
    expect(service().hasBeenHereBefore()).toBe(false);
    expect(service().unread).toBe(false);
  });

  it('recognizes a reader by any mark the app leaves', () => {
    localStorage.setItem('snapToGrid', 'false');
    expect(service().hasBeenHereBefore()).toBe(true);
    expect(service().unread).toBe(true);
  });

  it('recognizes the mark left by the dialog the touchscreen warning used', () => {
    // Nothing writes `dismiss` any more, and that is the point: whoever has it
    // is a returning reader from before it was removed.
    localStorage.setItem('dismiss', 'true');
    expect(service().unread).toBe(true);
  });

  it('shows once and then never again', () => {
    localStorage.setItem('tutorialSeen', 'true');
    service().show();
    expect(opened).toBe(1);
    expect(localStorage.getItem('whatsNewSeen')).toBe(WHATS_NEW_VERSION);
    expect(service().unread).toBe(false);
  });

  it('greets a returning reader with the notes', () => {
    localStorage.setItem('tutorialSeen', 'true');
    expect(service().greet()).toBe(true);
    expect(opened).toBe(1);
  });

  it('leaves a newcomer current, so notes from before their time cannot reach them', () => {
    // The evidence of a previous visit is marks other parts of the app write
    // when a preference changes. If one of those ever came to be written on
    // first load, a reader who arrived today would be handed a list of what
    // changed before they existed -- unless today's version is already down
    // against their name, which is what this does.
    expect(service().greet()).toBe(false);
    expect(opened).toBe(0);
    expect(localStorage.getItem('whatsNewSeen')).toBe(WHATS_NEW_VERSION);
    localStorage.setItem('snapToGrid', 'false');
    expect(service().unread).toBe(false);
  });

  it('greets quietly for a caller with something better to show', () => {
    localStorage.setItem('tutorialSeen', 'true');
    expect(service().greet({ quietly: true })).toBe(false);
    expect(opened).toBe(0);
    // Unread, so they are still owed them next time.
    expect(service().unread).toBe(true);
  });

  it('speaks again when there are different notes to give', () => {
    localStorage.setItem('tutorialSeen', 'true');
    localStorage.setItem('whatsNewSeen', '2020.01');
    expect(service().unread).toBe(true);
  });
});
