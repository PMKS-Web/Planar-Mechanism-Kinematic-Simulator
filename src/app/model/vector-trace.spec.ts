import {
  arrowPath,
  arrowSampleIndices,
  buildVectorTrace,
  LONGEST_ARROW_FRACTION,
  PATH_ARROW_COUNT,
  planar,
} from './vector-trace';

/**
 * What a vector trace has to get right is the one thing a graph cannot help
 * with: size. Velocity, acceleration and force have three different units and
 * none of them is a length, so an arrow drawn in model units is either a dot
 * or a mile. Everything below is about the arithmetic that picks a size.
 */
describe('vector traces', () => {
  const straight = (index: number) => ({ x: index, y: 0 });

  describe('how many arrows, and where', () => {
    it('spaces them across the cycle and lands on both ends', () => {
      const indices = arrowSampleIndices(360);
      expect(indices.length).toBe(PATH_ARROW_COUNT);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(359);
    });

    it('never asks for more arrows than there are samples', () => {
      expect(arrowSampleIndices(5)).toEqual([0, 1, 2, 3, 4]);
      expect(arrowSampleIndices(1)).toEqual([0]);
      expect(arrowSampleIndices(0)).toEqual([]);
    });
  });

  describe('scale', () => {
    // The whole reason this module exists: the same drawing has to carry a
    // velocity of 12 in/s and an acceleration of 900 in/s^2 without one of
    // them leaving the screen.
    it('draws the largest value of a cycle at a fixed fraction of the machine', () => {
      const trace = buildVectorTrace(4, straight, straight, 100)!;
      expect(trace.largest).toBe(3);
      expect(trace.scale * trace.largest).toBeCloseTo(100 * LONGEST_ARROW_FRACTION, 6);
    });

    it('normalises each quantity against its own maximum', () => {
      const slow = buildVectorTrace(4, straight, straight, 100)!;
      const fast = buildVectorTrace(4, straight, (index) => ({ x: index * 1000, y: 0 }), 100)!;
      // A thousand times the numbers, the same longest arrow on the drawing.
      expect(fast.scale * fast.largest).toBeCloseTo(slow.scale * slow.largest, 6);
    });

    it('draws nothing for a quantity that is zero all cycle', () => {
      expect(buildVectorTrace(4, straight, () => ({ x: 0, y: 0 }), 100)).toBeUndefined();
    });

    it('draws nothing for a machine with no size to scale against', () => {
      expect(buildVectorTrace(4, straight, straight, 0)).toBeUndefined();
    });
  });

  describe('the path', () => {
    it('leaves out an arrow the solver could not answer for', () => {
      const trace = buildVectorTrace(
        4,
        straight,
        (index) => (index === 2 ? undefined : { x: index + 1, y: 0 }),
        100
      )!;
      // Three of the four samples carry an arrow, and each is a shaft and two
      // barbs -- three subpaths, so three moves.
      expect(trace.d.split('M').length - 1).toBe(9);
    });

    it('drops an arrow of no length rather than drawing a blot', () => {
      expect(arrowPath([{ x: 0, y: 0, dx: 0, dy: 0 }])).toBe('');
    });
  });

  describe('reading a solved sample', () => {
    it('takes the plane part and refuses a sample that did not solve', () => {
      expect(planar([3, 4, 5])).toEqual({ x: 3, y: 4 });
      expect(planar([Number.NaN, Number.NaN, Number.NaN])).toBeUndefined();
      expect(planar([])).toBeUndefined();
    });
  });
});
