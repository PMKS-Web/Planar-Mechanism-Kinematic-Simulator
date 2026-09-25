// Types only, so a plain Node script can load this file without the model classes.
import type { FamilyMatch } from './family-check';
import type { LooksLikeGate } from './looks-like-gate';

/**
 * PROTOTYPE -- the model's answer, made into what the panel draws.
 *
 * Everything here is PMKS+ checking the model against what it already knows,
 * so a note reads the same whichever model wrote it and however carefully:
 *
 * - Every part the note names becomes a piece of the sentence that points at
 *   it, the `Prose` shape of `model/prose.ts` on feature/explain-blockers-check-
 *   answers, so the panel draws it with `prose-block` and `part-link` as the
 *   setup drawer does: pointing lights the part, pressing selects it. The model
 *   is asked to bold part names; Gemini Flash-Lite forgot in 4 of 58 replies,
 *   so the names the app knows are found whether bold or not.
 * - "Looks like" and the uses show only when the gate opens
 *   (`looks-like-gate.ts`), and "Looks like" not when it only repeats the family
 *   the Overview already shows.
 * - A term the paragraph does not contain has nothing to underline, and goes.
 */

/** A part the note names, and the words it named it with. */
export interface NotePart {
  /** The part's key, as its Links row and the grid know it: "AB", "A", "A-B". */
  part: string;
  label: string;
}

export type NotePiece = string | NotePart;

export interface ModelAnswer {
  plainEnglish: string;
  resembles?: string;
  useCases?: { use: string; why: string }[];
  terms?: { term: string; meaning: string }[];
}

export interface PanelNote {
  paragraph: NotePiece[];
  looksLike?: string;
  uses: { use: NotePiece[]; why: NotePiece[] }[];
  terms: { term: string; meaning: string }[];
}

/**
 * What a note may call each part, from the Links table's rows ("link KILMNO
 * (\"Hood\")", "slider C", "cylinder A-B") and the joints' letters: "link AB",
 * "AB", an author's "Hood", "joint A", "slider C", "cylinder A-B", "A-B".
 */
export function noteVocabulary(rows: string[], joints: string[]): Map<string, string> {
  const words = new Map<string, string>();
  for (const row of rows) {
    const named = /^(.*?)\s*\("([^"]+)"\)$/.exec(row);
    const bare = named ? named[1] : row;
    const match = /^(link|slider|pin|cylinder)\s+(\S+)$/.exec(bare);
    if (!match) continue;
    const [, kind, key] = match;
    words.set(`${kind} ${key}`, key);
    // A bare two-letter id is unambiguous; a bare single letter ("A") is a word.
    if (key.length > 1) words.set(key, key);
    if (named) words.set(named[2], key);
  }
  for (const joint of joints)
    for (const kind of ['joint', 'slider', 'pin', 'point']) words.set(`${kind} ${joint}`, joint);
  return words;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The note's sentence as pieces: text, and each part it names as a part. */
export function notePieces(text: string, words: Map<string, string>): NotePiece[] {
  const pieces: NotePiece[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = pieces.at(-1);
    if (typeof last === 'string') pieces[pieces.length - 1] = last + t;
    else pieces.push(t);
  };
  // A bold span is the model saying "this is a part": its words, and the part
  // they resolve to, with or without the kind in front.
  // The sheet writes a named part as `link KILMNO ("Hood")`, and so does a note
  // that copies it: the name in quotes belongs to the same link.
  const resolve = (label: string) => {
    const bare = label.replace(/\s*\("[^"]*"\)$/, '');
    return (
      words.get(bare) ??
      words.get(bare.replace(/^(link|joint|slider|pin|point|cylinder)\s+/i, '')) ??
      (/^[A-Z]$/.test(bare) ? bare : undefined)
    );
  };
  const known = [...words.keys()].sort((a, b) => b.length - a.length).map(escape);
  const unbolded = known.length
    ? new RegExp(`(?<![\\w-])(${known.join('|')})(?![\\w-])(\\s*\\("[^"]*"\\))?`, 'g')
    : undefined;
  const scan = (t: string) => {
    if (!unbolded) return pushText(t);
    let at = 0;
    for (const m of t.matchAll(unbolded)) {
      pushText(t.slice(at, m.index));
      pieces.push({ part: words.get(m[1])!, label: m[0] });
      at = m.index! + m[0].length;
    }
    pushText(t.slice(at));
  };
  let at = 0;
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    scan(text.slice(at, m.index));
    const part = resolve(m[1].trim());
    if (part) pieces.push({ part, label: m[1].trim() });
    else pushText(m[1]);
    at = m.index! + m[0].length;
  }
  scan(text.slice(at));
  return pieces;
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Words a family's name shares with any linkage's description, which say nothing on their own. */
const SHAPE_WORDS = new Set(['mechanism', 'linkage', 'four', 'six', 'bar', 'a', 'the', 'of']);

/**
 * Whether "Looks like" only says the family again: every telling word of a
 * family PMKS+ matched is in it ("walking beam mechanism", "Watt six-bar function
 * generator"). "Steam locomotive driving wheels" beside "steam-locomotive running
 * gear" names a machine, not the family, and stays.
 */
export function echoesFamily(resembles: string, families: FamilyMatch[]): boolean {
  const said = new Set(plain(resembles).split(' '));
  return families.some((f) => {
    const telling = plain(f.family)
      .split(' ')
      .filter((w) => !SHAPE_WORDS.has(w));
    return telling.length > 0 && telling.every((w) => said.has(w));
  });
}

export function panelNote(
  answer: ModelAnswer,
  words: Map<string, string>,
  gate: LooksLikeGate,
  families: FamilyMatch[]
): PanelNote {
  const text = answer.plainEnglish ?? '';
  const resembles = (answer.resembles ?? '').trim();
  return {
    paragraph: notePieces(text, words),
    looksLike: gate.show && resembles && !echoesFamily(resembles, families) ? resembles : undefined,
    uses: gate.show
      ? (answer.useCases ?? []).map((u) => ({
          use: notePieces(u.use, words),
          why: notePieces(u.why, words),
        }))
      : [],
    terms: (answer.terms ?? []).filter(
      (t) => t.term && text.toLowerCase().includes(t.term.toLowerCase())
    ),
  };
}
