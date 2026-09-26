import { WHAT_IS_THIS_VERSION, WhatIsThisReply } from '../../model/what-is-this/prompt';

/** Where this browser keeps the notes it has been given. */
const SAVED_KEY = 'whatIsThisNotes';

/** Enough for a term's drawings; each note is about a kilobyte. */
const SAVED_LIMIT = 60;

/** The library templates' notes, written at release time (`npm run what-is-this-library`). */
export const LIBRARY_NOTES_PATH = 'assets/what-is-this/library-notes.json';

/** The shipped file's shape. */
export interface LibraryNotes {
  version: string;
  notes: Record<string, WhatIsThisReply>;
}

/**
 * Every note already written, by its key (`note-key.ts`): the ones this
 * browser was given, kept across visits, and the library's, shipped with the
 * app so a first day of opening library mechanisms asks the model nothing.
 */
export class NoteStore {
  private notes = new Map<string, WhatIsThisReply>();
  private library?: Promise<void>;

  constructor() {
    for (const [key, reply] of Object.entries(readSaved())) this.notes.set(key, reply);
  }

  get(key: string): WhatIsThisReply | undefined {
    return this.notes.get(key);
  }

  /** A note this browser was just given, kept for its next visit. */
  keep(key: string, reply: WhatIsThisReply): void {
    this.notes.set(key, reply);
    const saved = readSaved();
    delete saved[key];
    saved[key] = reply;
    const keys = Object.keys(saved);
    for (const old of keys.slice(0, Math.max(0, keys.length - SAVED_LIMIT))) delete saved[old];
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      // Full or refused: the note still shows for this visit.
    }
  }

  /** The library's notes, fetched once; a missing or older file adds none. */
  loadLibrary(): Promise<void> {
    this.library ??= fetch(new URL(LIBRARY_NOTES_PATH, document.baseURI))
      .then((response) => (response.ok ? response.json() : undefined))
      .then((file: LibraryNotes | undefined) => {
        if (file?.version !== WHAT_IS_THIS_VERSION) return;
        for (const [key, reply] of Object.entries(file.notes ?? {}))
          if (!this.notes.has(key) && isReply(reply)) this.notes.set(key, reply);
      })
      .catch(() => undefined);
    return this.library;
  }
}

function readSaved(): Record<string, WhatIsThisReply> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, reply]) => isReply(reply)));
  } catch {
    return {};
  }
}

/** Only the paragraph is required; everything else the panel can do without. */
function isReply(value: unknown): value is WhatIsThisReply {
  const reply = value as Partial<WhatIsThisReply> | null;
  return typeof reply?.plainEnglish === 'string' && reply.plainEnglish.trim().length > 0;
}
