/**
 * Which way a signed drive speed turns the mechanism on screen.
 *
 * **Negative is clockwise.** That is not a rule anybody can derive from the
 * arithmetic, and reasoning about it from the y-flip gets it wrong as often as
 * right: it was settled by playing the four-bar template and looking at four
 * frames of the crank. `drive-direction.spec.ts` is what holds it there.
 *
 * It lives here because it was in eight places. The pin's arrow glyph, the
 * transport's note and its rotate icon, the Edit panel's direction control, the
 * analysis setup's "12.00 RPM CW", the DXF export and synthesis each spelled
 * `speed < 0` out for themselves, and one of them -- the transport's row for a
 * machine whose solve is deferred -- had it backwards for a week. A rule
 * written down eight times is a rule that will disagree with itself.
 *
 * Zero is not a direction. A joint stores zero to mean "follow the document's
 * default", which `driveSpeedOf` resolves to a real signed speed before
 * anything asks this.
 */
export function turnsClockwise(signedSpeed: number): boolean {
  return signedSpeed < 0;
}

/**
 * The same fact backwards: the signed speed that turns a given way.
 *
 * For the places that have a direction and a magnitude and need the number --
 * synthesis dropping its linkage in turning the way its preview turned, and the
 * Edit panel's direction toggle.
 */
export function speedTurning(clockwise: boolean, magnitude: number): number {
  return clockwise ? -Math.abs(magnitude) : Math.abs(magnitude);
}

/**
 * The three kinds of drive, which do not share their words.
 *
 * A pin turns, so its two directions are the two senses of a turn. A cylinder
 * opens and closes -- it is the one part whose directions have names an
 * engineer already uses, and the vocabulary carries them. **A bare block on a
 * slot has neither pair**: there is nothing about it to be open or shut, so it
 * is named for the slot it runs in, and "forward" means along that slot
 * whichever way it happens to point. The slot's own angle is stated right
 * beside every control that says this.
 */
export type DriveKind = 'pin' | 'cylinder' | 'slider';

/**
 * The one table. Read as "the word for a drive whose signed speed is negative",
 * then "the word for a positive one" -- which is `turnsClockwise` above, so a
 * caller that has a speed has the index already.
 */
const DIRECTION_WORDS: Record<DriveKind, { clockwise: string; counter: string }> = {
  pin: { clockwise: 'Clockwise', counter: 'Counter-clockwise' },
  cylinder: { clockwise: 'Closing', counter: 'Opening' },
  slider: { clockwise: 'Backward', counter: 'Forward' },
};

/** Which kind of drive a driven joint is, from the two facts that decide it. */
export function driveKindOf(linear: boolean, sealed: boolean): DriveKind {
  if (!linear) return 'pin';
  return sealed ? 'cylinder' : 'slider';
}

/**
 * Which way this drive is going, in one word.
 *
 * The transport's note, the Edit panel's button and every readiness fact quote
 * this rather than spelling a pair of words out again. They used to spell three
 * pairs between them and two of the three disagreed: the transport said
 * *Opening* and *Closing* of **any** linear drive, so a block sliding along a
 * rail -- which has nothing to open -- was reported as opening it.
 */
export function driveDirectionWord(kind: DriveKind, clockwise: boolean): string {
  const words = DIRECTION_WORDS[kind];
  return clockwise ? words.clockwise : words.counter;
}

/**
 * The same word where there is room to name what it is measured along.
 *
 * Only a bare slider has anything to add: a turn and a cylinder's stroke are
 * self-explanatory, and a slot's "forward" is not until the slot is named.
 */
export function driveDirectionLabel(kind: DriveKind, clockwise: boolean): string {
  const word = driveDirectionWord(kind, clockwise);
  return kind === 'slider' ? `${word} along slot` : word;
}

/**
 * The glyph that says the same thing as the word.
 *
 * A turn is drawn as a turn and a translation as a straight arrow, which is the
 * distinction the reader is looking at: the transport drew `rotate_right` for
 * **every** drive, so a cylinder read *Opening* beside an icon of something
 * spinning. They come from one function so the pair cannot drift again -- the
 * caller passes the boolean it words the row with, and gets the glyph for it.
 *
 * Material ligature names, the ones the Edit panel's direction button already
 * uses. Nothing here is a registered SVG, so nothing has to be added to
 * `AppComponent`'s icon registry.
 */
export function driveDirectionIcon(kind: DriveKind, clockwise: boolean): string {
  if (kind === 'pin') return clockwise ? 'rotate_right' : 'rotate_left';
  return clockwise ? 'arrow_back' : 'arrow_forward';
}

/**
 * Both words, lowercase, for the middle of a sentence a field's help is made
 * of: "opening or closing", "forward or backward along its slot".
 */
export function driveDirectionPair(kind: DriveKind): string {
  const words = DIRECTION_WORDS[kind];
  const pair = `${words.counter.toLowerCase()} or ${words.clockwise.toLowerCase()}`;
  return kind === 'slider' ? `${pair} along its slot` : pair;
}

/**
 * The same fact read off the transport's own coordinate rather than off a
 * speed.
 *
 * The scrub handle measures the input, and which way that coordinate runs is
 * not the same for the two kinds: a crank's is negated so that a **clockwise**
 * drive runs the handle left to right (`drive-profile.ts`), while a ram's is
 * its own extension, so a **positive** speed runs it left to right. One place
 * for that inversion, because the two word tables above are each right and only
 * the boolean between them flips.
 */
export function driveTurnsClockwiseWhileRising(kind: DriveKind, rising: boolean): boolean {
  return kind === 'pin' ? rising : !rising;
}
