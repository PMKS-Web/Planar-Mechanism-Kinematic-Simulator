// joint.ts first: see the import-cycle note in test-utils/verification/fixture.ts.
import { RevJoint } from '../joint';
import { Coord } from '../coord';
import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { siUnitFactors } from '../unit-conversions';
import { buildMechanism, inModelUnits } from '../../../test-utils/verification/fixture';
import {
  ROCKER_CENTER,
  ROCKER_INERTIA,
  ROCKER_MASS,
  spinningBarFixture,
  weightedRockerFourBarFixture,
} from '../../../test-utils/verification/inertia-fixtures';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { ForceSolver } from './force-solver';
import { Mechanism } from './mechanism';

// Dynamic force analysis, checked against hand calculation on mechanisms drawn
// the way the app draws them: every coordinate MODEL_SCALE times the reader's
// number (render-scale.ts).
//
// The solver used to take model units for meters. Statics survived it, since
// every term of a moment row scaled together and only the torque came out two
// hundred times too large -- which the graph quietly divided back down. The
// inertia terms did not: m·a arrived two hundred times over, and I·α, which has
// no length in it, was weighed against moment arms two hundred times too long.
// Every spec that could have seen it built its mechanisms at raw coordinates,
// where a model unit really is a meter.

type Vec = [number, number];

const GRAVITY = 9.80665;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
const times = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
const cross = (a: Vec, b: Vec): number => a[0] * b[1] - a[1] * b[0];
/** k × r: the velocity a unit spin gives a point at r. */
const perp = (r: Vec): Vec => [-r[1], r[0]];
/** x and y such that x·p + y·q = rhs. */
const solve2 = (p: Vec, q: Vec, rhs: Vec): Vec => {
  const det = cross(p, q);
  return [cross(rhs, q) / det, cross(p, rhs) / det];
};

/** Agreement to a part in a million of the quantity's own size. */
function expectNear(actual: number, expected: number, size = Math.abs(expected)): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-6 * Math.max(1, size));
}

function expectVectorNear(actual: Vec | undefined, expected: Vec): void {
  expect(actual).toBeDefined();
  const size = Math.hypot(expected[0], expected[1]);
  expectNear(actual![0], expected[0], size);
  expectNear(actual![1], expected[1], size);
}

