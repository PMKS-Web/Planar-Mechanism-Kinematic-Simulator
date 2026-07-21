// Deliberately enter the model graph through link.ts. This protects the
// type-only Joint -> Link import that breaks the former runtime cycle.
import { RealLink } from '../../app/model/link';
import { Coord } from '../../app/model/coord';
import { RevJoint } from '../../app/model/joint';

describe('model module import order', () => {
  it('constructs a link when link.ts is the first model entry point', () => {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 2, 0);
    const link = new RealLink('AB', [a, b], 3, 4, new Coord(0.75, 0.25));
    expect(link.id).toBe('AB');
    expect(link.CoM).toEqual(new Coord(0.75, 0.25));
  });
});
