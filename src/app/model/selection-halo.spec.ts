import type { Link } from './link';
import { RealLink } from './link';
import { selectionHalos } from './selection-halo';

const joint = (id: string, x: number, y: number) => ({ id, x, y });
const bar = (id: string, ...joints: ReturnType<typeof joint>[]) => {
  const link = Object.create(RealLink.prototype) as RealLink;
  Object.assign(link, { id, joints, subset: [] });
  return link;
};
const compound = (id: string, ...parts: RealLink[]) => {
  const link = Object.create(RealLink.prototype) as RealLink;
  Object.assign(link, { id, joints: parts.flatMap((p) => p.joints), subset: parts });
  return link;
};

describe('selectionHalos', () => {
  const [a, b, c] = [joint('A', 0, 0), joint('B', 4, 0), joint('C', 4, 3)];
  const ab = bar('AB', a, b);
  const bc = bar('BC', b, c);
  const body = compound('ABC', ab, bc);
  const plain = bar('CD', c, joint('D', 0, 3));
  const roots: Link[] = [body, plain];

  it('bands a whole body solid along every one of its lines', () => {
    const halos = selectionHalos(roots, (l) => (l === body ? 'link-selected' : ''), undefined, []);
    expect(halos.map((h) => [h.key, h.kind])).toEqual([['ABC', 'picked']]);
    expect(halos[0].d).toBe('M 0 0 L 4 0 M 4 0 L 4 3');
  });

  it('bands a picked part solid, over a dotted band along the rest of its body', () => {
    const halos = selectionHalos(roots, () => 'link-default', bc, []);
    expect(halos.map((h) => [h.key, h.kind])).toEqual([
      ['ABC:context', 'context'],
      ['BC', 'picked'],
    ]);
    expect(halos[1].d).toBe('M 4 0 L 4 3');
  });

  it('says nothing about a body nobody has picked or pointed at', () => {
    expect(selectionHalos(roots, () => 'link-default', undefined, [])).toEqual([]);
  });

  it('bands a machine pointed at from the transport more lightly', () => {
    const halos = selectionHalos(roots, (l) => (l === plain ? 'link-hovered' : ''), undefined, []);
    expect(halos.map((h) => h.kind)).toEqual(['hovered']);
  });
});
