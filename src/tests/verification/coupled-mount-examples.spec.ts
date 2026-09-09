// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  axialCarriageFixture,
  BOOM,
  BRACKET_ARM,
  BRACKET_REACH,
  CARRIER,
  MOUNT_INPUT_SPEED,
  OBLIQUE,
  obliqueGuideFixture,
  permuted,
  rotatingCarrierFixture,
  translatingBracketFixture,
  weldedBoomFixture,
} from '../../test-utils/verification/coupled-mount-fixtures';
import { cylinderBetween } from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { PositionSolver } from '../../app/model/mechanism/position-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';

/**
 * Five drawings the walk cannot place, each solved against arithmetic.
 *
 * Everything else about the coupled route is checked by comparing it with the
 * walk on mechanisms both can do. That is the right check for the machinery
 * and the wrong one for the feature: the drawings this route exists for are
 * exactly the ones the walk has no answer to compare with. So each of these
 * five is chosen for having a motion that can be written down -- a carriage on
 * a line, a quadratic, a translation, a vector read in a turning frame, a law
 * of cosines -- and every joint, at every sample, is checked against the
 * closed form rather than against another run of the solver.
 *
 * They are also the first mechanisms in the suite that reach the coupled route
 * *by themselves*. `forceCoupledRoute` is off throughout; a mount welded into
 * a bracket, or carrying a block of its own, is what selects it, and each
 * example asserts that it was selected rather than assuming it.
 *
 * What is asserted, for every one of them and at every sample:
 *
 *   - where each joint is, how fast it is going, and how hard it is
 *     accelerating, against the hand derivation written beside the example;
 *   - that the ram is still a ram: barrel and rod their own lengths, block on
 *     its pin, the four axis joints in a line and in the right order along it,
 *     and the whole part inside its stroke;
 *   - that the cycle closes where it started and reverses at both stops;
 *   - and that renaming every joint and turning every list round changes
 *     nothing.
 *
 * Nothing is skipped. A joint the solver did not answer for, or answered with
 * a NaN, is the failure this file is looking for rather than a sample quietly
 * passed over.
 */

type Vec = [number, number];
/** A pose and its two derivatives, by joint id. */
interface Motion {
  position: Map<string, Vec>;
  velocity: Map<string, Vec>;
  acceleration: Map<string, Vec>;
}

/** The drawing scale every example is built and checked at. */
const SCALE = MODEL_SCALE;

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const scaled = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const unit = (angle: number): Vec => [Math.cos(angle), Math.sin(angle)];
const across = (angle: number): Vec => [-Math.sin(angle), Math.cos(angle)];
const cross = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];
const apart = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The turning rate and angular acceleration of the line from `from` to `to`.
 *
 * Both ends may be moving. Written once because three of the five examples
 * carry a body whose heading is a ram's, and the ram's own ends are the only
 * thing that says what that heading is doing.
 */
function heading(
  span: Vec,
  spanRate: Vec,
  spanAccel: Vec
): { angle: number; rate: number; accel: number } {
  const length = Math.hypot(span[0], span[1]);
  const angle = Math.atan2(span[1], span[0]);
  const rate = cross(span, spanRate) / (length * length);
  const lengthRate = dot(span, spanRate) / length;
  const accel = cross(span, spanAccel) / (length * length) - (2 * lengthRate * rate) / length;
  return { angle, rate, accel };
}

/**
 * The interior of a ram lying between two mounts, as the model lays it out.
 *
 * Barrel and rod are equal by construction, so a ram is one length and one
 * position along its own axis; both come from the drawn span and never change.
 */
function interior(spanAtRest: number) {
  const { barrel, pinAlong, stroke } = cylinderBetween(
    { x: 0, y: 0 },
    { x: spanAtRest, y: 0 },
    0.5
  );
  return {
    barrel: barrel * SCALE,
    /** The rod, which is the same length as the barrel. */
    rod: (spanAtRest - pinAlong) * SCALE,
    /** Half the travel either way from where it was drawn. */
    reach: (stroke / 2) * SCALE,
    rest: spanAtRest * SCALE,
  };
}

/**
 * One example: how to build it, what its drive commands, and what that
 * command implies about every joint in the drawing.
 */
