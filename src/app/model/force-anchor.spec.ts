import { RevJoint } from './joint';
import { RealLink } from './link';
import { anchorBodiesOf, anchorIsOnLink, constrainForceAnchor } from './force-anchor';

const bar = () => new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0)]);
const plate = () =>
  new RealLink('ABC', [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0), new RevJoint('C', 0, 3)]);
const boom = () =>
  new RealLink('ABC', [new RevJoint('A', 0, 0), new RevJoint('B', 2, 0), new RevJoint('C', 5, 0)]);
const compound = () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  const c = new RevJoint('C', 4, 3);
  const first = new RealLink('AB', [a, b]);
  const second = new RealLink('BC', [b, c]);
  return new RealLink('ABC', [a, b, c], undefined, undefined, undefined, [first, second]);
};

describe('where a force may be anchored on a link', () => {
  it('holds a bar’s anchor to the line between its two joints', () => {
    const at = constrainForceAnchor(bar(), { x: 1, y: 2 }, 0);
    expect(at.x).toBeCloseTo(1, 9);
    expect(at.y).toBeCloseTo(0, 9);
    // And not past either end.
    expect(constrainForceAnchor(bar(), { x: 7, y: 0 }, 0).x).toBeCloseTo(4, 9);
  });

  it('lets a plate’s anchor go anywhere inside the triangle its joints make', () => {
    const inside = constrainForceAnchor(plate(), { x: 1, y: 1 }, 0);
    expect(inside.x).toBeCloseTo(1, 9);
    expect(inside.y).toBeCloseTo(1, 9);
    expect(anchorIsOnLink(plate(), { x: 1, y: 1 }, 1e-9)).toBe(true);
  });

  it('keeps a plate’s anchor short of its drawn edge, on the line between two joints', () => {
    // Out past the hypotenuse, where the drawn plate still has some width.
    const kept = constrainForceAnchor(plate(), { x: 3, y: 3 }, 0);
    expect(anchorIsOnLink(plate(), kept, 1e-9)).toBe(true);
    // On the hypotenuse 3x + 4y = 12.
    expect(3 * kept.x + 4 * kept.y).toBeCloseTo(12, 6);
    expect(anchorIsOnLink(plate(), { x: 3, y: 3 }, 1e-9)).toBe(false);
  });

  it('draws an anchor near the line between two joints onto that line, when asked', () => {
    // Just above the base, inside the plate: free it stays, snapping it lands.
    const free = constrainForceAnchor(plate(), { x: 2, y: 0.1 }, 0);
    expect(free.y).toBeCloseTo(0.1, 9);
    const snapped = constrainForceAnchor(plate(), { x: 2, y: 0.1 }, 0.2);
    expect(snapped.y).toBeCloseTo(0, 9);
    expect(snapped.x).toBeCloseTo(2, 9);
    // Beyond the snap distance it is left where it is.
    expect(constrainForceAnchor(plate(), { x: 2, y: 0.5 }, 0.2).y).toBeCloseTo(0.5, 9);
  });

  it('treats a boom whose three joints lie on one line as the bar between its ends', () => {
    const at = constrainForceAnchor(boom(), { x: 3.5, y: 1 }, 0);
    expect(at.x).toBeCloseTo(3.5, 9);
    expect(at.y).toBeCloseTo(0, 9);
    expect(constrainForceAnchor(boom(), { x: 9, y: 0 }, 0).x).toBeCloseTo(5, 9);
  });

  it('keeps a compound’s anchor on one of its bars, not in the corner between them', () => {
    const welded = compound();
    expect(anchorBodiesOf(welded)).toHaveLength(2);
    // The corner the two bars enclose, inside their triangle: on a plate it
    // would stay, but this is two bars welded at a right angle.
    const at = constrainForceAnchor(welded, { x: 3, y: 0.5 }, 0);
    expect(anchorIsOnLink(welded, at, 1e-9)).toBe(true);
    expect(at.y === 0 || at.x === 4).toBe(true);
    expect(anchorIsOnLink(welded, { x: 3, y: 0.5 }, 1e-9)).toBe(false);
  });

  it('says a lone anchor has left its link once a joint is dragged out from under it', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 0, 3);
    const link = new RealLink('ABC', [a, b, c]);
    expect(anchorIsOnLink(link, { x: 1, y: 1 }, 1e-9)).toBe(true);
    c.y = 0.5;
    expect(anchorIsOnLink(link, { x: 1, y: 1 }, 1e-9)).toBe(false);
    const kept = constrainForceAnchor(link, { x: 1, y: 1 }, 0);
    expect(anchorIsOnLink(link, kept, 1e-9)).toBe(true);
  });
});
