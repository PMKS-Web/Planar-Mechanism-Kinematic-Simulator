import type { Link } from './link';
import { linkSkeletonPath } from './link-skeleton';

const bar = (...points: [number, number][]) =>
  ({ joints: points.map(([x, y]) => ({ x, y })) }) as unknown as Link;

/** The corners a path visits, in order. */
const corners = (path: string): string[] =>
  [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => `${x},${y}`);

describe('linkSkeletonPath', () => {
  it('draws a two-joint bar as the line between its joints', () => {
    expect(linkSkeletonPath(bar([0, 0], [4, 1]))).toBe('M 0 0 L 4 1');
  });

  it('traces a plate round its outside rather than in the order its joints were made', () => {
    // Made corner, far corner, corner, corner: joined in order, a bow tie.
    const path = linkSkeletonPath(bar([0, 0], [2, 1], [2, 0], [0, 1]));
    const ring = corners(path);
    expect(ring.length).toBe(4);
    expect(path.endsWith('Z')).toBe(true);
    // Each step along the ring is a side of the rectangle, never a diagonal.
    const at = ring.map((c) => c.split(',').map(Number));
    for (let i = 0; i < 4; i++) {
      const [a, b] = [at[i], at[(i + 1) % 4]];
      expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
    }
  });

  it('leaves a joint inside the plate off its outline', () => {
    const ring = corners(linkSkeletonPath(bar([0, 0], [4, 0], [1, 1], [2, 4])));
    expect(ring).not.toContain('1,1');
    expect(ring.length).toBe(3);
  });
});
