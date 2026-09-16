// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../joint';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link, RealLink } from '../link';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { KinematicsSolver } from './kinematic-solver';
import { Mechanism } from './mechanism';
import { PositionSolver } from './position-solver';

/**
 * A slider is one joint, and these are the mechanisms that says the most about.
 *
 * Every other slider fixture in the suite is built by
 * `test-utils/verification/fixture.ts`, which still spells a slider as three
 * objects -- a prismatic joint, a coincident pin and a zero-length block. That
 * is Stage 1d's to convert, and until it is, none of those fixtures can say
 * whether the solvers understand the one-joint form. So the one-joint form is
 * built here by hand, at the smallest size that isolates each case.
 *
 * The four shapes are chosen for what they separate:
 *
 * - a **grounded Pin-in-slot** is the two-freedom joint, and the case Gruebler
 *   now charges one rather than two for;
 * - a **grounded Slide** is the one-freedom joint, and the only one that writes
 *   the "may not turn" row;
 * - a **floating Pin-in-slot** puts the slot on a body that is itself moving,
 *   so the count has to read the carrier rather than the world;
 * - an **elliptical trammel** is held by guides and nothing else, which is what
 *   proves a grounded slot anchors a mechanism at all.
 */

/** What the app's own rebuild leaves behind, in miniature. */
function wire(joints: Joint[], links: Link[]): void {
  joints.forEach((joint) => {
    if (joint instanceof RealJoint) {
      joint.links = [];
      joint.connectedJoints = [];
    }
  });
  links.forEach((link) =>
    link.joints.forEach((joint) => {
      if (joint instanceof RealJoint && !joint.links.includes(link)) joint.links.push(link);
    })
  );
  // A slot's carrier and the two joints that draw its line stay out of `links`
  // and `connectedJoints` (§2.3 Option A), so only link membership is wired.
  joints.forEach((joint) => {
    if (!(joint instanceof RealJoint)) return;
    joint.links.forEach((link) =>
      link.joints.forEach((other) => {
        if (
          other instanceof RealJoint &&
          other.id !== joint.id &&
          !joint.connectedJoints.some((known) => known.id === other.id)
        ) {
          joint.connectedJoints.push(other);
        }
      })
    );
  });
}

// The solvers keep their working state in statics, and Vitest runs spec files
// unisolated -- so a mechanism built here inherits whatever the last file to
// touch `PositionSolver` or `KinematicsSolver` left behind. Alone this file
// passes either way; in the full suite it did not, which is the same
// order-dependence `test-setup.ts` pins the drawing scale against.
beforeEach(() => {
  PositionSolver.resetStaticVariables();
  KinematicsSolver.resetVariables();
});

function bar(id: string, joints: Joint[]): RealLink {
  return new RealLink(id, joints, 1, 1);
}

function build(joints: Joint[], links: Link[], gravity = false, inputAngVel = 1): Mechanism {
  if (!ColorService.instance) new ColorService();
  new SettingsService();
  wire(joints, links);
  // 'degree' spacing, as the verification harness uses: the assertions here are
  // about the count and the walk, not about adaptive sampling.
  return new Mechanism(joints, links, [], [], gravity, 'm', inputAngVel, 'degree');
}

/**
 * Crank AB driving a rider that slides along a guide fixed in the world.
 *
 * The crank stands square to the guide at the drawn pose. Laid out in line with
 * it instead -- which is the arrangement that first looks natural -- every joint
 * is collinear, which is a dead center: the statics there are degenerate and the
 * torque comes out the same whatever the parts weigh.
 */
function groundedPinInSlot(rotates: boolean) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 1);
  const c = new PrisJoint('C', 3, 0, false, true);
  c.angle_rad = 0;
  c.rotates = rotates;
  return { joints: [a, b, c] as Joint[], links: [bar('AB', [a, b]), bar('BC', [b, c])] };
}

/**
 * A Scotch yoke, as one joint per slider: the crank pin rides the yoke's slot,
 * and the yoke itself rides a guide fixed in the world.
 */
function scotchYoke(yokeRotates: boolean) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new PrisJoint('B', 1, 0);
  const c = new PrisJoint('C', 1, -2, false, true);
  const d = new RevJoint('D', 1, 1.8);
  const yoke = bar('CD', [c, d]);
  // The crank pin is a Pin-in-slot riding the yoke; the yoke is the Slide.
  b.rotates = true;
  b.slideOn(yoke, c, d);
  c.angle_rad = 0;
  c.rotates = yokeRotates;
  return { joints: [a, b, c, d] as Joint[], links: [bar('AB', [a, b]), yoke] };
}

/** Crank AB driving a rider that slides in a slot cut along the lever CD. */
function floatingPinInSlot() {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new PrisJoint('B', 0, 1);
  const c = new RevJoint('C', 3, 0, false, true);
  // D on the ray from the lever's pivot through the crank pin, so the slot
  // passes through the rider at the drawn pose.
  const span = Math.hypot(0 - 3, 1);
  const d = new RevJoint('D', 3 + (5 * (0 - 3)) / span, (5 * 1) / span);
  const lever = bar('CD', [c, d]);
  b.rotates = true;
  b.slideOn(lever, c, d);
  return { joints: [a, b, c, d] as Joint[], links: [bar('AB', [a, b]), lever] };
}

