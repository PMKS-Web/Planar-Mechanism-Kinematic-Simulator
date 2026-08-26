// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { GEAR, landingGearFixture } from '../../test-utils/verification/library-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * An aircraft's main gear, head-on: two legs, a ram each, swinging out of the
 * belly.
 *
 * Three things make this the mechanism it claims to be rather than one that
 * merely animates, and each of them was wrong in a draft.
 *
 * It is two machines, not one. Nothing mechanical joins the port leg to the
 * starboard one, and a drawing that partitioned into a single machine would be
 * a different aircraft.
 *
 * The stroke has to be a *retraction*. A ram's travel is a fixed fraction of
 * its own extended length, so how far the leg swings is decided entirely by
 * where the ram is anchored and how far down the leg it pulls. Anchored by eye,
 * the first draft swung the leg 42 degrees and slid the wheel sideways under
 * the aircraft rather than lifting it in.
 *
 * And the drawn pose has to stand clear of the two poses where the ram comes
 * into line with the trunnion. Those are dead points: no arm to pull on, and
 * two equally good answers. A second draft opened four degrees from one, solved
 * a single sample and would not run.
 */

/**
 * The gear as the model builds it.
 *
 * At `MODEL_SCALE`, not at 1. A fixture is written in objectScale units, which
 * is what lets the same numbers be a URL at scale 1 and a model build at
 * MODEL_SCALE -- but a cylinder is the case where the difference bites: built
 * at 1 its bore is the size of the mechanism, and the whole drawing solves a
 * single sample and reports itself invalid. Every cylinder fixture in this
 * suite is built the same way, which is how that was diagnosed: the boom the
 * driven-cylinder spec asserts on does it too.
 */
const built = () => landingGearFixture(MODEL_SCALE);

function machines(fixture: MechanismFixture): Mechanism[] {
  const model = buildMechanism(fixture);
  const partitioning = partitionMechanisms(model.joints, model.links, model.forces);
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

/** Every pose of one joint, over the whole stroke. */
function path(machine: Mechanism, id: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const frame of machine.joints) {
    const sample = frame.find((joint) => joint.id === id);
    if (sample && Number.isFinite(sample.x) && Number.isFinite(sample.y)) {
      points.push({ x: sample.x, y: sample.y });
    }
  }
  return points;
}

const at = (fixture: MechanismFixture, id: string) => {
  const joint = fixture.joints.find((candidate) => candidate.id === id);
  if (!joint) throw new Error(`no joint ${id}`);
  return joint;
};

describe('aircraft landing gear', () => {
  it('is two one-DoF machines that share no part', () => {
    const solved = machines(built());
    expect(solved.length).toBe(2);
    solved.forEach((machine) => {
      expect(machine.dof).toBe(1);
      expect(machine.isMechanismValid()).toBe(true);
    });

    const model = buildMechanism(built());
    const owned = partitionMechanisms(model.joints, model.links, model.forces).mechanisms.map(
      (partition) => partition.ownJoints.map((joint) => joint.id)
    );
    const everything = owned.flat();
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('swings each leg far enough to be a retraction rather than a shuffle', () => {
    const fixture = built();
    const solved = machines(fixture);
    const trunnion = at(fixture, 'A');
    const machine = solved.find((candidate) =>
      candidate.joints[0].some((joint) => joint.id === 'C')
    )!;
    const angles = path(machine, 'C').map(
      (point) => (Math.atan2(point.y - trunnion.y, point.x - trunnion.x) * 180) / Math.PI
    );
    const sweep = Math.max(...angles) - Math.min(...angles);
    // Real main gear turns through something near a right angle, and this
    // turns through about 124 degrees: down and outboard, up to a little above
    // horizontal pointing inboard. Anything much under 80 is the wheel sliding
    // sideways rather than coming up; the upper bound is there because a leg
    // that swept most of a turn would be a mechanism that had found its way
    // round a dead point rather than a gear.
    expect(sweep).toBeGreaterThan(80);
    expect(sweep).toBeLessThan(140);
  });

  it('takes the wheel up and inboard, which is where a wheel well is', () => {
    const fixture = built();
    const solved = machines(fixture);
    const machine = solved.find((candidate) =>
      candidate.joints[0].some((joint) => joint.id === 'C')
    )!;
    const wheel = path(machine, 'C');
    const down = wheel[0];
    const up = wheel.reduce((highest, point) => (point.y > highest.y ? point : highest), wheel[0]);
    // Up: the retracted wheel is more than a leg's-length above the extended one.
    expect(up.y - down.y).toBeGreaterThan(GEAR.leg * MODEL_SCALE * 0.6);
    // And inboard: it ends nearer the centreline than the trunnion it hangs from.
    expect(Math.abs(up.x)).toBeLessThan(Math.abs(at(fixture, 'A').x));
    // The starting pose is the gear down, so the card opens on an aircraft
    // standing on its wheels rather than on one with the gear half up.
    expect(down.y).toBeLessThan(up.y - GEAR.leg * MODEL_SCALE * 0.6);
  });

  it('opens well clear of the poses where the ram has no arm to pull on', () => {
    const fixture = built();
    const trunnion = at(fixture, 'A');
    const ear = at(fixture, 'B');
    const mount = at(fixture, 'D');
    const base = Math.hypot(mount.x - trunnion.x, mount.y - trunnion.y);
    const radius = Math.hypot(ear.x - trunnion.x, ear.y - trunnion.y);
    const ram = Math.hypot(ear.x - mount.x, ear.y - mount.y);
    // The ram's moment arm about the trunnion, which is what goes to zero at a
    // dead point: twice the triangle's area over the side the force acts along.
    const area = Math.abs(
      (ear.x - trunnion.x) * (mount.y - trunnion.y) - (ear.y - trunnion.y) * (mount.x - trunnion.x)
    );
    const arm = area / ram;
    // A quarter of the ear radius is not a large arm — this is a mechanism that
    // trades force for travel near the bottom of its stroke, which is the point
    // — but it is nowhere near the zero that stops the solver.
    //
    // The arm rather than how near the ram is to its geometric reach: at 96%
    // of full reach this looks alarming and is not, because what decides
    // whether the solver has an answer is the angle between the ram and the
    // leg, and 40 degrees off collinear is a long way off it.
    expect(arm).toBeGreaterThan(radius * 0.25);
    expect(ram).toBeLessThan(base + radius);
  });

  it('is drawn symmetric, because a gear that is not is a gear typed twice', () => {
    const fixture = built();
    const pairs: [string, string][] = [
      ['A', 'G'],
      ['B', 'H'],
      ['C', 'I'],
      ['D', 'J'],
      ['E', 'K'],
      ['F', 'L'],
    ];
    pairs.forEach(([starboard, port]) => {
      const right = at(fixture, starboard);
      const left = at(fixture, port);
      expect(left.x).toBeCloseTo(-right.x, 9);
      expect(left.y).toBeCloseTo(right.y, 9);
    });
  });
});
