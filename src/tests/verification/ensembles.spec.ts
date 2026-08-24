// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  walkingPairFixture,
  straightLinePairFixture,
  pumpingFieldFixture,
  fourBarInversionsFixture,
} from '../../test-utils/verification/ensemble-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { MechanismFixture } from '../../test-utils/verification/fixture';

/**
 * The drawings whose subject is that they hold more than one machine.
 *
 * What each has to prove is not only that it solves — a single-machine template
 * proves that — but that the drawing really does come apart into the machines
 * it is drawn as, and that the relationship between them is the one the card
 * promises: legs out of step, one path flat and one not, three beams at three
 * rates. A drawing that partitioned into one machine, or into two that shared a
 * joint, would still animate and would still be the wrong picture.
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

/** The ids each machine owns, so two machines sharing one can be caught. */
function ownedIds(fixture: MechanismFixture): string[][] {
  const built = buildMechanism(fixture);
  return partitionMechanisms(built.joints, built.links, built.forces).mechanisms.map((partition) =>
    partition.ownJoints.map((joint) => joint.id).sort()
  );
}

function expectSeparateMachines(fixture: MechanismFixture, count: number): Mechanism[] {
  const solved = machines(fixture);
  expect(solved.length).toBe(count);
  solved.forEach((machine) => {
    expect(machine.dof).toBe(1);
    expect(machine.isMechanismValid()).toBe(true);
  });
  // Owned sets are disjoint: a joint in two of them would mean the drawing is
  // one machine that merely looks like several.
  const owned = ownedIds(fixture);
  const everything = owned.flat();
  expect(new Set(everything).size).toBe(everything.length);
  return solved;
}

/** Every link's mass, blocks and welded members included. */
function masses(fixture: MechanismFixture): number[] {
  return buildMechanism(fixture).links.map((link) => link.mass);
}

describe('two Jansen legs, half a cycle apart', () => {
  it('is two separate one-DoF machines', () => {
    expectSeparateMachines(walkingPairFixture(), 2);
  });

  it('stands with one foot planted while the other is lifted', () => {
    const fixture = walkingPairFixture();
    const built = buildMechanism(fixture);
    // The two traced joints are the feet: the leg marks its walking curve.
    const feet = fixture.joints.filter((joint) => joint.trace).map((joint) => joint.id);
    expect(feet.length).toBe(2);

    const at = (id: string) => built.joints.find((joint) => joint.id === id)!;
    const [near, far] = feet.map(at);
    // Half a cycle apart is a real difference in height, not a rounding one:
    // the foot's rise over a stride is tens of units in the leg's own scale.
    expect(Math.abs(near.y - far.y)).toBeGreaterThan(5);
  });

  it('runs both legs at one rate, because a gait is a rate', () => {
    const speeds = walkingPairFixture()
      .joints.filter((joint) => joint.input)
      .map((joint) => joint.driveSpeed);
    expect(speeds.length).toBe(2);
    expect(new Set(speeds).size).toBe(1);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(walkingPairFixture()).every((mass) => mass === 0)).toBe(true);
  });
});

describe('an approximate straight line beside an exact one', () => {
  it('is two separate one-DoF machines', () => {
    expectSeparateMachines(straightLinePairFixture(), 2);
  });

  it('draws one path that bows and one that does not', () => {
    const fixture = straightLinePairFixture();
    const solved = machines(fixture);
    const traced = fixture.joints.filter((joint) => joint.trace).map((joint) => joint.id);
    expect(traced.length).toBe(2);

    /**
     * How far a pen leaves the straight line it is drawing.
     *
     * Measured perpendicular to the path's own direction rather than in x or y:
     * Chebyshev's line lies along the horizontal and Peaucellier's along the
     * vertical, so either axis alone would call one of them perfect and the
     * other hopeless without either being about straightness.
     *
     * Over the middle of the travel, because both reverse at their limits and a
     * limit is not what either linkage claims.
     */
    const wander = (id: string): number => {
      const machine = solved.find((candidate) =>
        candidate.joints[0].some((joint) => joint.id === id)
      );
      if (!machine) throw new Error(`no machine owns ${id}`);
      const points: { x: number; y: number }[] = [];
      for (const frame of machine.joints) {
        const sample = frame.find((candidate) => candidate.id === id);
        if (sample && Number.isFinite(sample.x) && Number.isFinite(sample.y)) {
          points.push({ x: sample.x, y: sample.y });
        }
      }
      const middle = points.slice(Math.floor(points.length * 0.3), Math.ceil(points.length * 0.7));
      expect(middle.length).toBeGreaterThan(10);
      const first = middle[0];
      const last = middle[middle.length - 1];
      const span = Math.hypot(last.x - first.x, last.y - first.y);
      expect(span).toBeGreaterThan(0);
      const unitX = (last.x - first.x) / span;
      const unitY = (last.y - first.y) / span;
      return Math.max(
        ...middle.map((point) =>
          Math.abs((point.y - first.y) * unitX - (point.x - first.x) * unitY)
        )
      );
    };

    const spans = traced.map(wander);
    const exact = Math.min(...spans);
    const approximate = Math.max(...spans);
    // The exact one is straight to solver precision; the approximate one bows
    // by an amount you can see, and the gap between them is the whole point of
    // drawing the two together.
    expect(exact).toBeLessThan(0.01);
    expect(approximate).toBeGreaterThan(exact * 10);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(straightLinePairFixture()).every((mass) => mass === 0)).toBe(true);
  });
});

