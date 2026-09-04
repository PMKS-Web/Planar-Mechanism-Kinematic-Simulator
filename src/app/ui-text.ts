/**
 * The words the app says out loud.
 *
 * Not every string in the UI lives here — labels and tooltips stay next to the
 * control they belong to, where they can be read alongside it. What lives here
 * is the text that is *said in more than one place*, or said in reply to
 * something going wrong. Those are the two kinds that drift: the same situation
 * gets a second wording in a second file, and a refusal written in a hurry
 * names a field instead of saying what to do about it.
 *
 * See `docs/ui-vocabulary.md` for which word to use for what, and the voice
 * these are written in.
 */

/**
 * What stands between a drawing and a run, said the same way everywhere.
 *
 * There were seven wordings, and a reader could meet five of them on one
 * screen: the mode chip said "1 fix", the bottom bar "1 fix before analysis",
 * the transport row "1 blocker before it will run", the setup header "1 thing
 * has to change before this mechanism will run", and the section chip "1
 * blocker" — with "1 to set" and "One blocker before forces can be solved" on
 * the force side. Seven names for one idea read as seven ideas.
 *
 * There are three states, not seven, and they are genuinely different:
 *
 * - a **fix** has to change before the mechanism will run, and is red;
 * - something **to check** is worth a look and stops nothing, and is amber;
 * - something **to set** is a question nobody has asked yet, and is gray. Force
 *   analysis needs masses and loads, and a drawing that has neither is not
 *   broken — it is one whose author only ever wanted to watch it move. Calling
 *   that a fix would put a fault on the strip from the first bar drawn until
 *   the last mass typed. See `TopBarComponent.chipFor`.
 *
 * All three are counted, because the count is what a reader acts on, and all
 * three are said the same way wherever they appear — so the chip in the corner
 * and the sentence in the drawer are recognizably about the same thing.
 */
export const READINESS = {
  /** "1 fix", "3 fixes" — something is wrong, and the mechanism will not run. */
  fixes(count: number): string {
    return `${count} ${count === 1 ? 'fix' : 'fixes'}`;
  },
  /** "1 to check", "3 to check" — worth a look, and nothing is stopped. */
  toCheck(count: number): string {
    return `${count} to check`;
  },
  /** "1 to set", "3 to set" — a question the reader has not asked yet. */
  toSet(count: number): string {
    return `${count} to set`;
  },
} as const;

/**
 * What to say when a typed value will not parse.
 *
 * By the *kind* of value, not by the field. There were eleven of these, one per
 * cell of the linkage table, and they differed only in naming a field that is
 * already on screen, highlighted, under the cursor — while saying nothing about
 * what would have been accepted.
 *
 * Each one names the units its field will take. Every numeric field in the app
 * accepts "2 cm" and "0.75 in" as readily as "2", and nothing on screen says
 * so; a rejected value is the moment somebody is most willing to be told.
 */
export const NOT_A = {
  length: 'That is not a length. Type a number, with or without a unit — 2, 2 cm, 0.75 in.',
  angle: 'That is not an angle. Type a number, with or without a unit — 90, 90 deg, 1.5 rad.',
  mass: 'Mass must be zero or greater. Type a number, with or without a unit — 5, 5 g, 0.2 lb.',
  momentOfInertia:
    'That is not a moment of inertia. Type a number, with or without a unit — 4, 4 kg·cm².',
  force: 'That is not a force. Type a number, with or without a unit — 10, 10 N, 2.5 lb.',
  name: 'A name has to be letters or numbers, and cannot be one already in use.',
  /**
   * A length that parsed but cannot be one.
   *
   * Kept apart from `length`, which is about the *text*: a reader who typed
   * "-5" typed a number, and telling them it is not one is telling them the
   * wrong thing. The fields used to take it, store the distance without the
   * sign, and go on showing "-5.00 cm" over a bar that was five long.
   */
  positiveLength: 'A length has to be more than zero.',
} as const;
