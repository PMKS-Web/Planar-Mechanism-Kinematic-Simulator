import { RevJoint } from './joint';
import { RealLink } from './link';
import { distanceNeighbors } from './joint-distances';
import { pickLink } from './link-pick';

const a = new RevJoint('A', 0, 0);
const b = new RevJoint('B', 2, 0);
const c = new RevJoint('C', 2, 2);
const d = new RevJoint('D', 4, 0);
function assembly() {
  const triangle = new RealLink('ABC', [a, b, c]);
  const bar = new RealLink('BD', [b, d]);
  const compound = new RealLink('ABCD', [a, b, c, d]);
  compound.subset = [triangle, bar];
  return { triangle, bar, compound };
}
describe('primitive dimensions and selection', () => {
  it('at a weld lists only the other pins of a qualifying primitive', () => {
    const { compound } = assembly();
    expect(distanceNeighbors(b, [compound], () => false)).toEqual([a, c]);
    expect(distanceNeighbors(d, [compound], () => false)).toEqual([]);
  });
  it('omits cylinder members even when they have three joints', () => {
    const { triangle, compound } = assembly();
    expect(distanceNeighbors(b, [compound], (link) => link === triangle)).toEqual([]);
  });
  it('selects the compound first, then the primitive under the pointer', () => {
    const { triangle, bar, compound } = assembly();
    expect(pickLink([compound], triangle, undefined, () => true)).toBe(compound);
    expect(pickLink([compound], compound, compound, (one) => one === bar)).toBe(bar);
    expect(pickLink([compound], triangle, bar, () => true)).toBe(triangle);
  });
});
