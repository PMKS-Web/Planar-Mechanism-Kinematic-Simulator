import './joint';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { GhostBody } from './mechanism/anchor';
import { ghostArtwork } from './ghost-artwork';

describe('a held ghost follows drawing style without changing its held shape', () => {
  it('retains the last reachable geometry after an edit and a zoom', () => {
    const a = new RevJoint('A', 0, 0),
      b = new RevJoint('B', 400, 0);
    const link = new RealLink('AB', [a, b]);
    const ghost = (): GhostBody => ({
      d: link.d,
      fill: link.fill,
      transform: '',
      linkId: link.id,
      move: {
        from: { x: 0, y: 0 },
        to: { x: 400, y: 0 },
        there: { x: 100, y: 100 },
        thereEnd: { x: 100, y: 500 },
      },
    });
    const held = ghost();
    ghostArtwork(held, link, [], 20, false, '');
    const larger = ghostArtwork(ghost(), link, [], 60, false, '');
    const lines = ghostArtwork(ghost(), link, [], 60, true, '');
    b.x = 800;
    b.y = 200;
    expect(ghostArtwork(held, link, [], 60, false, '')).toBe(larger);
    expect(ghostArtwork(held, link, [], 60, true, '')).toBe(lines);
    expect([b.x, b.y]).toEqual([800, 200]);
  });
});