describe('three pumps at three rates', () => {
  it('is three separate one-DoF machines', () => {
    expectSeparateMachines(pumpingFieldFixture(), 3);
  });

  it('drives each at its own rate, so they drift out of step', () => {
    const speeds = pumpingFieldFixture()
      .joints.filter((joint) => joint.input)
      .map((joint) => joint.driveSpeed);
    expect(speeds.length).toBe(3);
    expect(new Set(speeds).size).toBe(3);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(pumpingFieldFixture()).every((mass) => mass === 0)).toBe(true);
  });
});

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

describe('one four-bar chain, each link held still in turn', () => {
  it('comes apart into four machines, every one of them playable', () => {
    expectSeparateMachines(fourBarInversionsFixture(), 4);
  });

  it('is the same four bars every time', () => {
    // The lengths are what make this one chain rather than four linkages that
    // happen to be drawn together, and they are the premise of every claim
    // below — so they are measured rather than trusted.
    const [drag, crankRockerI, doubleRocker, crankRockerII] = machines(fourBarInversionsFixture());
    const spans = (machine: Mechanism, pairs: [string, string][]): number[] =>
      pairs.map(([from, to]) => {
        const frame = machine.joints[0];
        const a = frame.find((joint) => joint.id === from)!;
        const b = frame.find((joint) => joint.id === to)!;
        return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
      });
    // Each machine's three drawn bars, plus the frame span standing in for the
    // bar being held. Every list is the same four numbers.
    expect(
      spans(drag, [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['A', 'D'],
      ]).sort()
    ).toEqual([1, 2, 2.5, 3].sort());
    expect(
      spans(crankRockerI, [
        ['E', 'F'],
        ['F', 'G'],
        ['G', 'H'],
        ['E', 'H'],
      ]).sort()
    ).toEqual([1, 2, 2.5, 3].sort());
    expect(
      spans(doubleRocker, [
        ['I', 'J'],
        ['J', 'K'],
        ['K', 'L'],
        ['I', 'L'],
      ]).sort()
    ).toEqual([1, 2, 2.5, 3].sort());
    expect(
      spans(crankRockerII, [
        ['M', 'N'],
        ['N', 'O'],
        ['O', 'P'],
        ['M', 'P'],
      ]).sort()
    ).toEqual([1, 2, 2.5, 3].sort());
  });

  it('is a different mechanism each time, which is the whole point', () => {
    const [drag, crankRockerI, doubleRocker, crankRockerII] = machines(fourBarInversionsFixture());

    // Holding the shortest bar: both grounded bars go over.
    expect(goesOver(drag, 'A', 'B')).toBe(true);
    expect(goesOver(drag, 'D', 'C')).toBe(true);

    // Holding a bar beside the shortest: the shortest cranks, the far bar rocks.
    expect(goesOver(crankRockerI, 'E', 'F')).toBe(true);
    expect(goesOver(crankRockerI, 'H', 'G')).toBe(false);
    expect(goesOver(crankRockerII, 'M', 'N')).toBe(true);
    expect(goesOver(crankRockerII, 'P', 'O')).toBe(false);

    // Holding the bar opposite the shortest: the shortest is now the coupler,
    // and nothing pinned to the frame can get round at all.
    expect(goesOver(doubleRocker, 'I', 'J')).toBe(false);
    expect(goesOver(doubleRocker, 'L', 'K')).toBe(false);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(fourBarInversionsFixture()).every((mass) => mass === 0)).toBe(true);
  });
});
