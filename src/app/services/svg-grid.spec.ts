import { minorDivisionsFor } from './svg-grid.service';
import { MODEL_SCALE } from '../model/render-scale';

/** A major cell of `units` of the reader's own unit, in model units. */
const major = (units: number) => units * MODEL_SCALE;

/** Whether a step is a number somebody would have chosen: 1, 2 or 5 of a decade. */
function isRound(step: number): boolean {
  if (!(step > 0) || !Number.isFinite(step)) return false;
  const decade = 10 ** Math.floor(Math.log10(step) + 1e-9);
  const mantissa = step / decade;
  return [1, 2, 5, 10].some((one) => Math.abs(one - mantissa) < 1e-6);
}

describe('minorDivisionsFor', () => {
  /*
    The rule the whole grid rests on: a minor line has to land on a number a
    reader would have chosen, exactly as the labeled ones do.

    Dividing every major by five only manages that for the fives. It is where
    this started -- at a major of 2 the lines came out on 0.4, 0.8, 1.2 and
    1.6, so a reader looking at a line labeled 2 had four lines under it and no
    way to find 1, which is the number they were trying to place a joint on.
  */
  it('subdivides so that the minor step is a round number too', () => {
    // Every major the ladder in `cellSizeFor` can produce, over the decades a
    // drawing can be zoomed across. Collected rather than asserted one at a
    // time so a failure names the rung that broke.
    const odd = [0.01, 0.1, 1, 10, 100]
      .flatMap((decade) => [1, 2, 5].map((mantissa) => decade * mantissa))
      .map((units) => ({ units, step: units / minorDivisionsFor(major(units)) }))
      .filter((rung) => !isRound(rung.step));
    expect(odd).toEqual([]);
  });

  it('puts a line on the half wherever the half is itself a round number', () => {
    /*
      The half is what a reader looks for first, and a five-way split of an even
      major can never give it to them: at a major of 2 the nearest lines to 1
      were 0.8 and 1.2.

      Not "whatever the major is", though, which is what this test claimed
      before it was run. Half of 5 is 2.5 and half of 50 is 25, and neither is a
      number anybody would choose -- so on those rungs the two properties are in
      conflict, and being a round number wins. A line at 2.5 would be the same
      complaint in a different place.
    */
    const halvable = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter((units) =>
      isRound(units / 2)
    );
    expect(halvable).toEqual([0.1, 0.2, 1, 2, 10, 20, 100]);
    const missed = halvable
      .map((units) => ({ units, step: units / minorDivisionsFor(major(units)) }))
      // Whether the half falls on a line: it does when it is a whole number of
      // minor steps out from the labeled one.
      .filter(
        (rung) =>
          Math.abs(Math.round(rung.units / 2 / rung.step) - rung.units / 2 / rung.step) > 1e-9
      );
    expect(missed).toEqual([]);
  });

  it('reads the cases from the report', () => {
    // A major of 2 shows 0.5, 1, 1.5 -- the case that was reported.
    expect(minorDivisionsFor(major(2))).toBe(4);
    // A major of 10 shows 1 through 9, so 5 is a line and so is every whole.
    expect(minorDivisionsFor(major(10))).toBe(10);
    // A major of 5 shows 1, 2, 3, 4 -- the one that always worked.
    expect(minorDivisionsFor(major(5))).toBe(5);
  });

  it('subdivides finely enough to be worth drawing, and no finer', () => {
    // Between four and ten lines to a cell. Fewer is a grid with nothing in it;
    // more is a grid a reader cannot count across.
    const outside = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]
      .map((units) => ({ units, divisions: minorDivisionsFor(major(units)) }))
      .filter((rung) => rung.divisions < 4 || rung.divisions > 10);
    expect(outside).toEqual([]);
  });

  it('answers something usable for a major it should never be given', () => {
    // Not reachable from `cellSizeFor`, which only ever hands over a rung of
    // the ladder -- but this is arithmetic on a zoom level, and a zoom of zero
    // or a collapsed canvas has produced a NaN here before.
    expect(minorDivisionsFor(0)).toBe(5);
    expect(minorDivisionsFor(-1)).toBe(5);
    expect(minorDivisionsFor(Number.NaN)).toBe(5);
    expect(minorDivisionsFor(Number.POSITIVE_INFINITY)).toBe(5);
  });

  it('tolerates the float noise the size ladder arrives with', () => {
    // `cellSizeFor` multiplies a power of ten by 1, 2 or 5, which does not
    // always land on the number it names.
    expect(minorDivisionsFor(major(0.30000000000000004 / 0.15))).toBe(4);
    expect(minorDivisionsFor(major(1.9999999999999998))).toBe(4);
    expect(minorDivisionsFor(major(5.000000000000001))).toBe(5);
  });
});
