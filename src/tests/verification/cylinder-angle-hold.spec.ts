import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { cylinderBoomFixture } from '../../test-utils/verification/slot-fixtures';
import { RealLink } from '../../app/model/link';
import { sealedCylinderStructures } from '../../app/model/cylinder';
import {
  cylinderOf,
  heldBars,
  heldBarsReaching,
  holdJoints,
  holdOf,
} from '../../app/model/link-holds';
import { settleHolds } from '../../app/model/hold-solver';

/**
 * Holding the direction a cylinder points in.
 *
 * A cylinder is three links and a slide, and the two a reader sees are its
 * *mounts* -- the pin it hangs from and the pin it pushes. Everything between
 * them is machinery: the barrel's buried end and the welded pin are placed by
 * the layout, not by the reader, and re-derived every time the part is
 * normalized. So the angle worth holding is the mount-to-mount bearing, and
 * the bar handed to the solver has to be that pair.
 *
 * Which is what went wrong the first time. The hold flag lives on the barrel,
 * and a barrel is a perfectly good two-joint link in its own right -- so the
 * bar test answered about the barrel's own ends, both of them inside the part,
 * and holding them held nothing anybody could see. A cylinder cannot be
 * recognized from a link either: it resolves from the joints of its slide, and
 * a barrel's only tie to its assembly is the slot, an edge pointing outward.
 * The drawing is the only thing that can answer, which is why these all take
 * the joints.
 */
describe('a cylinder that holds its angle', () => {
  /** The Gate 5 boom: ground pins O and G, boom O->C, cylinder G->C. */
  function boom() {
    const built = buildMechanism(cylinderBoomFixture());
    const sealed = sealedCylinderStructures(built.joints)[0];
    return { ...built, sealed, barrel: sealed.barrel as RealLink };
  }

  it('is one bar, and it is the two mounts', () => {
    const { links, joints, barrel } = boom();
    barrel.hold = 'angle';

    const bars = heldBars(links);
    expect(bars).toHaveLength(1);
    expect([bars[0].a, bars[0].b]).toEqual(['G', 'C']);
    expect(bars[0].hold).toBe('angle');
    // Not the barrel's own two joints, which is what a bar would have given.
    expect(barrel.joints.map((joint) => joint.id)).toEqual(['G', 'N']);
    // 4 up and 3 back from the mount: the bearing a reader would measure.
    expect((bars[0].angle * 180) / Math.PI).toBeCloseTo(126.87, 2);
    void joints;
  });

  it('answers the same whichever member the reader clicked', () => {
    const { links, joints, sealed, barrel } = boom();
    barrel.hold = 'angle';
    for (const part of [sealed.barrel, sealed.rod, sealed.block]) {
      if (!part) continue;
      expect(cylinderOf(part, joints)?.barrel.id).toBe(barrel.id);
      expect(holdOf(part, joints)).toBe('angle');
    }
    // And with no hold set, nothing is held anywhere.
    barrel.hold = undefined;
    expect(heldBars(links)).toEqual([]);
    expect(holdOf(sealed.rod, joints)).toBeUndefined();
  });

  it('slides the driven mount along the line rather than off it', () => {
    const { links, joints, barrel } = boom();
    barrel.hold = 'angle';
    const bars = heldBars(links);
    const bearing = bars[0].angle;

    // The mount the boom carries, asked somewhere well off the cylinder's
    // line. G is a ground pin, so the line through it is what is left.
    const solver = holdJoints(joints, (joint) => joint.ground && joint.id !== 'C');
    const out = settleHolds(solver, bars, [{ id: 'C', x: 6, y: 6 }]);
    expect(out.satisfied).toBe(true);
    expect(out.immovable).toEqual([]);

    const at = out.positions.get('C')!;
    const g = joints.find((joint) => joint.id === 'G')!;
    // Still pointing where it was, and no longer where it started.
    expect(Math.atan2(at.y - g.y, at.x - g.x)).toBeCloseTo(bearing, 6);
    expect(Math.hypot(at.x, at.y - 4)).toBeGreaterThan(0.5);
    // The mount that is bolted to the frame stayed bolted to it.
    expect(out.positions.has('G')).toBe(false);
  });

  it('names the cylinder when a move has to be refused', () => {
    const { links, joints, barrel } = boom();
    barrel.hold = 'angle';
    const c = joints.find((joint) => joint.id === 'C')!;
    // The reader grabbed a mount; the bar in the way is the cylinder, even
    // though the mount is not one of the barrel's own joints.
    expect(heldBarsReaching(c, links).map((link) => link.id)).toEqual([barrel.id]);
  });
});
