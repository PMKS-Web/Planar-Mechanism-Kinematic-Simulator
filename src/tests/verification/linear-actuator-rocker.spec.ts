// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint, PrisJoint, RealJoint } from '../../app/model/joint';
import { buildMechanismAtScale } from '../../test-utils/verification/fixture';
import {
  SCREW_JACK,
  linearActuatorRockerFixture,
} from '../../test-utils/verification/workshop-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';

// The library's driven sliders are all sealed cylinders, which are compound
// parts with their own resolver. This is the plain case: one block, one
// grounded guide, no weld and no seal. What has to hold is that it is still
// that plain case after the build — an unsealed, grounded prismatic input —
// and that it drives the rocker out and back rather than jamming at a limit.
//
// Built in model units, as every driven-slider fixture is: the block advances
// by a step measured in them, so a mechanism that is to be solved has to be
// stated in them.

describe('a linear actuator pushing a rocker', () => {
  const built = buildMechanismAtScale(linearActuatorRockerFixture(MODEL_SCALE), 1 * MODEL_SCALE);
  const { mechanism } = built;
  const at = (t: number, id: string): Joint => mechanism.joints[t].find((j) => j.id === id)!;
  const frames = mechanism.joints.length;
  /** Where the block sits along its guide, back in user length units. */
  const along = (t: number) => at(t, 'A').x / MODEL_SCALE;

  it('has one degree of freedom and solves', () => {
    expect(mechanism.dof).toBe(1);
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames).toBeGreaterThan(50);
    for (let t = 0; t < frames; t++) {
      for (const id of ['A', 'B', 'C']) {
        expect(Number.isFinite(at(t, id).x) && Number.isFinite(at(t, id).y)).toBe(true);
      }
    }
  });

  it('is driven from a plain grounded prismatic joint, not a cylinder', () => {
    const guide = built.joints.find((joint) => joint.id === 'P') as PrisJoint;
    expect(guide).toBeInstanceOf(PrisJoint);
    expect(guide.input).toBe(true);
    // Grounded, so the slot is cut into the world; unsealed, so it is a bare
    // guide rather than the barrel of a cylinder; and the pin is free to turn
    // in the block, so there is no Slide either.
    expect(guide.ground).toBe(true);
    expect(guide.isSealed).toBe(false);
    expect((built.joints.find((joint) => joint.id === 'A') as RealJoint).isWelded).toBe(false);
    expect(guide.angle_rad).toBeCloseTo(0, 9);
  });

  it('keeps the block on its guide and the rocker on its pivot', () => {
    for (let t = 0; t < frames; t++) {
      // The guide runs along y = 0, so the block never leaves it.
      expect(Math.abs(at(t, 'A').y), `block off guide at frame ${t}`).toBeLessThan(1e-3);
      expect(Math.hypot(at(t, 'C').x - at(0, 'C').x, at(t, 'C').y - at(0, 'C').y)).toBeLessThan(
        1e-3
      );
      for (const [a, b, length] of [
        ['A', 'B', SCREW_JACK.rod],
        ['B', 'C', SCREW_JACK.rocker],
      ] as const) {
        const now = Math.hypot(at(t, a).x - at(t, b).x, at(t, a).y - at(t, b).y) / MODEL_SCALE;
        expect(Math.abs(now - length), `|${a}${b}| at frame ${t}`).toBeLessThan(3e-3);
      }
    }
  });

  it('travels out and back, and rocks the arm through a visible sweep', () => {
    const positions = mechanism.joints.map((_, t) => along(t));
    const travel = Math.max(...positions) - Math.min(...positions);
    // The stroke is set by the rod and rocker coming into line, not by any
    // declared limit: a plain guide has no ends.
    expect(travel).toBeGreaterThan(4);
    // It reverses rather than running off: the last frame is back where the
    // first one started.
    expect(positions[frames - 1]).toBeCloseTo(positions[0], 2);
    expect(mechanism.reciprocates).toBe(true);

    const arm = mechanism.joints.map((_, t) =>
      Math.atan2(at(t, 'B').y - at(t, 'C').y, at(t, 'B').x - at(t, 'C').x)
    );
    expect(Math.max(...arm) - Math.min(...arm)).toBeGreaterThan((120 * Math.PI) / 180);
  });

  it('completes its out-and-back in a watchable time, and carries no mass', () => {
    // 6.6 units of travel each way at 2.2 a second, so exactly six.
    expect(mechanism.cyclePeriod).toBeGreaterThan(5);
    expect(mechanism.cyclePeriod).toBeLessThan(8);
    for (const link of mechanism.links[0]) {
      if (link.id === 'AP') continue; // the block, which the fixture does not mass
      expect(link.mass).toBe(0);
    }
  });
});
