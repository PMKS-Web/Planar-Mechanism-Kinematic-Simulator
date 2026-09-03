import { transformRigidPath } from './compound-link-path';
import { Coord } from './coord';
import { RevJoint } from './joint';
import { RealLink } from './link';

/**
 * A solved sample's link carries its artwork across from the sample it was
 * built from -- but only when something reads it. A sweep builds every link at
 * every sample and draws one, so copying at construction was most of what a
 * drag cost. What has to stay true is that a reader cannot tell the difference.
 */

function bar(id: string, ax: number, ay: number, bx: number, by: number): RealLink {
  const a = new RevJoint(id[0], ax, ay);
  const b = new RevJoint(id[1], bx, by);
  const link = new RealLink(id, [a, b], 2, 3);
  a.links.push(link);
  b.links.push(link);
  return link;
}

/** The same link, moved to where a later sample put its pins. */
function sampleOf(source: RealLink, ax: number, ay: number, bx: number, by: number): RealLink {
  const a = new RevJoint(source.joints[0].id, ax, ay);
  const b = new RevJoint(source.joints[1].id, bx, by);
  return new RealLink(
    source.id,
    [a, b],
    source.mass,
    source.massMoI,
    new Coord(ax, ay),
    [],
    source
  );
}

const deferred = (link: RealLink): boolean =>
  (link as unknown as { visualSource?: object }).visualSource !== undefined;

describe('a solved sample defers copying its link artwork', () => {
  it('waits until the path is read, then answers with the rigid move of the source', () => {
    const source = bar('AB', 0, 0, 400, 0);
    const moved = sampleOf(source, 100, 50, 100 + 400 * Math.SQRT1_2, 50 + 400 * Math.SQRT1_2);
    expect(deferred(moved)).toBe(true);
    expect(moved.isVisualGeometryCurrent).toBe(true);

    const expected = transformRigidPath(
      source.d,
      source.joints[0],
      source.joints[1],
      moved.joints[0],
      moved.joints[1]
    );
    expect(moved.d).toBe(expected);
    expect(deferred(moved)).toBe(false);
    expect(moved.externalLines.length).toBe(source.externalLines.length);
    expect(moved.initialExternalLines.length).toBe(source.initialExternalLines.length);
  });

  it('realizes through the outline as well as through the path', () => {
    const source = bar('AB', 0, 0, 400, 0);
    const moved = sampleOf(source, 0, 0, 0, 400);
    const lines = moved.externalLines;
    expect(deferred(moved)).toBe(false);
    expect(lines.length).toBe(source.externalLines.length);
    // The outline came with the pins, not from the source's place.
    const ys = lines.flatMap((line) => [line.startPosition.y, line.endPosition.y]);
    expect(Math.max(...ys)).toBeGreaterThan(300);
  });

  it('forgets the source once a path is assigned or rebuilt', () => {
    const source = bar('AB', 0, 0, 400, 0);
    const assigned = sampleOf(source, 0, 0, 0, 400);
    assigned.d = 'M 0 0 L 1 1 Z';
    expect(deferred(assigned)).toBe(false);
    expect(assigned.d).toBe('M 0 0 L 1 1 Z');

    const rebuilt = sampleOf(source, 0, 0, 0, 400);
    rebuilt.reComputeDPath();
    expect(deferred(rebuilt)).toBe(false);
    expect(rebuilt.d).toBe(bar('AB', 0, 0, 0, 400).d);
  });

  it('builds the center-of-mass marks on first read and again after the center moves', () => {
    const link = bar('AB', 0, 0, 400, 0);
    expect(link.CoM_d1).toContain('M' + link.CoM.x + ' ' + link.CoM.y);
    link.CoM = new Coord(1000, 2000);
    link.updateCoMDs();
    expect(link.CoM_d3).toContain('M1000 2000');
  });
  it('carries the artwork from where the source stood when the sample was made', () => {
    // The source is the editable link, and the display moves its joints and
    // rewrites its path before a sample's outline is first read. Read live,
    // the move from source to sample was the identity and the body stayed a
    // frame behind its pins.
    const source = bar('AB', 0, 0, 4, 0);
    const expected = transformRigidPath(
      source.d,
      source.joints[0],
      source.joints[1],
      { x: 1, y: 1 },
      { x: 1, y: 5 }
    );
    const sample = sampleOf(source, 1, 1, 1, 5);
    expect(deferred(sample)).toBe(true);
    // The display moves on before anything reads the sample.
    source.joints[0].x = 10;
    source.joints[0].y = 10;
    source.joints[1].x = 14;
    source.joints[1].y = 10;
    source.d = 'M 99 99 L 100 100 Z';
    expect(sample.d).toBe(expected);
  });
});
