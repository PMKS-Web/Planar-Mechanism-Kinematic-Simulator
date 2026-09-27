import './joint';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { GhostBody } from './mechanism/anchor';
import { ghostArtwork } from './ghost-artwork';
import { cylindersIn } from './cylinder';
import { ram } from '../../test-utils/cylinder-graph';

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

describe('a cylinder ghost keeps the live skin corners', () => {
  it('keeps square cuts for both members across display scales', () => {
    const parts = ram();
    const cylinders = cylindersIn(parts.joints);
    for (const link of [parts.barrel, parts.rod]) {
      const [from, to] = link.joints;
      const body: GhostBody = {
        d: link.d,
        fill: link.fill,
        transform: '',
        linkId: link.id,
        move: { from, to, there: from, thereEnd: to },
      };
      for (const scale of [20, 60]) {
        const path = ghostArtwork(body, link, cylinders, scale, false, '');
        expect(path.replace(/[^A-Za-z]/g, '')).toBe('MLALZ');
        expect(path).not.toContain('NaN');
      }
    }
  });
});
