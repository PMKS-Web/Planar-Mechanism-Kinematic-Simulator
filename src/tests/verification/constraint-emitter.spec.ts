// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RealJoint, RevJoint } from '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { Link, RealLink, SliderBlock } from '../../app/model/link';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { Constraint } from '../../app/model/mechanism/simultaneous-solver';
import { rewire } from '../../test-utils/cylinder-graph';

/**
 * What the constraint builder writes down, for the graphs it is handed.
 *
 * The rows themselves have their own tests, checked against central
 * differences. What those cannot see is whether the right rows are *emitted*:
 * a weld with no row at all leaves a body free to turn, and a system solves
 * happily without it and draws a mechanism nobody built. Every test here
 * builds a joint graph and asks the builder what it made of it.
 */

/** Reach the builder, which is deliberately not public. */
const solver = PositionSolver as unknown as {
  collectConstraints: (
    joints: Joint[],
    links: Link[],
    unknownIds: string[]
  ) => Constraint[] | undefined;
  resetStaticVariables: () => void;
};

/**
 * A bar welded to a block, and the block on a guide.
 *
 * `grounded` puts the guide in the world; otherwise the slot is cut between
 * two joints of a carrier bar, which is the floating case.
 */
function slideAssembly(options: { grounded: boolean }) {
  const weld = new RevJoint('W', 0, 0);
  const far = new RevJoint('F', 3, 1);
  const slider = new PrisJoint('S', 0, 0);
  const rider = new RealLink('WF', [weld, far]);
  const block = new SliderBlock('WS', [weld, slider]);

  const joints: Joint[] = [weld, far, slider];
  const links: Link[] = [rider, block];

  if (options.grounded) {
    slider.groundAt(0);
  } else {
    const slotA = new RevJoint('P', -4, 0);
    const slotB = new RevJoint('Q', 4, 0);
    const carrier = new RealLink('PQ', [slotA, slotB]);
    joints.push(slotA, slotB);
    links.push(carrier);
    slider.slideOn(carrier, slotA, slotB);
  }
  weld.isWelded = true;
  rewire(joints, links);
  return { joints, links, weld, far, slider };
}

const kinds = (rows: Constraint[] | undefined) => (rows ?? []).map((one) => one.kind);

describe('what a weld at a block is written down as', () => {
  it('holds a heading against the world when the guide is grounded', () => {
    // There is no pair of joints anywhere that points along a world-fixed
    // guide, so the row carries the direction itself. Before it existed a
    // grounded Slide routed through the constraint set simply had no row for
    // its weld, and the rider was free to turn in a block that forbids it.
    const { joints, links, far } = slideAssembly({ grounded: true });
    const rows = solver.collectConstraints(joints, links, ['W', 'F', 'S']);

    expect(kinds(rows)).toContain('fixedDirection');
    const held = rows!.find((one) => one.kind === 'fixedDirection');
    expect(held).toMatchObject({ a1: 'W', a2: 'F' });
    // Captured from the pose it was built at, as a unit vector.
    const span = Math.hypot(far.x, far.y);
    expect((held as { dir: [number, number] }).dir[0]).toBeCloseTo(far.x / span, 9);
    expect((held as { dir: [number, number] }).dir[1]).toBeCloseTo(far.y / span, 9);
  });

  it('holds an angle to the slot when the guide moves with a carrier', () => {
    const { joints, links } = slideAssembly({ grounded: false });
    const rows = solver.collectConstraints(joints, links, ['W', 'F', 'S']);

    expect(kinds(rows)).toContain('fixedAngle');
    expect(kinds(rows)).not.toContain('fixedDirection');
  });

  it('writes the floating row when only the carrier is unknown', () => {
    // The row reads four joints: the rider's two and the slot's two. It was
    // emitted only when one of the rider's touched an unknown, so a system
    // holding the *carrier* unknown — the rider entirely settled — went
    // without the one row that says the rider cannot turn in its slot.
    const { joints, links } = slideAssembly({ grounded: false });
    const rows = solver.collectConstraints(joints, links, ['P', 'Q']);

    expect(kinds(rows)).toContain('fixedAngle');
  });
});

describe('which bar a weld is taken to hold', () => {
  /** The same assembly with its rider welded on into a bracket. */
  function riderInACompound(order: 'leafFirst' | 'bracketFirst') {
    const { joints, links, weld, far, slider } = slideAssembly({ grounded: true });
    const rider = links.find((link) => link.id === 'WF') as RealLink;
    const spur = new RevJoint('X', 3, 6);
    const bracket = new RealLink('FX', [far, spur]);
    // Both the subset order and the joint order vary: a compound lists its
    // joints in whatever order the weld happened to fuse them, and the answer
    // must not depend on that.
    const members = order === 'leafFirst' ? [rider, bracket] : [bracket, rider];
    const listed = order === 'leafFirst' ? [weld, far, spur] : [weld, spur, far];
    const compound = new RealLink('WFX', listed, undefined, undefined, undefined, members);
    (far as RealJoint).isWelded = true;
    joints.push(spur);
    const top = links.filter((link) => link.id !== rider.id);
    top.push(compound);
    rewire(joints, top);
    return { joints, links: top, slider };
  }

  it('takes the bar the weld is on, whichever order the compound lists', () => {
    // `joints[1]` of a rider that has been welded into something is whichever
    // joint that body happens to list second, which is a different bar
    // depending on the order the reader drew things in. The answer has to come
    // from the two-joint leaf the weld is actually on.
    for (const order of ['leafFirst', 'bracketFirst'] as const) {
      const { joints, links } = riderInACompound(order);
      const rows = solver.collectConstraints(joints, links, ['W', 'F', 'S', 'X']);
      const held = rows?.find((one) => one.kind === 'fixedDirection');
      expect(held).toBeDefined();
      expect(held).toMatchObject({ a1: 'W', a2: 'F' });
    }
  });
});