interface Example {
  name: string;
  make: (scale: number) => MechanismFixture;
  /**
   * Whether the ram is driven by something else. A passive ram's length is an
   * answer rather than a command, and the thing that stops the mechanism is
   * its stroke being reached by an actuator elsewhere in the drawing.
   */
  passiveRam?: true;
  /** Ids of the two mounts, so the ram invariants know which part is which. */
  ram: { barrelMount: string; barrelEnd: string; pin: string; block: string; rodMount: string };
  /** The prescribed scalar, read off the drawing at one sample. */
  commandOf: (position: Map<string, Vec>) => number;
  /** How much of it one sample covers, and in which units the drive is read. */
  step: number;
  /** The whole motion at a command and the rate it is being changed at. */
  motionAt: (command: number, rate: number) => Motion;
  /** The ram's rest span, for the stroke bounds. */
  restSpan: number;
}

// ---------------------------------------------------------------------------
// 1. A carriage on the ram's own axis.
//
//     O = R - s x̂ ,  Ȯ = -ṡ x̂ ,  Ö = 0
//
// The eye is fixed and the guide runs through it, so commanding the ram's
// length places the carriage outright. The pin does not move at all: it stands
// its own rod's length back from a fixed eye along a fixed direction.
// ---------------------------------------------------------------------------
const AXIAL_REACH = 10;

