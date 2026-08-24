// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { doubleButterflyFixture } from '../../test-utils/verification/classic-fixtures';
import { jansenLegFixture } from '../../test-utils/verification/library-fixtures';

// §2.7a again, and this time without a cylinder in it. The gripper needed the
// simultaneous solver because its plate and both arms are tied together; this
// one needs it for a structural reason instead — there is no four-bar loop in
// the linkage to peel off, so the ordering walk has nothing to start on. That
// is the property being tested, not an incidental fact about the drawing.

const built = buildMechanism(doubleButterflyFixture());
// Read straight after the build: the solver's statics describe whichever
// mechanism was solved last, and the next build overwrites them.
const solverSystem = PositionSolver.captureDriveState().simultaneousSystem;
const frames = built.mechanism.joints;
const at = (frame: Joint[], id: string) => frame.find((joint) => joint.id === id)!;
const span = (a: Joint, b: Joint) => Math.hypot(a.x - b.x, a.y - b.y);

const MOVING = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROUNDING = 2e-3;

/** Every bar the fixture states, as the joint pair it spans. */
function barsOf(fixture: MechanismFixture): [string, string][] {
  const bars: [string, string][] = [];
  for (const link of fixture.links) {
    const ids = [...link.joints];
    for (let i = 0; i < ids.length; i++) {
      for (let k = i + 1; k < ids.length; k++) bars.push([ids[i], ids[k]]);
    }
  }
  return bars;
}

/**
 * The joints a chain of dyads can reach, given what the drive places exactly.
 *
 * A dyad places one joint from two already-known ones — two circles where the
 * joints belong to different bodies, the body's own frame where they belong to
 * the same one. Either way the test is the same: does this joint share a link
 * with two joints that are already known? Sweep until nothing new is found.
 */
function dyadicallyReachable(fixture: MechanismFixture): Set<string> {
  const input = fixture.joints.find((joint) => joint.input)!;
  const drivenBody = fixture.links.find((link) => link.joints.includes(input.id))!;
  const known = new Set<string>([
    ...fixture.joints.filter((joint) => joint.ground).map((joint) => joint.id),
    // The actuator carries its own link round exactly, so the whole body counts.
    ...drivenBody.joints,
  ]);
  const neighboursOf = (id: string) => {
    const found = new Set<string>();
    for (const link of fixture.links) {
      if (!link.joints.includes(id)) continue;
      for (const other of link.joints) if (other !== id) found.add(other);
    }
    return found;
  };
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const joint of fixture.joints) {
      if (known.has(joint.id)) continue;
      const references = [...neighboursOf(joint.id)].filter((id) => known.has(id));
      if (references.length >= 2) {
        known.add(joint.id);
        progressed = true;
      }
    }
  }
  return known;
}

describe('the double butterfly linkage', () => {
  it('is a mechanism the app will run', () => {
    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
    for (const frame of frames) {
      for (const joint of frame) {
        expect(Number.isFinite(joint.x) && Number.isFinite(joint.y)).toBe(true);
      }
    }
  });

  it('is the eight-bar topology, four ternary links and four binary ones', () => {
    const fixture = doubleButterflyFixture();
    // Seven moving links and the frame, ten pins: Gruebler's one degree of
    // freedom, and the count the name refers to.
    expect(fixture.links.length).toBe(7);
    expect(fixture.joints.length).toBe(10);
    const degrees = fixture.links.map((link) => link.joints.length).sort();
    // Four ternary links — the driven one, the other grounded one and the two
    // floating ones — and three binary bars. The eighth link is the frame, which
    // a fixture does not state: binary, carrying the two ground pivots, and the
    // fourth binary link of the eight-bar.
    expect(degrees).toEqual([2, 2, 2, 3, 3, 3, 3]);
  });

  it('cannot be decomposed into dyads', () => {
    const fixture = doubleButterflyFixture();
    const reached = dyadicallyReachable(fixture);
    // The drive places its own link and stops. Every other joint has exactly one
    // already-known neighbour, so no dyad anywhere in the linkage can fire.
    expect([...reached].sort()).toEqual(['A', 'B', 'C', 'D']);

    // The same walk on a linkage that *is* a chain of dyads, so a bug that
    // simply never places anything cannot pass the assertion above.
    const jansen = jansenLegFixture();
    expect(dyadicallyReachable(jansen).size).toBe(jansen.joints.length);
  });

  it('is solved by the simultaneous solver, all six joints at once', () => {
    expect(solverSystem).toBeDefined();
    expect([...solverSystem!.unknownIds].sort()).toEqual(['E', 'F', 'G', 'H', 'I', 'J']);
    // Square, counted as residual rows: a coincidence or a rigid offset is two
    // rows and one constraint, and it is the rows that have to match.
    const rows = solverSystem!.constraints.reduce(
      (total, constraint) => total + (constraint.kind === 'rigidOffset' ? 2 : 1),
      0
    );
    expect(rows).toBe(12);
  });

  it('turns all the way round rather than jamming part way', () => {
    // One sample a degree, and the last is the first again: a rocking eight-bar
    // would come back with an out-and-back run instead.
    expect(frames.length).toBe(361);
    for (const id of MOVING) {
      expect(span(at(frames[0], id), at(frames[frames.length - 1], id))).toBeLessThan(ROUNDING);
    }
  });

  it('keeps every bar the length it was drawn', () => {
    for (const [a, b] of barsOf(doubleButterflyFixture())) {
      const drawn = span(at(frames[0], a), at(frames[0], b));
      for (const frame of frames) {
        expect(Math.abs(span(at(frame, a), at(frame, b)) - drawn)).toBeLessThan(ROUNDING);
      }
    }
  });

  it('moves every one of its bodies, smoothly', () => {
    for (const id of MOVING) {
      const path = frames.map((frame) => at(frame, id));
      const xs = path.map((joint) => joint.x);
      const ys = path.map((joint) => joint.y);
      // A joint that barely moves would mean a chain hanging along for the ride
      // rather than a linkage that is genuinely tied together.
      expect(
        Math.max(...xs) - Math.min(...xs) + (Math.max(...ys) - Math.min(...ys))
      ).toBeGreaterThan(1);

      const steps = path.slice(1).map((joint, i) => span(joint, path[i]));
      // Judged against the neighbouring steps rather than the average: the
      // linkage genuinely speeds up and slows down over a turn. What a Newton
      // solve falling to another root looks like is a step with no relation to
      // the ones either side of it, and that is orders of magnitude, not a
      // factor of a few.
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeLessThan(Math.max(steps[i - 1] * 6, 1e-3));
      }
    }
  });

  it('carries no mass, being a demonstration of topology', () => {
    for (const link of built.links) {
      expect(link.mass).toBe(0);
      expect((link as { massMoI?: number }).massMoI).toBe(0);
    }
  });
});
