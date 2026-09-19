/**
 * The names joints go by, and the one rule that hands them out.
 *
 * Two copies of this rule used to stand a directory apart:
 * `MechanismService.determineNextLetter`, which names a joint the reader has
 * just drawn, and a private twin in `services/transcoding/mechanism-builder.ts`,
 * which names a seal an old payload stored under an interior name. The builder's
 * copy existed because it is naming joints in a list it holds itself, before
 * that list has become anybody's mechanism — a reason to want the rule without
 * the service, not a reason to want a second rule. Stated once here, over a set
 * of taken ids and nothing else, both callers can have it.
 */

/**
 * The letters a joint id is made of when nothing has hung a number off it.
 *
 * Fifty-two of them, and their order is the ranking: a drawing's next joint is
 * the one after the highest letter in use. Case matters, and lower case comes
 * after upper, so the joint after Z is a.
 */
export const JOINT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Whether this id is a name the reader can be shown: letters and nothing else. */
export function isLetteredId(id: string): boolean {
  return id.length > 0 && [...id].every((letter) => JOINT_ALPHABET.includes(letter));
}

/**
 * The next free id over a set of ids already in use.
 *
 * The highest letter in use plus one, which is what a reader expects of a
 * drawing they are building up. It used to be that in character codes, which
 * walks straight off the end of the alphabet: the joint after Z was called
 * "[", then "\", then "]" -- names that read as damage, and that the panels
 * then repeated back. Past z the gaps left by deleted joints are filled, and
 * past those a two-letter name is used; a drawing with fifty-three live joints
 * has run out of single letters honestly.
 *
 * An interior name (`A1`) has no place in the alphabet, which is exactly what
 * keeps the joints nothing ever shows from pushing the next letter along.
 */
export function nextFreeLetter(taken: ReadonlySet<string>): string {
  let highest = -1;
  taken.forEach((id) => {
    const at = JOINT_ALPHABET.indexOf(id);
    if (at > highest) highest = at;
  });

  const next = JOINT_ALPHABET[highest + 1];
  if (next !== undefined && !taken.has(next)) return next;

  const free = [...JOINT_ALPHABET].find((letter) => !taken.has(letter));
  if (free !== undefined) return free;

  for (const first of JOINT_ALPHABET) {
    for (const second of JOINT_ALPHABET) {
      if (!taken.has(first + second)) return first + second;
    }
  }
  return 'A';
}

/**
 * Names for the joints inside a part, which nothing ever shows.
 *
 * Hung off the letter of the part's own mount and numbered -- A1, A2, A3 -- so
 * they read as belonging to it, and so `nextFreeLetter` walks past them. They
 * still have to be unique, because two cylinders can share a mount and would
 * otherwise ask for the same name.
 */
export function interiorNames(base: string, count: number, taken: ReadonlySet<string>): string[] {
  const used = new Set(taken);
  const names: string[] = [];
  for (let index = 1; names.length < count; index++) {
    const candidate = `${base}${index}`;
    if (used.has(candidate)) continue;
    used.add(candidate);
    names.push(candidate);
  }
  return names;
}
