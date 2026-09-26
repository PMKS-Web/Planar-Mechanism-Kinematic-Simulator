import { bodyLabelParts } from './body-label';
import { Cylinder, cylinderOfBarIn } from './cylinder';
import { frozenCylinderName } from './cylinder-frozen';
import { Joint, RealJoint } from './joint';
import { Link } from './link';

/**
 * A sentence that names parts of the drawing, kept as its pieces: the text,
 * and each part it names with what the sentence calls it. A surface that shows
 * one draws each part as a `part-link` -- pointing at it lights the part on the
 * grid, and pressing it selects the part -- without parsing a sentence back
 * apart to find them.
 */

/**
 * A part a sentence names. Drawn as a `part-link`: pointing at it lights the
 * part on the grid, and pressing it selects the part.
 */
export interface PartRef {
  part: Joint | Link;
  /** What the sentence calls it: "joint C", "link DE", "slider D", "cylinder EF". */
  label: string;
}

/**
 * A sentence that names parts, as its pieces.
 */
export type Prose = ReadonlyArray<string | PartRef>;

export const isPart = (piece: string | PartRef): piece is PartRef => typeof piece !== 'string';

/** What a reader calls a joint: its name if it has one, else its letter. */
export const nameOf = (joint: Joint): string => (joint as RealJoint).name || joint.id;

export const jointRef = (joint: Joint): PartRef => ({
  part: joint,
  label: `joint ${nameOf(joint)}`,
});

export const sliderRef = (joint: Joint): PartRef => ({
  part: joint,
  label: `slider ${nameOf(joint)}`,
});

/**
 * A link as its own panel titles it, lower-cased for a sentence: "link BC", or
 * "barrel AC" and "rod CB" for a cylinder's two members.
 */
export function linkRef(link: Link, cylinders: readonly Cylinder[]): PartRef {
  const { noun, name } = bodyLabelParts(link, cylinderOfBarIn(cylinders, link), cylinders);
  return { part: link, label: `${noun.toLowerCase()} ${name}` };
}

/**
 * A whole cylinder, named by its two end joints. It points at the barrel,
 * because pointing at either member lights the whole part on the grid.
 */
export const cylinderRef = (cylinder: Cylinder): PartRef => ({
  part: cylinder.barrel,
  label: `cylinder ${frozenCylinderName(cylinder)}`,
});

/**
 * Builds a sentence from text and parts: prose`Set ${jointRef(c)} to Revolute`.
 * A value may be a string, a number, a part, or another sentence.
 */
export function prose(
  strings: TemplateStringsArray,
  ...values: (string | number | PartRef | Prose)[]
): Prose {
  const pieces: (string | PartRef)[] = [];
  const push = (piece: string | PartRef) => {
    if (typeof piece === 'string') {
      if (!piece) return;
      const last = pieces.at(-1);
      if (typeof last === 'string') {
        pieces[pieces.length - 1] = last + piece;
        return;
      }
    }
    pieces.push(piece);
  };
  strings.forEach((text, index) => {
    push(text);
    if (index >= values.length) return;
    const value = values[index];
    if (typeof value === 'number') push(String(value));
    else if (typeof value === 'string' || !Array.isArray(value)) push(value as string | PartRef);
    else (value as Prose).forEach(push);
  });
  return pieces;
}

/**
 * Parts as a sentence lists them: "joint A", "joint A and joint B", "link BC,
 * link CD and link DE", "link AB, link BC and 3 more". Three are named; past
 * that two are, because a summary has sixteen words to spend. Never "and 1
 * more": the one it would stand for is as short as the phrase.
 */
export function listOf(refs: PartRef[]): Prose {
  const shown = refs.length > 3 ? refs.slice(0, 2) : refs;
  const rest = refs.length - shown.length;
  const items: (string | PartRef)[] = [...shown, ...(rest > 0 ? [`${rest} more`] : [])];
  const pieces: (string | PartRef)[] = [];
  items.forEach((item, index) => {
    if (index > 0) pieces.push(index === items.length - 1 ? ' and ' : ', ');
    pieces.push(item);
  });
  return prose`${pieces}`;
}

/** The sentence as plain text, for a tooltip, a row, or a test. */
export function textOf(sentence: Prose): string {
  return sentence.map((piece) => (isPart(piece) ? piece.label : piece)).join('');
}

/** "Joint C can't turn" from "joint C can't turn": a sentence that opens on a part. */
export const capitalized = (text: string): string =>
  text ? text[0].toUpperCase() + text.slice(1) : text;

/** The words in a piece of text, the way the spec's budgets count them. */
export const wordCount = (text: string): number =>
  text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
