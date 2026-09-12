import { CenterGeometry, ProjectivePoint } from '../../model/mechanism/instant-center-solver';
import { instantCenterLines } from './instant-center-lines';

function geometry(p: ProjectivePoint, q: ProjectivePoint): CenterGeometry {
  return {
    bodies: [],
    bodyOf: new Map(),
    origin: [20, -30],
    scale: 10,
    centers: [
      { id: 'a', bodies: ['0', '1'], kind: 'fixed', location: 'finite', point: p },
      { id: 'b', bodies: ['0', '2'], kind: 'fixed', location: 'finite', point: q },
      {
        id: 'c',
        bodies: ['1', '2'],
        kind: 'secondary',
        location: 'infinite',
        construction: [
          ['a', 'b'],
          ['b', 'a'],
        ],
      },
    ],
  };
}

describe('instant-center construction lines', () => {
  const corner = { x: 0, y: -50 };
  const opposite = { x: 40, y: -10 };
  it('extends a vertical line through finite centers to the view and deduplicates it', () => {
    const lines = instantCenterLines(geometry([0, 0, 1], [0, 1, 1]), corner, opposite);
    expect(lines.length).toBe(1);
    expect(lines[0].start).toEqual({ x: 20, y: -50 });
    expect(lines[0].end).toEqual({ x: 20, y: -10 });
  });
  it('uses a center at infinity as a parallel direction, with reversed view corners', () => {
    const lines = instantCenterLines(geometry([1, 0, 0], [0, 0, 1]), opposite, corner);
    expect(lines[0].start).toEqual({ x: 0, y: -30 });
    expect(lines[0].end).toEqual({ x: 40, y: -30 });
  });
  it('clips a diagonal through box corners without a zero-length segment', () => {
    const lines = instantCenterLines(geometry([0, 0, 1], [1, 1, 1]), corner, opposite);
    expect(lines[0].start).toEqual(corner);
    expect(lines[0].end).toEqual(opposite);
  });
  it('omits invisible, coincident and entirely infinite lines', () => {
    for (const [p, q] of [
      [
        [3, 0, 1],
        [3, 1, 1],
      ],
      [
        [0, 0, 1],
        [0, 0, 1],
      ],
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
    ] as [ProjectivePoint, ProjectivePoint][]) {
      expect(instantCenterLines(geometry(p, q), corner, opposite)).toEqual([]);
    }
  });
});