/** A bar whose two ends ride perpendicular guides, and nothing else holds it. */
function trammel() {
  const a = new PrisJoint('A', 1, 0, false, true);
  const b = new PrisJoint('B', 0, 1, false, true);
  a.angle_rad = 0;
  b.angle_rad = Math.PI / 2;
  a.rotates = true;
  b.rotates = true;
  return { joints: [a, b] as Joint[], links: [bar('AB', [a, b])] };
}

describe('counting a mechanism whose sliders are one joint each', () => {
  it('charges a Pin-in-slot one freedom, not two', () => {
    // The crank, the rider and the world are three bodies; the two pins cost
    // two each and the slot costs one, because the rider may still turn in it.
    // 3(3-1) - 2*2 - 1 = 1. The old three-object form reached the same 1 by a
    // different route -- the block was a fourth body carrying three more
    // coordinates, and its two joints cost four -- which is why this number
    // has to come out unchanged rather than merely come out right.
    const { joints, links } = groundedPinInSlot(true);

    expect(build(joints, links).dof).toBe(1);
  });

  it('charges a Slide two, so the same drawing goes rigid', () => {
    // A rider that cannot turn against its guide has nowhere left to go: the
    // crank would have to put the pin both on a circle and at a fixed offset
    // from a fixed line.
    const { joints, links } = groundedPinInSlot(false);

    expect(build(joints, links).dof).toBe(0);
  });

  it('brings the Scotch yoke to one degree of freedom', () => {
    // The weld on the old coincident pin is `rotates: false` on the yoke's own
    // joint now. It is the whole mechanism: without it the yoke could turn
    // about its guide as well as slide along it.
    const { joints, links } = scotchYoke(false);

    expect(build(joints, links).dof).toBe(1);
  });

  it('still reports two without it', () => {
    const { joints, links } = scotchYoke(true);

    expect(build(joints, links).dof).toBe(2);
  });

  it('reads a floating slot against its carrier rather than the world', () => {
    const { joints, links } = floatingPinInSlot();

    expect(build(joints, links).dof).toBe(1);
  });

  it('counts a mechanism held only by its guides', () => {
    // No pin anywhere touches ground, so this is the case that proves a
    // grounded slot anchors a drawing: the bar has three coordinates and the
    // two guides cost one each.
    const { joints, links } = trammel();

    expect(build(joints, links).dof).toBe(1);
  });
});

describe('solving a mechanism whose sliders are one joint each', () => {
  it('orders every joint of a grounded slider-crank', () => {
    // The ordering walk used to reach a slider through its block: the pin was
    // placed as an ordinary dyad and the sliding joint then copied its
    // position. With one joint there is nothing to copy, and the joint has to
    // be placed by the slot primitive itself.
    PositionSolver.resetStaticVariables();
    const { joints, links } = groundedPinInSlot(true);
    const mechanism = build(joints, links);

    expect(PositionSolver.unsolvableJoints).toEqual([]);
    expect(mechanism.isMechanismValid()).toBe(true);
  });

  it('keeps the rider on its guide for the whole cycle', () => {
    const { joints, links } = groundedPinInSlot(true);
    const mechanism = build(joints, links);

    expect(mechanism.joints.length).toBeGreaterThan(300);
    let travelled = 0;
    const start = mechanism.joints[0].find((joint) => joint.id === 'C')!.x;
    for (let step = 0; step < mechanism.joints.length; step++) {
      const rider = mechanism.joints[step].find((joint) => joint.id === 'C')!;
      // The guide is horizontal and was drawn through y = 0.
      expect(rider.y, `C off its guide at step ${step}`).toBeCloseTo(0, 3);
      travelled = Math.max(travelled, Math.abs(rider.x - start));
    }
    // And it goes somewhere along that guide. Staying put satisfies every
    // assertion above -- a joint that never moves is trivially never off its
    // line -- and staying put is exactly what a slider did once the pin whose
    // step used to carry it was folded away.
    expect(travelled, 'C never travelled along its guide').toBeGreaterThan(0.5);
  });

  it('carries mass and the Slide across every per-timestep copy', () => {
    // `cloneJointAt` rebuilds each joint per sample. The mass used to live on
    // the block and the Slide on a coincident pin, so a copy that dropped
    // either would leave every sample after the first holding a massless
    // Pin-in-slot -- which reads as a body with no weight and a freedom the
    // drawing does not have.
    const { joints, links } = scotchYoke(false);
    (joints.find((joint) => joint.id === 'C') as PrisJoint).mass = 1.31788;
    const mechanism = build(joints, links);

    expect(mechanism.joints.length).toBeGreaterThan(1);
    for (let step = 0; step < mechanism.joints.length; step++) {
      const slide = mechanism.joints[step].find((joint) => joint.id === 'C') as PrisJoint;
      expect(slide, `slider at step ${step}`).toBeInstanceOf(PrisJoint);
      expect(slide.rotates, `Slide at step ${step}`).toBe(false);
      expect(slide.mass, `mass at step ${step}`).toBeCloseTo(1.31788, 9);
    }
  });
});

