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
  mass: 'That is not a mass. Type a number, with or without a unit — 5, 5 g, 0.2 lb.',
  momentOfInertia:
    'That is not a moment of inertia. Type a number, with or without a unit — 4, 4 kg·cm².',
  force: 'That is not a force. Type a number, with or without a unit — 10, 10 N, 2.5 lb.',
  name: 'A name has to be letters or numbers, and cannot be one already in use.',
} as const;
