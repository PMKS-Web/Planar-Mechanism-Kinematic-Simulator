// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  walkingPairFixture,
  straightLinePairFixture,
  pumpingFieldFixture,
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
