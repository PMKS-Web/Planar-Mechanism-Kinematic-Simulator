import { Joint } from '../joint';
import { Link } from '../link';
import { Prose } from '../prose';
import { NotePiece } from './note-prose';

/**
 * A note's sentence as the panel draws it: each part it names becomes the
 * drawing's own part, so `prose-block` draws it as the `part-link` the setup
 * drawer uses. A key the drawing no longer has -- a note kept from before an
 * edit that deleted the link it names -- stays as the words the note used.
 */
export function noteProse(pieces: NotePiece[], parts: Map<string, Joint | Link>): Prose {
  const sentence: (string | { part: Joint | Link; label: string })[] = [];
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
