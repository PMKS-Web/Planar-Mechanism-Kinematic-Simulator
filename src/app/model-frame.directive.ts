import { Directive, computed, input } from '@angular/core';

/** A point in the drawing's own coordinates. */
export interface ModelPoint {
  x: number;
  y: number;
}

/**
 * Draw everything inside this in the drawing's own coordinates: +y is up.
 *
 * Model coordinates follow the math convention and the screen's do not. The app
 * reconciles the two once, here: a drawing layer wears `modelFrame`, and
 * everything under it is written with the numbers the solver produced -- a
 * joint is `[attr.cy]="joint.y"` and no arithmetic anywhere.
 *
 * It exists as a directive rather than as `style="transform: scaleY(-1)"` on
 * each of two dozen layers because that is the same string a *counter*-flip is
 * spelled with. Reading the template, the layer that establishes the frame and
 * the label inside it that escapes the frame looked identical, and telling them
 * apart meant tracking nesting by hand. Now one says `modelFrame` and the other
 * says `upright`.
 *
 * Anything under here that has to read the right way up -- words, and any asset
 * authored y-down -- puts itself back with `upright`.
 */
@Directive({
  selector: '[modelFrame]',
  host: { '[style.transform]': "'scaleY(-1)'" },
})
export class ModelFrameDirective {}

/**
 * Undo the surrounding `modelFrame` for this one thing.
 *
 * Text drawn under the frame's flip reads upside down, and an asset authored
 * y-down comes out mirrored, so each of those turns itself back over. Inside an
 * `upright` the axes are the screen's again: +y is down, the way the rest of
 * SVG reads, which is what lets a glyph or a pill be laid out with ordinary
 * SVG numbers.
 *
 * Give it the point in the drawing the thing hangs off:
 *
 *     <g [upright]="chip">          -> translate(chip.x, chip.y) scale(1,-1)
 *     <image upright />             -> scale(1,-1), in place
 *     <g [upright]="motor" [uprightTurnedBy]="motor.angle">
 *
 * Bare `upright` flips about the element's own origin, which is what something
 * already placed by its `x`/`y` wants -- an image hung inside a nested `<svg>`
 * that is itself sitting on a joint. `uprightTurnedBy` is degrees, applied
 * before the flip, for a mark that goes round with the part it is bolted to.
 */
@Directive({
  selector: '[upright]',
  host: { '[attr.transform]': 'transform()' },
})
export class UprightDirective {
  /** Where in the drawing this hangs. Omit to flip about the element's origin. */
  readonly upright = input<ModelPoint | '' | undefined>('');

  /** Degrees to turn by before flipping, for a mark that turns with a part. */
  readonly uprightTurnedBy = input<number | undefined>(undefined);

  protected readonly transform = computed(() => {
    const at = this.upright();
    const turn = this.uprightTurnedBy();
    const parts: string[] = [];
    if (at) parts.push(`translate(${at.x},${at.y})`);
    if (turn !== undefined) parts.push(`rotate(${turn})`);
    parts.push('scale(1,-1)');
    return parts.join(' ');
  });
}
