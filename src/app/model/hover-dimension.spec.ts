import { RealLink } from './link';
import { RevJoint } from './joint';
import { ram } from '../../test-utils/cylinder-graph';
import { cylindersIn } from './cylinder';
import { overlayBarEnds } from './hover-dimension';

/**
 * A dimension and the field that raised it are the same statement said twice.
 *
 * A cylinder member has two spans and they belong to different fields: its
 * Length is its own, and its Angle is the part's. Both used to answer end joint
 * to end joint, so hovering a rod reading 0.89 cm drew 1.97 cm across the whole
 * part.
 */
describe('which span a hover dimension measures', () => {
  it('measures an ordinary bar between its own two joints, either way round', () => {
    const bar = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0)]);
    for (const which of ['length', 'angle'] as const) {
      expect(overlayBarEnds(bar, which, []).map((joint) => joint.id)).toEqual(['A', 'B']);
    }
  });

  it('measures a member’s Length along the member and its Angle across the part', () => {
    const parts = ram();
    const cylinders = cylindersIn(parts.joints);

    expect(
      overlayBarEnds(parts.rod, 'length', cylinders)
        .map((joint) => joint.id)
        .sort()
    ).toEqual([parts.seal.id, parts.mountB.id].sort());
    expect(
      overlayBarEnds(parts.barrel, 'length', cylinders)
        .map((joint) => joint.id)
        .sort()
    ).toEqual([parts.mountA.id, parts.inner.id].sort());

    for (const member of [parts.barrel, parts.rod]) {
      expect(overlayBarEnds(member, 'angle', cylinders).map((joint) => joint.id)).toEqual([
        parts.mountA.id,
        parts.mountB.id,
      ]);
    }
  });
});
