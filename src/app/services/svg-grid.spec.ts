import { SvgGridService, minorDivisionsFor } from './svg-grid.service';
import { MODEL_SCALE } from '../model/render-scale';
import { Coord } from '../model/coord';

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

describe('screenToModel and modelToScreen', () => {
  /*
    The pair has to be symmetric, which the pair it replaced was not:
    `screenToSVG` negated y and `SVGtoScreen` did not, so the two were not each
    other's inverse and nothing said which of them carried the flip.

    Both carry it. The matrix is the pan-zoom viewport's and the viewport sits
    outside the layers that wear `modelFrame`, so a trip through the matrix
    alone lands in a y-down space nothing else in the app speaks.
  */

  /**
   * A view zoomed 2x and panned, standing in for the pan-zoom viewport's.
   *
   * Hand-rolled rather than a `DOMMatrix`, which jsdom does not implement, and
   * only the six numbers and `inverse` are ever read.
   */
  const view = {
    a: 2,
    b: 0,
    c: 0,
    d: 2,
    e: 300,
    f: 400,
    inverse: () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: -150, f: -200 }),
  };

  /** The service with a view on it and nothing else; neither method reads more. */
  const grid = (): SvgGridService => {
    const service = Object.create(SvgGridService.prototype) as SvgGridService;
    service.CTM = view as unknown as SVGMatrix;
    return service;
  };

  it('round-trips a point through both directions', () => {
    const at = new Coord(140, -260);
    const back = grid().screenToModel(grid().modelToScreen(at));
    expect(back.x).toBeCloseTo(at.x, 9);
    expect(back.y).toBeCloseTo(at.y, 9);
  });

  it('round-trips a client pixel the other way round too', () => {
    const pixel = new Coord(812, 137);
    const back = grid().modelToScreen(grid().screenToModel(pixel));
    expect(back.x).toBeCloseTo(pixel.x, 9);
    expect(back.y).toBeCloseTo(pixel.y, 9);
  });

  it('puts a point above the origin in the drawing above it on screen', () => {
    // The whole point of the flip, and the one thing about it worth pinning:
    // +y is up in the drawing and down on the screen, so a higher model y has
    // to come out as a *smaller* client y.
    const origin = grid().modelToScreen(new Coord(0, 0));
    const above = grid().modelToScreen(new Coord(0, 500));
    expect(above.y).toBeLessThan(origin.y);
    expect(above.x).toBeCloseTo(origin.x, 9);
  });

  it('reads a pixel above the origin as being above it in the drawing', () => {
    const origin = grid().screenToModel(new Coord(0, 0));
    const above = grid().screenToModel(new Coord(0, -500));
    expect(above.y).toBeGreaterThan(origin.y);
  });

  it('answers the origin before there is a view to ask', () => {
    // The canvas asks for a conversion before svg-pan-zoom has handed over a
    // matrix, and both used to guard against exactly that.
    const service = Object.create(SvgGridService.prototype) as SvgGridService;
    expect(service.modelToScreen(new Coord(7, 9))).toEqual(new Coord(0, 0));
    expect(service.screenToModel(new Coord(7, 9))).toEqual(new Coord(0, 0));
  });

  it('takes a pointer event as its two numbers', () => {
    const fromXY = grid().screenToModelFromXY(812, 137);
    const fromCoord = grid().screenToModel(new Coord(812, 137));
    expect(fromXY).toEqual(fromCoord);
  });
});

describe('full-motion framing', () => {
  it('bounds every solved frame and converts the drawing to viewport coordinates', () => {
    const service = Object.create(SvgGridService.prototype) as SvgGridService;
    const mechanism = {
      mechanisms: [
        {
          isMechanismValid: () => true,
          joints: [
            [new Coord(-4, -2), new Coord(3, 5)],
            [new Coord(-7, 4), new Coord(9, -6)],
          ],
        },
      ],
    };
    Object.assign(service, {
      injector: { get: () => mechanism },
      settingsService: { objectScale: 2 },
    });

    const box = (
      service as unknown as {
        fullMotionBox(): { x: number; y: number; width: number; height: number } | null;
      }
    ).fullMotionBox()!;

    // 1.3 units of padding around x [-7, 9] and viewport y [-5, 6].
    expect(box.x).toBeCloseTo(-8.3);
    expect(box.y).toBeCloseTo(-6.3);
    expect(box.width).toBeCloseTo(18.6);
    expect(box.height).toBeCloseTo(13.6);
  });
});
