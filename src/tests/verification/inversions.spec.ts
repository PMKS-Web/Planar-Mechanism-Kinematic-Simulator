// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  fourBarInversionsFixture,
  sliderCrankInversionsFixture,
} from '../../test-utils/verification/inversion-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * One chain, held by a different link each time.
 *
 * What each drawing has to prove is not only that it solves but that it is the
 * mechanism the table beside it claims: that holding the shortest bar really
 * does give a double crank and holding the one opposite it really does give a
 * double rocker. That is asked of the solved motion rather than of the Grashof
 * arithmetic that predicted it — which bars actually go right over, and which
 * only rock — so the drawing is checked against the theory rather than the
 * theory against itself.
 */

/** Every machine the drawing comes apart into, solved on its own. */
function machines(fixture: MechanismFixture): Mechanism[] {
  const built = buildMechanism(fixture);
  const partitioning = partitionMechanisms(built.joints, built.links, built.forces);
  expect(partitioning.unassigned.looseJoints.length).toBe(0);
  return partitioning.mechanisms.map(
    (partition) =>
      new Mechanism(
        partition.joints,
        partition.links,
        partition.forces,
        [],
        false,
        'cm',
        fixture.inputAngVel,
        'adaptive',
        new Set(partition.ownJoints.map((joint) => joint.id))
      )
  );
}

function expectSeparateMachines(fixture: MechanismFixture, count: number): Mechanism[] {
  const solved = machines(fixture);
  expect(solved.length).toBe(count);
  solved.forEach((machine) => {
    expect(machine.dof).toBe(1);
    expect(machine.isMechanismValid()).toBe(true);
  });
  return solved;
}

/** Every link's mass, blocks and welded members included. */
function masses(fixture: MechanismFixture): number[] {
  return buildMechanism(fixture).links.map((link) => link.mass);
}

/**
 * Does this bar go right over, or does it swing and come back?
 *
 * Asked of the solved cycle rather than of the lengths, so it is a statement
 * about the mechanism the template actually opens and not about the Grashof
 * arithmetic that predicted it. The angles a full rotation visits are spread
 * all the way round with no gap between neighbouring samples; a rocker leaves
 * the whole of the rest of the circle empty, so the widest gap separates the
 * two cleanly with nothing near the boundary.
 */
function goesOver(machine: Mechanism, pivot: string, tip: string): boolean {
  const angles = machine.joints
    .map((frame) => {
      const at = frame.find((joint) => joint.id === pivot)!;
      const end = frame.find((joint) => joint.id === tip)!;
      return (Math.atan2(end.y - at.y, end.x - at.x) + 2 * Math.PI) % (2 * Math.PI);
    })
    .sort((one, other) => one - other);
  const gaps = angles.map((angle, index) =>
    index === 0 ? angles[0] + 2 * Math.PI - angles[angles.length - 1] : angle - angles[index - 1]
  );
  return Math.max(...gaps) < Math.PI / 6;
}

/** The lengths a machine's named bars are drawn at, rounded to the drawing. */
function spans(machine: Mechanism, pairs: [string, string][]): number[] {
  const frame = machine.joints[0];
  return pairs.map(([from, to]) => {
    const a = frame.find((joint) => joint.id === from)!;
    const b = frame.find((joint) => joint.id === to)!;
    return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
  });
}

describe('one four-bar chain, each link held still in turn', () => {
  it('comes apart into four machines, every one of them playable', () => {
    expectSeparateMachines(fourBarInversionsFixture(), 4);
  });

  it('is the same four bars every time', () => {
    // The lengths are what make this one chain rather than four linkages drawn
    // together, and they are the premise of every claim below — so they are
    // measured rather than trusted. Every inversion draws all four, the held
    // one included, so there are four spans to read and no frame to infer.
    const [heldL4, heldL2, heldL1, heldL3] = machines(fourBarInversionsFixture());
    const chain = [1, 2, 2.5, 3];
    expect(
      spans(heldL4, [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['A', 'D'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL2, [
        ['E', 'F'],
        ['F', 'G'],
        ['G', 'H'],
        ['E', 'H'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL1, [
        ['I', 'J'],
        ['J', 'K'],
        ['K', 'L'],
        ['I', 'L'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL3, [
        ['M', 'N'],
        ['N', 'O'],
        ['O', 'P'],
        ['M', 'P'],
      ]).sort()
    ).toEqual(chain);
  });

  it('is a different mechanism each time, which is the whole point', () => {
    const [heldL4, heldL2, heldL1, heldL3] = machines(fourBarInversionsFixture());

    // Holding a bar beside the shortest: the shortest cranks, the far bar rocks.
    expect(goesOver(heldL4, 'A', 'B')).toBe(true);
    expect(goesOver(heldL4, 'D', 'C')).toBe(false);
    expect(goesOver(heldL2, 'E', 'F')).toBe(true);
    expect(goesOver(heldL2, 'H', 'G')).toBe(false);

    // Holding the shortest itself: both bars pinned to the frame go over.
    expect(goesOver(heldL1, 'I', 'J')).toBe(true);
    expect(goesOver(heldL1, 'L', 'K')).toBe(true);

    // Holding the bar opposite the shortest, which is now the coupler: nothing
    // pinned to the frame can get round at all.
    expect(goesOver(heldL3, 'M', 'N')).toBe(false);
    expect(goesOver(heldL3, 'P', 'O')).toBe(false);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(fourBarInversionsFixture()).every((mass) => mass === 0)).toBe(true);
  });
});

describe('one slider-crank chain, each link held still in turn', () => {
  it('comes apart into four machines, every one of them playable', () => {
    expectSeparateMachines(sliderCrankInversionsFixture(), 4);
  });

  it('is the same crank and rod every time', () => {
    const [engine, whitworth, cylinder, pump] = machines(sliderCrankInversionsFixture());
    // L2 is 1.2 and L3 is 2.6 in all four, whichever of them is held and
    // whichever is doing the turning.
    expect(spans(engine, [['A', 'B']])).toEqual([1.2]);
    expect(spans(engine, [['B', 'C']])).toEqual([2.6]);
    expect(spans(whitworth, [['E', 'F']])).toEqual([1.2]);
    expect(spans(whitworth, [['F', 'G']])).toEqual([2.6]);
    expect(spans(cylinder, [['J', 'K']])).toEqual([1.2]);
    expect(spans(cylinder, [['J', 'M']])).toEqual([2.6]);
    expect(spans(pump, [['Q', 'R']])).toEqual([1.2]);
    expect(spans(pump, [['P', 'Q']])).toEqual([2.6]);
  });

  it('turns the slotted bar right over for one and rocks it for the other', () => {
    // The claim that separates the second inversion from the third, and the
    // quick-return from the oscillating cylinder. Same arrangement both times;
    // what decides it is whether the slotted bar's pivot falls inside the
    // circle the block runs on, which is to say which of the two bars is held.
    const [, whitworth, cylinder] = machines(sliderCrankInversionsFixture());
    expect(goesOver(whitworth, 'E', 'H')).toBe(true);
    expect(goesOver(cylinder, 'M', 'N')).toBe(false);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(sliderCrankInversionsFixture()).every((mass) => mass === 0)).toBe(true);
  });
});
