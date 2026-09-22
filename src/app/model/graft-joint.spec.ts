import { graftJoint } from './graft-joint';
import { RevJoint } from './joint';
import { RealLink } from './link';

describe('a tracer on a compound primitive', () => {
  it('grows only that primitive while connecting the new point to the entire rigid body', () => {
    const a = new RevJoint('A', 0, 0),
      b = new RevJoint('B', 2, 1),
      c = new RevJoint('C', 4, 0);
    const ab = new RealLink('AB', [a, b]),
      bc = new RealLink('BC', [b, c]);
    const root = new RealLink('ABC', [a, b, c]);
    root.subset = [ab, bc];
    const d = new RevJoint('D', 1, 0.8);
    graftJoint(d, ab, root);
    expect(ab.joints).toEqual([a, b, d]);
    expect(bc.joints).toEqual([b, c]);
    expect(root.joints).toEqual([a, b, c, d]);
    expect(d.links).toEqual([root]);
    expect(d.connectedJoints).toEqual([a, b, c]);
    expect(c.connectedJoints).toContain(d);
    expect(ab.fixedLocations.some((location) => location.id === 'D')).toBe(true);
    expect(root.fixedLocations.some((location) => location.id === 'D')).toBe(true);
    expect(root.d).not.toContain('NaN');
  });
});