describe('dynamic force analysis at model scale', () => {
  describe('a bar spinning at a steady rate', () => {
    // 2 kg over 2 m, its center at the middle, turning at 1 rad/s: the pin
    // pulls it round with m·ω²·r = 2 N and nothing else.
    it('pulls it round with m·ω²·r, not MODEL_SCALE times that', () => {
      const { mechanism } = buildMechanism(inModelUnits(spinningBarFixture()));
      const series = mechanism.getForceAnalysis('dynamic');
      expect(series.successfulFrames).toBe(series.frames.length);

      // The reported case, exactly: −400 N before the fix.
      expectVectorNear(series.frames[0].jointReactions.get('A'), [-2, 0]);

      // And at every pose the same 2 N, toward the pin.
      series.frames.forEach((frame, t) => {
        const at = (id: string) => mechanism.joints[t].find((joint) => joint.id === id)!;
        const center = times(sub([at('B').x, at('B').y], [at('A').x, at('A').y]), 0.5);
        const omega = mechanism.inputAngularVelocities[t];
        expectVectorNear(
          frame.jointReactions.get('A'),
          times(center, (-2 * omega * omega) / MODEL_SCALE)
        );
      });
    });

    it('needs the torque its weight asks for, in real newton-meters', () => {
      // Horizontal at the start, so the drive holds 2 kg at 1 m: m·g·x.
      const { mechanism } = buildMechanism(inModelUnits(spinningBarFixture(true)));
      const frame = mechanism.getForceAnalysis('dynamic').frames[0];
      expect(frame.inputEffort!.kind).toBe('torque');
      expectNear(frame.inputEffort!.valueSI, 2 * GRAVITY * 1);
      expectVectorNear(frame.jointReactions.get('A'), [-2, 2 * GRAVITY]);
      expectNear(mechanism.getForceAnalysis('static').frames[0].inputEffort!.valueSI, 2 * GRAVITY);
    });
  });

  describe('a bar being spun up, its center off its own axis', () => {
    // A bar pinned at A with its center G at r = (1.2, 0.4) m, turning at ω = 3
    // and speeding up at α = 4. By hand, in SI:
    //   a_G = α·k×r − ω²·r            = (−12.4, 1.2) m/s²
    //   R_A = m·a_G                    = (−24.8, 2.4) N
    //   τ   = I_A·α = (I_G + m·|r|²)·α = (0.5 + 2·1.6)·4 = 14.8 N·m
    // The reaction carries the m·a term and the torque carries I·α beside it,
    // so a length unit wrong in either shows here.
    const MASS = 2;
    const INERTIA = 0.5;
    const OMEGA = 3;
    const ALPHA = 4;
    const R: Vec = [1.2, 0.4];
    const ACCELERATION = add(times(perp(R), ALPHA), times(R, -OMEGA * OMEGA));

    for (const unit of ['m', 'cm', 'in'] as const) {
      it(`balances m·a and I·α in real units, drawn in ${unit}`, () => {
        if (!ColorService.instance) new ColorService();
        new SettingsService();
        const units = siUnitFactors(unit);
        // Model units per meter in this drawing, and the same for mass and inertia.
        const model = MODEL_SCALE / units.distanceToM;
        const a = new RevJoint('A', 0, 0, true, true);
        const b = new RevJoint('B', 2 * model, 0);
        const link = new RealLink(
          'AB',
          [a, b],
          MASS / units.massToKg,
          INERTIA / units.inertiaToKgM2,
          new Coord(R[0] * model, R[1] * model)
        );
        a.links = [link];
        b.links = [link];
        a.connectedJoints = [b];
        b.connectedJoints = [a];

        // What the kinematics solver would hand over: model units per s².
        const frame = ForceSolver.analyzeFrame([a, b], [link], 'dynamic', false, unit, 0, {
          linkAccelerations: new Map([['AB', times(ACCELERATION, model)]]),
          linkAngularAccelerations: new Map([['AB', ALPHA]]),
          pistonAccelerations: new Map(),
        });

        expect(frame.status).toBe('ok');
        expectVectorNear(frame.jointReactions.get('A'), times(ACCELERATION, MASS));
        expectVectorNear(frame.jointReactions.get('A'), [-24.8, 2.4]);
        expectNear(frame.inputEffort!.valueSI, (INERTIA + MASS * (R[0] ** 2 + R[1] ** 2)) * ALPHA);
        expectNear(frame.inputEffort!.valueSI, 14.8);
      });
    }
  });

  describe('a four-bar whose rocker carries all the mass', () => {
    // Crank and coupler weigh nothing, so the coupler is a two-force member
    // and the rocker's equilibrium is three equations in three unknowns. The
    // rocker's center sits off the line CD, and its angular acceleration
    // changes all cycle. Everything below is derived from the solved positions
    // alone: the rates by the textbook velocity and acceleration polygons, the
    // forces by Newton-Euler on the rocker.
    const fourBar = weightedRockerFourBarFixture;

    /** Hand kinematics and statics at timestep t, in SI. */
    const byHand = (mechanism: Mechanism, t: number) => {
      const at = (id: string, step = t): Vec => {
        const joint = mechanism.joints[step].find((candidate) => candidate.id === id)!;
        return [joint.x / MODEL_SCALE, joint.y / MODEL_SCALE];
      };
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => at(id));
      const rBA = sub(B, A);
      const rCB = sub(C, B);
      const rCD = sub(C, D);
      const w2 = mechanism.inputAngularVelocities[t];

      // v_B + ω3·k×rCB = ω4·k×rCD
      const [w3, w4] = solve2(perp(rCB), times(perp(rCD), -1), times(perp(rBA), -w2));
      // a_B + α3·k×rCB − ω3²·rCB = α4·k×rCD − ω4²·rCD, with a_B = −ω2²·rBA
      const [, a4] = solve2(
        perp(rCB),
        times(perp(rCD), -1),
        add(add(times(rBA, w2 * w2), times(rCB, w3 * w3)), times(rCD, -w4 * w4))
      );

      // The rocker's center rides it round from where it was drawn.
      const startArm = sub(at('C', 0), at('D', 0));
      const turn = Math.atan2(rCD[1], rCD[0]) - Math.atan2(startArm[1], startArm[0]);
      const drawn = sub(ROCKER_CENTER, at('D', 0));
      const rGD: Vec = [
        drawn[0] * Math.cos(turn) - drawn[1] * Math.sin(turn),
        drawn[0] * Math.sin(turn) + drawn[1] * Math.cos(turn),
      ];
      const aG = add(times(perp(rGD), a4), times(rGD, -w4 * w4));

      // Moments about D: rCD × F·u + rGD × W = I·α4 + rGD × m·a_G.
      const weight: Vec = [0, -ROCKER_MASS * GRAVITY];
      const inertial = sub(times(aG, ROCKER_MASS), weight);
      const u = times(rCB, 1 / Math.hypot(rCB[0], rCB[1]));
      const pull = (ROCKER_INERTIA * a4 + cross(rGD, inertial)) / cross(rCD, u);
      return {
        alpha: a4,
        atD: sub(inertial, times(u, pull)),
        // The weightless crank passes the coupler's pull straight to its pin,
        // and the drive balances its moment.
        atA: times(u, pull),
        torque: cross(rBA, times(u, pull)),
      };
    };

    it('matches hand Newton-Euler at every pose of the cycle', () => {
      const { mechanism } = buildMechanism(inModelUnits(fourBar()));
      const series = mechanism.getForceAnalysis('dynamic');
      expect(series.frames.length).toBeGreaterThan(300);
      expect(series.successfulFrames).toBe(series.frames.length);

      let largestAlpha = 0;
      series.frames.forEach((frame, t) => {
        const expected = byHand(mechanism, t);
        largestAlpha = Math.max(largestAlpha, Math.abs(expected.alpha));
        expectVectorNear(frame.jointReactions.get('D'), expected.atD);
        expectVectorNear(frame.jointReactions.get('A'), expected.atA);
        expectNear(frame.inputEffort!.valueSI, expected.torque);
      });
      // Not a steady swing: I·α is a real term here, not a zero.
      expect(largestAlpha).toBeGreaterThan(1);
    });

    it('reaches the same singular verdict whatever unit it is drawn in', () => {
      // A torque column written against arms in meters would sit in its row
      // at a size set by the unit, and the scaled pivot that decides
      // "singular" with it. The same drawing read in three units must pass
      // the same poses, with the same margin.
      const built = buildMechanism(inModelUnits(fourBar()));
      const pivotsIn = (unit: string) =>
        new Mechanism(built.joints, built.links, built.forces, [], true, unit, 2, 'degree')
          .getForceAnalysis('static')
          .frames.map((frame) => frame.minPivot ?? Number.NaN);
      const meters = pivotsIn('m');
      expect(meters.every((pivot) => pivot > 1e-3)).toBe(true);
      for (const unit of ['cm', 'in']) {
        pivotsIn(unit).forEach((pivot, t) =>
          expect(Math.abs(pivot - meters[t])).toBeLessThanOrEqual(1e-9 * meters[t])
        );
      }
    });
  });
});