const axial: Example = {
  name: 'a carriage on the ram’s own axis',
  make: axialCarriageFixture,
  ram: { barrelMount: 'O', barrelEnd: 'N', pin: 'P', block: 'S', rodMount: 'R' },
  commandOf: (position) => apart(position.get('O')!, position.get('R')!),
  step: 0,
  restSpan: AXIAL_REACH,
  motionAt: (span, rate) => {
    const part = interior(AXIAL_REACH);
    const eye: Vec = [AXIAL_REACH * SCALE, 0];
    const mount: Vec = [eye[0] - span, 0];
    const pin: Vec = [eye[0] - part.rod, 0];
    const carriage: Vec = [-rate, 0];
    const still: Vec = [0, 0];
    return {
      position: new Map<string, Vec>([
        ['O', mount],
        ['N', [mount[0] + part.barrel, 0]],
        ['P', pin],
        ['S', pin],
        ['K', mount],
        ['R', eye],
      ]),
      velocity: new Map<string, Vec>([
        ['O', carriage],
        ['N', carriage],
        ['K', carriage],
        ['P', still],
        ['S', still],
        ['R', still],
      ]),
      acceleration: new Map<string, Vec>(
        ['O', 'N', 'K', 'P', 'S', 'R'].map((id) => [id, still] as [string, Vec])
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// 2. A carriage on a guide that runs across the ram.
//
// With the guide written as O₀ + t u and the eye at R, the ram's length is a
// quadratic in t:
//
//     t = c - √(s² - h²),   c = u·(R - O₀),   h² = |R - O₀|² - c²
//
// the near root of the two the residual is equally happy with. Differentiating,
// with w = √(s² - h²):
//
//     ṫ = -s ṡ / w ,   ẗ = ṡ² h² / w³
//
// The ram's own heading turns as the carriage moves, so the barrel's buried
// end and the pin carry that rotation on top of the mount's travel.
// ---------------------------------------------------------------------------
const oblique: Example = (() => {
  const u = unit(OBLIQUE.heading);
  const normal = across(OBLIQUE.heading);
  const start: Vec = [0, 0];
  const eye: Vec = scaled(add(scaled(u, OBLIQUE.foot), scaled(normal, OBLIQUE.standoff)), SCALE);
  const c = dot(u, [eye[0] - start[0], eye[1] - start[1]]);
  const standoff = OBLIQUE.standoff * SCALE;
  const rest = Math.hypot(eye[0], eye[1]) / SCALE;
  return {
    name: 'a carriage on a guide that runs across the ram',
    make: obliqueGuideFixture,
    ram: { barrelMount: 'O', barrelEnd: 'N', pin: 'P', block: 'S', rodMount: 'R' },
    commandOf: (position) => apart(position.get('O')!, position.get('R')!),
    step: 0,
    restSpan: rest,
    motionAt: (span, rate) => {
      const part = interior(rest);
      const w = Math.sqrt(span * span - standoff * standoff);
      const travel = c - w;
      const travelRate = (-span * rate) / w;
      const travelAccel = (rate * rate * standoff * standoff) / (w * w * w);
      const mount = add(start, scaled(u, travel));
      const mountRate = scaled(u, travelRate);
      const mountAccel = scaled(u, travelAccel);
      const axis: Vec = [eye[0] - mount[0], eye[1] - mount[1]];
      const turn = heading(axis, scaled(mountRate, -1), scaled(mountAccel, -1));
      const along = unit(turn.angle);
      const sideways = across(turn.angle);
      /** A point `reach` out from the mount along the ram. */
      const rider = (reach: number) => ({
        position: add(mount, scaled(along, reach)),
        velocity: add(mountRate, scaled(sideways, reach * turn.rate)),
        acceleration: add(
          mountAccel,
          add(scaled(sideways, reach * turn.accel), scaled(along, -reach * turn.rate * turn.rate))
        ),
      });
      const barrelEnd = rider(part.barrel);
      // The pin slides in the barrel, so it is not carried by it. What does
      // carry it is the rod, whose far end is the fixed eye: the pin is the
      // rod's own length back from there, along a heading that turns.
      const pin = {
        position: add(eye, scaled(along, -part.rod)),
        velocity: scaled(sideways, -part.rod * turn.rate),
        acceleration: add(
          scaled(sideways, -part.rod * turn.accel),
          scaled(along, part.rod * turn.rate * turn.rate)
        ),
      };
      const still: Vec = [0, 0];
      return {
        position: new Map<string, Vec>([
          ['O', mount],
          ['K', mount],
          ['N', barrelEnd.position],
          ['P', pin.position],
          ['S', pin.position],
          ['R', eye],
        ]),
        velocity: new Map<string, Vec>([
          ['O', mountRate],
          ['K', mountRate],
          ['N', barrelEnd.velocity],
          ['P', pin.velocity],
          ['S', pin.velocity],
          ['R', still],
        ]),
        acceleration: new Map<string, Vec>([
          ['O', mountAccel],
          ['K', mountAccel],
          ['N', barrelEnd.acceleration],
          ['P', pin.acceleration],
          ['S', pin.acceleration],
          ['R', still],
        ]),
      };
    },
  };
})();

// ---------------------------------------------------------------------------
// 3. A bracket that translates, carrying a passive ram.
//
// The bracket is welded to a grounded guide's block, so it keeps its heading
// against the world; the barrel is welded into the bracket, so it keeps its
// heading too. Everything on the compound therefore moves at the drive's own
// speed and nothing accelerates. The ram is passive: its length is whatever
// the gap to the fixed eye happens to be, and the pin -- the rod's own length
// back from that eye, along a direction that never turns -- does not move.
//
//     O = (τ, 0),  W = O + (0, arm),  s = reach - τ
// ---------------------------------------------------------------------------
const bracket: Example = {
  name: 'a bracket that translates, carrying a passive ram',
  passiveRam: true,
  make: translatingBracketFixture,
  ram: { barrelMount: 'O', barrelEnd: 'N', pin: 'P', block: 'S', rodMount: 'R' },
  // Read off the bracket's own joint, which the drive places: the ram here is
  // driven by nothing and its length is an answer, not a command.
  commandOf: (position) => position.get('W')![0],
  step: 0,
  restSpan: BRACKET_REACH,
  motionAt: (travel, rate) => {
    const part = interior(BRACKET_REACH);
    const eye: Vec = [BRACKET_REACH * SCALE, 0];
    const mount: Vec = [travel, 0];
    const pin: Vec = [eye[0] - part.rod, 0];
    const moving: Vec = [rate, 0];
    const still: Vec = [0, 0];
    return {
      position: new Map<string, Vec>([
        ['W', [travel, BRACKET_ARM * SCALE]],
        ['K', [travel, BRACKET_ARM * SCALE]],
        ['O', mount],
        ['N', [mount[0] + part.barrel, 0]],
        ['P', pin],
        ['S', pin],
        ['R', eye],
      ]),
      velocity: new Map<string, Vec>([
        ['W', moving],
        ['K', moving],
        ['O', moving],
        ['N', moving],
        ['P', still],
        ['S', still],
        ['R', still],
      ]),
      acceleration: new Map<string, Vec>(
        ['W', 'K', 'O', 'N', 'P', 'S', 'R'].map((id) => [id, still] as [string, Vec])
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// 4. A mount riding a slot cut into a turning crank.
//
// The mount is welded to its block, so the ram stands square to the slot, and
// the eye is pinned to ground. Read in the crank's own frame the whole pose is
// two components of one fixed vector:
//
//     ρ = d cos(φ₀ - θ)   along the slot
//     s = d sin(φ₀ - θ)   the ram's length
//
// with d and φ₀ the eye's polar coordinates about the crank pin. Then
// ρ̇ = s ω and ṡ = -ρ ω, and the mount's acceleration is
//
//     Ö = (ρ̈ - ρω²) e + 2 ρ̇ ω e⊥ = -2ρω² e + 2sω² e⊥
//
// whose second term is the Coriolis one -- the largest thing in the answer
// where the mount is sliding fastest, and invisible to any formulation that
// forgot the frame was turning.
// ---------------------------------------------------------------------------
const carrier: Example = (() => {
  const eye: Vec = [CARRIER.eye.x * SCALE, CARRIER.eye.y * SCALE];
  const reach = Math.hypot(eye[0], eye[1]);
  const bearing = Math.atan2(eye[1], eye[0]);
  return {
    name: 'a mount riding a slot cut into a turning crank',
    passiveRam: true,
    make: rotatingCarrierFixture,
    ram: { barrelMount: 'O', barrelEnd: 'N', pin: 'P', block: 'S', rodMount: 'R' },
    commandOf: (position) => Math.atan2(position.get('E')![1], position.get('E')![0]),
    step: 0,
    restSpan: Math.hypot(CARRIER.eye.x - CARRIER.mountAlong, CARRIER.eye.y),
    motionAt: (angle, omega) => {
      const part = interior(Math.hypot(CARRIER.eye.x - CARRIER.mountAlong, CARRIER.eye.y));
      const e = unit(angle);
      const perpendicular = across(angle);
      const along = reach * Math.cos(bearing - angle);
      const span = reach * Math.sin(bearing - angle);
      const alongRate = span * omega;
      const mount = scaled(e, along);
      const mountRate = add(scaled(e, alongRate), scaled(perpendicular, along * omega));
      const mountAccel = add(
        scaled(e, -2 * along * omega * omega),
        scaled(perpendicular, 2 * span * omega * omega)
      );
      /** A point `out` from the mount along the ram, which points across the slot. */
      const rider = (out: number) => ({
        position: add(mount, scaled(perpendicular, out)),
        velocity: add(mountRate, scaled(e, -out * omega)),
        acceleration: add(mountAccel, scaled(perpendicular, -out * omega * omega)),
      });
      const far = scaled(e, CARRIER.slot * SCALE);
      const barrelEnd = rider(part.barrel);
      // Measured back from the fixed eye, for the reason above: the pin is on
      // the rod, not on the barrel it slides inside.
      const pin = {
        position: add(eye, scaled(perpendicular, -part.rod)),
        velocity: scaled(e, part.rod * omega),
        acceleration: scaled(perpendicular, part.rod * omega * omega),
      };
      const still: Vec = [0, 0];
      return {
        position: new Map<string, Vec>([
          ['A', still],
          ['E', far],
          ['O', mount],
          ['Q', mount],
          ['N', barrelEnd.position],
          ['P', pin.position],
          ['S', pin.position],
          ['R', eye],
        ]),
        velocity: new Map<string, Vec>([
          ['A', still],
          ['E', scaled(perpendicular, CARRIER.slot * SCALE * omega)],
          ['O', mountRate],
          ['Q', mountRate],
          ['N', barrelEnd.velocity],
          ['P', pin.velocity],
          ['S', pin.velocity],
          ['R', still],
        ]),
        acceleration: new Map<string, Vec>([
          ['A', still],
          ['E', scaled(e, -CARRIER.slot * SCALE * omega * omega)],
          ['O', mountAccel],
          ['Q', mountAccel],
          ['N', barrelEnd.acceleration],
          ['P', pin.acceleration],
          ['S', pin.acceleration],
          ['R', still],
        ]),
      };
    },
  };
})();

// ---------------------------------------------------------------------------
// 5. A boom whose ram's rod mount is welded into a bracket.
//
// The ram commands the boom's angle through the law of cosines,
//
//     s² = L² + g² - 2 L g cos θ
//
// so, differentiating twice with the ram's speed held constant,
//
//     θ̇ = s ṡ / (L g sin θ)
//     θ̈ = (ṡ² - L g cos θ θ̇²) / (L g sin θ)
//
// The rod is welded into a bracket rather than pinned free, so the bracket
// turns with the *ram*, not with the boom -- and the witness `W` is out of the
// ram's line, where a_W = a_C + α × r - ω² r is the only thing that puts it.
// A body whose angular acceleration were wrong would still place every joint
// on the ram's own axis correctly.
// ---------------------------------------------------------------------------
const boom: Example = (() => {
  const pivot: Vec = [0, 0];
  const eye: Vec = [BOOM.pivotToEye * SCALE, 0];
  const length = BOOM.length * SCALE;
  const tip: Vec = [0, length];
  const witness: Vec = [BOOM.witness.x * SCALE, BOOM.witness.y * SCALE];
  const rest = Math.hypot(tip[0] - eye[0], tip[1] - eye[1]) / SCALE;
  const arm = apart(witness, tip);
  const restHeading = Math.atan2(tip[1] - eye[1], tip[0] - eye[0]);
  const offset = Math.atan2(witness[1] - tip[1], witness[0] - tip[0]) - restHeading;
  return {
    name: 'a boom whose rod mount is welded into a bracket',
    make: weldedBoomFixture,
    ram: { barrelMount: 'G', barrelEnd: 'N', pin: 'P', block: 'S', rodMount: 'C' },
    commandOf: (position) => apart(position.get('G')!, position.get('C')!),
    step: 0,
    restSpan: rest,
    motionAt: (span, rate) => {
      const part = interior(rest);
      const swing = eye[0] * length;
      const angle = Math.acos(
        (length * length + eye[0] * eye[0] - span * span) / (2 * length * eye[0])
      );
      const omega = (span * rate) / (swing * Math.sin(angle));
      const alpha =
        (rate * rate - swing * Math.cos(angle) * omega * omega) / (swing * Math.sin(angle));
      const e = unit(angle);
      const perpendicular = across(angle);
      const tipNow = scaled(e, length);
      const tipRate = scaled(perpendicular, length * omega);
      const tipAccel = add(
        scaled(perpendicular, length * alpha),
        scaled(e, -length * omega * omega)
      );
      const axis: Vec = [tipNow[0] - eye[0], tipNow[1] - eye[1]];
      const turn = heading(axis, tipRate, tipAccel);
      const along = unit(turn.angle);
      const sideways = across(turn.angle);
      /** A point `out` from the fixed eye along the ram. */
      const onAxis = (out: number) => ({
        position: add(eye, scaled(along, out)),
        velocity: scaled(sideways, out * turn.rate),
        acceleration: add(
          scaled(sideways, out * turn.accel),
          scaled(along, -out * turn.rate * turn.rate)
        ),
      });
      const witnessArm = unit(turn.angle + offset);
      const witnessAcross = across(turn.angle + offset);
      const barrelEnd = onAxis(part.barrel);
      // The pin rides the rod, and the rod's far end is the boom tip -- so it
      // is the tip's motion plus a turn, not the fixed eye's plus a slide.
      const pin = {
        position: add(tipNow, scaled(along, -part.rod)),
        velocity: add(tipRate, scaled(sideways, -part.rod * turn.rate)),
        acceleration: add(
          tipAccel,
          add(
            scaled(sideways, -part.rod * turn.accel),
            scaled(along, part.rod * turn.rate * turn.rate)
          )
        ),
      };
      const still: Vec = [0, 0];
      return {
        position: new Map<string, Vec>([
          ['O', pivot],
          ['G', eye],
          ['C', tipNow],
          ['N', barrelEnd.position],
          ['P', pin.position],
          ['S', pin.position],
          ['W', add(tipNow, scaled(witnessArm, arm))],
        ]),
        velocity: new Map<string, Vec>([
          ['O', still],
          ['G', still],
          ['C', tipRate],
          ['N', barrelEnd.velocity],
          ['P', pin.velocity],
          ['S', pin.velocity],
          ['W', add(tipRate, scaled(witnessAcross, arm * turn.rate))],
        ]),
        acceleration: new Map<string, Vec>([
          ['O', still],
          ['G', still],
          ['C', tipAccel],
          ['N', barrelEnd.acceleration],
          ['P', pin.acceleration],
          ['S', pin.acceleration],
          [
            'W',
            add(
              tipAccel,
              add(
                scaled(witnessAcross, arm * turn.accel),
                scaled(witnessArm, -arm * turn.rate * turn.rate)
              )
            ),
          ],
        ]),
      };
    },
  };
})();

const EXAMPLES = [axial, oblique, bracket, carrier, boom];

/** Every joint of one sample, by id. */
function poseOf(mechanism: Mechanism, t: number): Map<string, Vec> {
  return new Map(mechanism.joints[t].map((joint) => [joint.id, [joint.x, joint.y] as Vec]));
}

/** Velocities and accelerations at every sample, walked in order. */
function ratesOf(
  mechanism: Mechanism
): { velocity: Map<string, Vec>; acceleration: Map<string, Vec> }[] {
  KinematicsSolver.resetVariables();
  mechanism.prepareSolvers();
  return mechanism.joints.map((pose, t) => {
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );
    return {
      velocity: new Map(
        pose.map((joint) => [
          joint.id,
          [...(KinematicsSolver.jointVelMap.get(joint.id) ?? [NaN, NaN])] as Vec,
        ])
      ),
      acceleration: new Map(
        pose.map((joint) => [
          joint.id,
          [...(KinematicsSolver.jointAccMap.get(joint.id) ?? [NaN, NaN])] as Vec,
        ])
      ),
    };
  });
}

const solver = PositionSolver as unknown as {
  forceCoupledRoute: boolean;
  coupledRoute: boolean;
  jointNumOrderSolverMap: Map<number, string[]>;
  desiredAnalysisJointMap: Map<string, string>;
};

describe('a drawing whose cylinder mounts are welded or riding slots', () => {
  for (const example of EXAMPLES) {
    describe(example.name, () => {
      // Built once and read by every test below. `forceCoupledRoute` is
      // deliberately never touched: the route these take is the one the
      // drawing itself asks for.
      const built = buildMechanism(example.make(SCALE));
      const mechanism = built.mechanism;
      const took = {
        coupled: solver.coupledRoute,
        forced: solver.forceCoupledRoute,
        steps: [...solver.jointNumOrderSolverMap].map(
          ([, ids]) => solver.desiredAnalysisJointMap.get(ids[0]) ?? '?'
        ),
      };
      const rates = ratesOf(mechanism);
      const part = interior(example.restSpan);
      /** The commanded quantity at every sample, read off the drawing. */
      const commands = mechanism.joints.map((_, t) => example.commandOf(poseOf(mechanism, t)));

      it('is solved as one coupled system, without being told to be', () => {
        expect(took.forced).toBe(false);
        expect(took.coupled).toBe(true);
        expect(took.steps.filter((how) => how === 'simultaneousSystem')).toHaveLength(1);
        expect(took.steps[took.steps.length - 1]).toBe('simultaneousSystem');
        expect(mechanism.isMechanismValid()).toBe(true);
      });

      it('advances its drive by one constant step, turning round at each stop', () => {
        // The command is what everything below is predicted from, so what it
        // does has to be pinned first -- and pinned as arithmetic rather than
        // as whatever came back: one step per sample, the same size every
        // time, changing sign only where the input reverses.
        const step = commands[1] - commands[0];
        expect(Math.abs(step)).toBeGreaterThan(0);
        const signs = mechanism.inputAngularVelocities.map(Math.sign);
        let expected = commands[0];
        for (let t = 1; t < commands.length; t++) {
          expected += step * (signs[t] / signs[1]);
          // Read back off joint coordinates held to four decimals, so a few
          // units in that last place -- and a thousandth of a step, which is
          // what makes this a statement about the progression.
          expect(Math.abs(commands[t] - expected), `command at sample ${t}`).toBeLessThan(
            Math.abs(step) * 1e-3
          );
        }
        // Two reversals: out to one stop, back past the start to the other,
        // and home. A cycle that ran on without turning round would not be
        // this mechanism.
        const flips = signs.filter((sign, index) => index > 0 && sign !== signs[index - 1]);
        expect(flips).toHaveLength(2);
      });

      it('comes home to the pose it started in', () => {
        const start = poseOf(mechanism, 0);
        const end = poseOf(mechanism, mechanism.joints.length - 1);
        expect(end.size).toBe(start.size);
        for (const [id, at] of start) {
          expect(apart(at, end.get(id)!), `at ${id}`).toBeLessThan(1e-3);
        }
      });

      it('stands where the arithmetic says, at every sample', () => {
        let worst = 0;
        let where = '';
        for (let t = 0; t < mechanism.joints.length; t++) {
          const predicted = example.motionAt(commands[t], mechanism.inputAngularVelocities[t]);
          const pose = poseOf(mechanism, t);
          expect(pose.size).toBe(predicted.position.size);
          for (const [id, at] of predicted.position) {
            const solved = pose.get(id);
            expect(solved, `no joint ${id} at sample ${t}`).toBeDefined();
            expect(at.every(Number.isFinite), `prediction for ${id} at ${t}`).toBe(true);
            const off = apart(at, solved!);
            if (off > worst) {
              worst = off;
              where = `${id} at sample ${t}`;
            }
          }
        }
        // Positions are recorded to four decimals of a model unit, so this is
        // a few units in that last place across a whole cycle.
        expect(worst, where).toBeLessThan(1e-3);
      });

      it('moves at the speed the arithmetic says, at every sample', () => {
        let worst = 0;
        let scale = 0;
        let where = '';
        for (let t = 0; t < mechanism.joints.length; t++) {
          const predicted = example.motionAt(commands[t], mechanism.inputAngularVelocities[t]);
          for (const [id, at] of predicted.velocity) {
            const solved = rates[t].velocity.get(id);
            expect(solved, `no velocity for ${id} at sample ${t}`).toBeDefined();
            expect(
              solved!.every(Number.isFinite) && at.every(Number.isFinite),
              `velocity not a number for ${id} at sample ${t}`
            ).toBe(true);
            const off = apart(at, solved!);
            scale = Math.max(scale, Math.hypot(at[0], at[1]));
            if (off > worst) {
              worst = off;
              where = `${id} at sample ${t}`;
            }
          }
        }
        // The largest disagreement anywhere in these five is two parts in ten
        // million of the fastest thing in the drawing, so the bound is set an
        // order and a half above what the arithmetic actually costs rather
        // than at a round number that would let a missing term through.
        expect(worst, where).toBeLessThan(Math.max(scale, 1) * 1e-5);
      });

      it('accelerates the way the arithmetic says, at every sample', () => {
        let worst = 0;
        let scale = 0;
        let where = '';
        for (let t = 0; t < mechanism.joints.length; t++) {
          const predicted = example.motionAt(commands[t], mechanism.inputAngularVelocities[t]);
          for (const [id, at] of predicted.acceleration) {
            const solved = rates[t].acceleration.get(id);
            expect(solved, `no acceleration for ${id} at sample ${t}`).toBeDefined();
            expect(
              solved!.every(Number.isFinite) && at.every(Number.isFinite),
              `acceleration not a number for ${id} at sample ${t}`
            ).toBe(true);
            const off = apart(at, solved!);
            scale = Math.max(scale, Math.hypot(at[0], at[1]));
            if (off > worst) {
              worst = off;
              where = `${id} at sample ${t}`;
            }
          }
        }
        // Differenced once more than the velocities and still four parts in
        // ten million at worst, so it is held to the same bound: an
        // acceleration term left out of the formulation is not a small error.
        expect(worst, where).toBeLessThan(Math.max(scale, 1) * 1e-5);
      });

      it('is still a ram at every sample: lengths, block, line, order, stroke', () => {
        const { barrelMount, barrelEnd, pin, block, rodMount } = example.ram;
        for (let t = 0; t < mechanism.joints.length; t++) {
          const pose = poseOf(mechanism, t);
          const mount = pose.get(barrelMount)!;
          const buried = pose.get(barrelEnd)!;
          const head = pose.get(pin)!;
          const rider = pose.get(block)!;
          const eye = pose.get(rodMount)!;
          const where = `sample ${t}`;

          expect(apart(mount, buried), `barrel at ${where}`).toBeCloseTo(part.barrel, 3);
          expect(apart(head, eye), `rod at ${where}`).toBeCloseTo(part.rod, 3);
          expect(apart(head, rider), `block off its pin at ${where}`).toBeLessThan(1e-3);

          const axis: Vec = [eye[0] - mount[0], eye[1] - mount[1]];
          const span = Math.hypot(axis[0], axis[1]);
          const direction: Vec = [axis[0] / span, axis[1] / span];
          for (const [name, point] of [
            ['buried end', buried],
            ['pin', head],
          ] as [string, Vec][]) {
            const offset: Vec = [point[0] - mount[0], point[1] - mount[1]];
            expect(
              Math.abs(cross(direction, offset)),
              `${name} off the axis at ${where}`
            ).toBeLessThan(1e-3);
            // The order along that axis, which is the branch: mount, buried
            // end, pin, eye, each beyond the last. Every length is right in
            // the mirror image too.
            const reach = dot(direction, offset);
            expect(reach, `${name} behind the mount at ${where}`).toBeGreaterThan(-1e-3);
            expect(reach, `${name} past the eye at ${where}`).toBeLessThan(span + 1e-3);
          }

          expect(span, `stroke at ${where}`).toBeGreaterThan(part.rest - part.reach - 1e-3);
          expect(span, `stroke at ${where}`).toBeLessThan(part.rest + part.reach + 1e-3);
        }
      });

      it('is driven by the ram, or by something else that drives the ram to its stop', () => {
        // Both arrangements are here on purpose. Two of the five command the
        // ram directly; the other two command something else and leave the
        // ram's length to follow, so what ends the motion is a part nothing is
        // asking anything of, refusing.
        const fixture = example.make(SCALE);
        const sliders = fixture.sliders ?? [];
        expect(
          fixture.joints.some((joint) => joint.input) || sliders.some((spec) => spec.input)
        ).toBe(true);
        const ramIsDriven = sliders.some((spec) => spec.input && spec.sealed);
        expect(ramIsDriven).toBe(!example.passiveRam);
      });

      it('reaches both of its stops, so the stroke bound is what turned it round', () => {
        const spans = mechanism.joints.map((_, t) => {
          const pose = poseOf(mechanism, t);
          return apart(pose.get(example.ram.barrelMount)!, pose.get(example.ram.rodMount)!);
        });
        // Within one step of each end: the reversal happens at the first
        // sample the ram cannot reach, so it stops just short.
        const step = Math.abs(spans[1] - spans[0]) + 1e-6;
        expect(Math.max(...spans)).toBeGreaterThan(part.rest + part.reach - 2 * step);
        expect(Math.min(...spans)).toBeLessThan(part.rest - part.reach + 2 * step);
      });

      it('turns round leaving nothing of the sample it refused', () => {
        // A reversal is a refused sample: the drive asked for one step more
        // than the ram had, the solver declined, and the walk went back the
        // way it came. So the sample *after* a reversal is the one from
        // before it -- the same command, and the same pose, to the last
        // decimal a position is recorded at. A refusal that left its
        // half-solved answer behind would show here and almost nowhere else,
        // because every later sample would carry it along.
        const signs = mechanism.inputAngularVelocities.map(Math.sign);
        const flips = signs
          .map((sign, index) => (index > 0 && sign !== signs[index - 1] ? index : -1))
          .filter((index) => index > 1);
        expect(flips).toHaveLength(2);
        for (const flip of flips) {
          expect(Math.abs(commands[flip] - commands[flip - 2])).toBeLessThan(
            Math.abs(commands[1] - commands[0]) * 1e-3
          );
          const before = poseOf(mechanism, flip - 2);
          const after = poseOf(mechanism, flip);
          for (const [id, at] of before) {
            expect(apart(at, after.get(id)!), `${id} across the reversal at ${flip}`).toBeLessThan(
              1e-3
            );
          }
        }
      });

      it('draws the same motion with every joint renamed and every list turned round', () => {
        const other = buildMechanism(permuted(example.make(SCALE))).mechanism;
        expect(other.isMechanismValid()).toBe(true);
        expect(other.joints.length).toBe(mechanism.joints.length);
        const back = (id: string) => String.fromCharCode(id.charCodeAt(0) - 1);
        for (let t = 0; t < mechanism.joints.length; t++) {
          const pose = poseOf(mechanism, t);
          for (const joint of other.joints[t]) {
            const original = pose.get(back(joint.id));
            expect(original, `no original for ${joint.id}`).toBeDefined();
            expect(apart(original!, [joint.x, joint.y]), `${joint.id} at sample ${t}`).toBeLessThan(
              1e-3
            );
          }
        }
      });
    });
  }
});
