import { Joint } from '../joint';
import { Link } from '../link';
import { PartRef, Prose } from '../prose';
import { NotePiece } from './note-prose';

/**
 * A note's sentence as the panel draws it: each part it names becomes the
 * drawing's own part, so `prose-block` draws it as the `part-link` the setup
 * drawer uses. A key the drawing no longer has -- a note kept from before an
 * edit that deleted the link it names -- stays as the words the note used.
 */
export function noteProse(pieces: NotePiece[], parts: Map<string, Joint | Link>): Prose {
  const sentence: (string | PartRef)[] = [];
  for (const piece of pieces) {
    const part = typeof piece === 'string' ? undefined : parts.get(piece.part);
    const text = typeof piece === 'string' ? piece : piece.label;
    if (part) {
      sentence.push({ part, label: text });
      continue;
    }
    const last = sentence.at(-1);
    if (typeof last === 'string') sentence[sentence.length - 1] = last + text;
    else sentence.push(text);
  }
  return sentence;
}

/** A term the note explains, where the paragraph first uses it. */
export interface TermRef {
  /** The words as the paragraph has them, capitals and all. */
  text: string;
  meaning: string;
}

export type NoteSentencePiece = string | PartRef | TermRef;

export const isTerm = (piece: NoteSentencePiece): piece is TermRef =>
  typeof piece !== 'string' && 'meaning' in piece;

/**
 * The paragraph with each explained term marked where it is first used, so the
 * meaning is read beside the word it belongs to. A term the text only carries
 * inside a part's name, or not at all, goes unmarked: the model's list is
 * checked against the sentence rather than trusted.
 */
export function withTerms(
  sentence: Prose,
  terms: readonly { term: string; meaning: string }[]
): NoteSentencePiece[] {
  let pieces: NoteSentencePiece[] = [...sentence];
  const longestFirst = [...terms].sort((a, b) => b.term.length - a.term.length);
  for (const { term, meaning } of longestFirst) {
    if (!term.trim()) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(term.trim())}(?![\\p{L}\\p{N}])`, 'iu');
    const at = pieces.findIndex((piece) => typeof piece === 'string' && pattern.test(piece));
    if (at < 0) continue;
    const text = pieces[at] as string;
    const found = pattern.exec(text)!;
    const split: NoteSentencePiece[] = [
      text.slice(0, found.index),
      { text: found[0], meaning },
      text.slice(found.index + found[0].length),
    ].filter((piece) => piece !== '');
    pieces = [...pieces.slice(0, at), ...split, ...pieces.slice(at + 1)];
  }
  return pieces;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
