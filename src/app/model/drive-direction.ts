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