describe('the statics of a slider whose mass is the joint’s', () => {
  /** The grounded slider-crank, with a mass on the slider itself. */
  function withSliderMass(mass: number): Mechanism {
    const { joints, links } = groundedPinInSlot(true);
    (joints.find((joint) => joint.id === 'C') as PrisJoint).mass = mass;
    return build(joints, links, true);
  }

  /**
   * The same crank with its guide turned up the page.
   *
   * The weight has to be carried by something, and on a *horizontal* guide that
   * something is the guide: the slot's normal is vertical there, so it reacts
   * the rider's weight entirely and the crank never feels it -- the input torque
   * is the same whatever the rider weighs, correctly. Standing the guide up puts
   * the weight along the slot, where the normal cannot reach it, so the rod has
   * to carry it back to the crank and the mass becomes visible.
   */
  function weightAlongTheGuide(mass: number): Mechanism {
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 1, 0);
    const c = new PrisJoint('C', 0, -3, false, true);
    c.angle_rad = Math.PI / 2;
    c.rotates = true;
    c.mass = mass;
    return build([a, b, c], [bar('AB', [a, b]), bar('BC', [b, c])], true);
  }

  it('writes an equilibrium the solve can close', () => {
    // The row count is the thing to get wrong here. The block was a two-row
    // body -- mass and gravity, no moment and no inertia -- and it also owned
    // one end of the pin reaction with its rider. Both of those have to come
    // from the joint now, and if either goes missing the count guard refuses
    // the whole frame rather than reporting a number.
    const frame = withSliderMass(1.31788).getForceAnalysis('static').frames[0];

    expect(frame.message ?? frame.status).toBe('ok');
    expect(frame.residual).toBeLessThanOrEqual(1e-8);
    expect(Number.isFinite(frame.inputEffort!.valueSI)).toBe(true);
  });

  it('actually carries the slider’s weight', () => {
    // The assertion that a point body is present rather than merely allowed
    // for: a solver that dropped the mass would balance just as happily and
    // report the same torque for both of these.
    const light = weightAlongTheGuide(0).getForceAnalysis('static').frames[0];
    const heavy = weightAlongTheGuide(50).getForceAnalysis('static').frames[0];

    expect(light.status).toBe('ok');
    expect(heavy.status).toBe('ok');
    expect(heavy.inputEffort!.valueSI).not.toBeCloseTo(light.inputEffort!.valueSI, 6);
  });

  it('gives a Slide a guide couple and a Pin-in-slot none', () => {
    // A free-turning rider exchanges only a normal force with its slot; one
    // held against the slot needs the guide to supply a moment as well. That
    // is `rotates`, and it is the only thing separating these two drawings.
    const pinInSlot = withSliderMass(1).getForceAnalysis('static').frames[0];
    const slide = build(
      ...(Object.values(scotchYoke(false)).slice(0, 2) as [Joint[], Link[]]),
      true
    ).getForceAnalysis('static').frames[0];

    expect(pinInSlot.guideCouples.size).toBe(0);
    expect(slide.guideCouples.size).toBe(1);
  });
});

describe('the rates of a slider whose guide is fixed in the world', () => {
  it('moves the rider along its guide and nowhere else', () => {
    // The loop used to cross a grounded guide along the block's own edge, and
    // the sliding rate was the unknown that edge carried. With the block gone
    // the walk steps straight onto the joint, so the rate has to enter the loop
    // some other way -- and if it does not, the rider either reads as
    // stationary or the system goes singular and reports nothing at all.
    const { joints, links } = groundedPinInSlot(true);
    const mechanism = build(joints, links);
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;

    let moved = 0;
    for (let step = 0; step < mechanism.joints.length; step++) {
      KinematicsSolver.determineKinematics(
        mechanism.joints[step],
        mechanism.links[step],
        mechanism.inputAngularVelocities[step]
      );
      const velocity = KinematicsSolver.jointVelMap.get('C');
      expect(velocity, `C has a velocity at step ${step}`).toBeDefined();
      expect(Number.isFinite(velocity![0]), `C vx finite at step ${step}`).toBe(true);
      // Exactly zero, not merely small. A rider's rate is written along its
      // guide -- `[s * cos t, s * sin t]` at the slot's own heading -- so on a
      // horizontal guide the y component is `sin 0`. A few ten-thousandths
      // there is the signature of the rate having come from the ordinary link
      // walk instead, which is what happens when nothing carries the sliding
      // unknown into the loop.
      expect(Math.abs(velocity![1]), `C vy at step ${step}`).toBeLessThan(1e-9);
      moved = Math.max(moved, Math.abs(velocity![0]));
    }
    // And it genuinely moves, so the assertions above cannot pass on zeros.
    expect(moved).toBeGreaterThan(0.1);
  });
});
