/**
 * Whether a field is being pointed at or typed in, and telling the canvas so.
 *
 * Pointing at a number in a panel draws that number on the grid, where it is
 * measured. Four blocks decide that independently -- `input-block`,
 * `dual-input-block`, `hold-field-block` and `toggle-block` -- and before this
 * they each held their own pair of booleans and their own emit.
 *
 * They had also drifted apart on the one rule that is not obvious, and three
 * of them had it wrong:
 *
 * **A wanted overlay is re-asserted every time, not only when it changes.**
 * The canvas clears its overlays whenever the selected object announces
 * itself, which a committed edit makes it do for the object being edited. The
 * block is not rebuilt by that, so a block that only emits on a change goes on
 * believing the dimension is still drawn. Nothing then re-asks for it: pointing
 * at the same field again is a no-change, and the dimension stays gone until
 * the reader selects something else and comes back. `input-block` had learned
 * this and carried the comment; the other three had not.
 *
 * So the rule lives here once, and "no change" is only ever an early return on
 * the way *out* -- an overlay nobody has asked for does not need saying again.
 */
export class FieldOverlay<T> {
  private hovered = false;
  private focused = false;
  private showing = false;

  /**
   * @param emit      how this block tells the canvas -- usually an `output`.
   * @param shown     the value that means "draw it", read when it is wanted so
   *                  a block whose id is an input is always current.
   * @param hidden    the value that means "take it away".
   * @param available whether the field can be pointed at at all. A disabled
   *                  field draws nothing; two of the four blocks consulted
   *                  this and two did not.
   */
  constructor(
    private readonly emit: (value: T) => void,
    private readonly shown: () => T,
    private readonly hidden: () => T,
    private readonly available: () => boolean = () => true
  ) {}

  hover(over: boolean): void {
    this.hovered = over;
    this.announce();
  }

  focus(focused: boolean): void {
    this.focused = focused;
    this.announce();
  }

  private announce(): void {
    const wants = this.available() && (this.hovered || this.focused);
    // Re-asserted while wanted; silent only when it was already gone.
    if (!wants && !this.showing) return;
    this.showing = wants;
    this.emit(wants ? this.shown() : this.hidden());
  }
}
