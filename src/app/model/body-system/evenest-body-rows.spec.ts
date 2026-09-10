import { evenestBodyRows } from './evenest-body-rows';

describe('native shared-support regularization', () => {
  it('keeps nearly coincident support reactions bounded through exact coincidence', () => {
    for (const gap of [-1e-8, -1e-12, 0, 1e-12, 1e-8]) {
      const answer = evenestBodyRows(
        [
          [1, 1],
          [0, gap],
        ],
        [10, 0],
        2
      )!;
      expect(answer[0]).toBeCloseTo(5, 6);
      expect(answer[1]).toBeCloseTo(5, 6);
      expect(answer[0] + answer[1]).toBeCloseTo(10, 10);
    }
  });

  it('retains the determinate answer once the supports are separated', () => {
    const answer = evenestBodyRows(
      [
        [1, 1],
        [0, 1],
      ],
      [10, 3],
      2
    )!;
    expect(answer[0]).toBeCloseTo(7, 10);
    expect(answer[1]).toBeCloseTo(3, 10);
  });
});
