import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { RealLink, SliderBlock } from '../../app/model/link';
import { ForceAnalysisMode } from '../../app/model/mechanism/force-solver';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import { siUnitFactors } from '../../app/model/unit-conversions';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { buildMechanismAtScale, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  offsetLoadFourBarFixture,
  punchPressFixture,
} from '../../test-utils/verification/force-fixtures';
import {
  cylinderBoomFixture,
  loadedInvertedSliderCrankFixture,
  scotchYokeFixture,
  SLOT_RISE,
  YOKE_CRANK,
} from '../../test-utils/verification/slot-fixtures';

// Virtual work, as an independent audit of the whole force analysis.
//
// The equilibrium solve and this check share no arithmetic: one balances
// forces and moments body by body, the other multiplies the same answers by
// velocities — which are the kinematics the MATLAB suites verify — and asks
// for energy accounting. In statics the input's power must exactly cancel the
// applied loads'; in dynamics the difference must be the rate of change of
// kinetic energy. A sign error, a wrong moment arm, or a misplaced unit factor
// in any reaction path breaks this on nearly every frame of every mechanism,
// which is what makes it worth running across one specimen of each topology
// class rather than on a single blessed example.

const GRAVITY = 9.80665;

interface Audit {
  name: string;
  fixture: () => MechanismFixture;
}

const loadedScotchYoke = (): MechanismFixture => {
  const fixture = scotchYokeFixture();
  fixture.load = { onLink: 'CD', at: [YOKE_CRANK, SLOT_RISE], vector: [40, 0] };
  return fixture;
};

// The cylinder's geometry has to be drawn at the solving objectScale, or the
// ram has no travel and the mechanism never runs (see driven-cylinder.spec.ts).
const loadedCylinderBoom = (): MechanismFixture => {
  const fixture = cylinderBoomFixture(MODEL_SCALE);
  fixture.load = { onLink: 'OC', at: [0, 4 * MODEL_SCALE], vector: [0, -300] };
  return fixture;
};

const AUDITS: Audit[] = [
  { name: 'pin-jointed four-bar with an offset load', fixture: offsetLoadFourBarFixture },
  { name: 'slider-crank punch press', fixture: punchPressFixture },
  { name: 'inverted slider-crank with a floating slot', fixture: loadedInvertedSliderCrankFixture },
  { name: 'welded Scotch yoke', fixture: loadedScotchYoke },
  { name: 'sealed cylinder boom', fixture: loadedCylinderBoom },
];

/**
 * Worst relative power imbalance across the cycle, and how many frames could
 * be audited at all (a frame the solver refused, or whose analytic kinematics
 * are incomplete, proves nothing either way and is not counted).
 */
function audit(fixture: MechanismFixture, mode: ForceAnalysisMode) {
  const { mechanism } = buildMechanismAtScale(fixture, 1 * MODEL_SCALE);
  const series = mechanism.getForceAnalysis(mode);
  const units = siUnitFactors(mechanism.unit);
  KinematicsSolver.resetVariables();
  KinematicsSolver.requiredLoops = mechanism.requiredLoops;

  let audited = 0;
  let worst = 0;
  for (let t = 0; t < series.frames.length; t++) {
    const frame = series.frames[t];
    if (frame.status !== 'ok' || !frame.inputEffort) continue;
    KinematicsSolver.determineKinematics(
      mechanism.joints[t],
      mechanism.links[t],
      mechanism.inputAngularVelocities[t]
    );

    const terms: number[] = [];
    let complete = true;
    const need = (value: number | undefined): number => {
      if (value === undefined || !Number.isFinite(value)) {
        complete = false;
        return 0;
      }
      return value;
    };

    // What the input feeds in. A force drive is an internal pair — it pushes
    // the block and its carrier apart — so its power is the force times the
    // *extension* rate, the block's velocity relative to the material point of
    // the carrier it is passing. Against the world a grounded guide's carrier
    // term is simply zero.
    if (frame.inputEffort.kind === 'torque') {
      terms.push(frame.inputEffort.valueSI * mechanism.inputAngularVelocities[t]);
    } else {
      const slider = mechanism.joints[t].find(
        (joint): joint is PrisJoint => joint instanceof PrisJoint && joint.input
      )!;
      const block = mechanism.links[t].find(
        (link): link is SliderBlock =>
          link instanceof SliderBlock && link.joints.some((joint) => joint.id === slider.id)
      )!;
      const pin = block.joints.find((joint) => !(joint instanceof PrisJoint))!;
      const velocity = KinematicsSolver.jointVelMap.get(pin.id);
      let relative = [need(velocity?.[0]), need(velocity?.[1])];
      const carrier = slider.isFloating
        ? mechanism.links[t].find((link) => link.id === slider.carrier?.id)
        : undefined;
      if (carrier instanceof RealLink) {
        const carrierVelocity = KinematicsSolver.linkVelMap.get(carrier.id);
        const omega = need(KinematicsSolver.linkAngVelMap.get(carrier.id));
        relative = [
          relative[0] - (need(carrierVelocity?.[0]) - omega * (pin.y - carrier.CoM.y)),
          relative[1] - (need(carrierVelocity?.[1]) + omega * (pin.x - carrier.CoM.x)),
        ];
      }
      const rate =
        relative[0] * Math.cos(slider.slotAngle) + relative[1] * Math.sin(slider.slotAngle);
      terms.push(frame.inputEffort.valueSI * rate * units.distanceToM);
    }

    // What the loads and gravity feed in, through the moving material points.
    for (const link of mechanism.links[t]) {
      if (link instanceof RealLink) {
        const comVelocity = KinematicsSolver.linkVelMap.get(link.id);
        const omega = need(KinematicsSolver.linkAngVelMap.get(link.id));
        for (const force of link.forces) {
          const fx = force.mag * Math.cos(force.angleRad) * units.forceToN;
          const fy = force.mag * Math.sin(force.angleRad) * units.forceToN;
          const vx = need(comVelocity?.[0]) - omega * (force.startCoord.y - link.CoM.y);
          const vy = need(comVelocity?.[1]) + omega * (force.startCoord.x - link.CoM.x);
          terms.push((fx * vx + fy * vy) * units.distanceToM);
        }
        if (mechanism.gravity) {
          terms.push(
            -link.mass * units.massToKg * GRAVITY * need(comVelocity?.[1]) * units.distanceToM
          );
        }
      } else if (link instanceof SliderBlock && mechanism.gravity) {
        const pin = link.joints.find((joint) => !(joint instanceof PrisJoint));
        const velocity = pin && KinematicsSolver.jointVelMap.get(pin.id);
        terms.push(-link.mass * units.massToKg * GRAVITY * need(velocity?.[1]) * units.distanceToM);
      }
    }

    // What motion soaks up: the rate of change of kinetic energy.
    let kineticRate = 0;
    if (mode === 'dynamic') {
      for (const link of mechanism.links[t]) {
        if (link instanceof RealLink) {
          const velocity = KinematicsSolver.linkVelMap.get(link.id);
          const acceleration = KinematicsSolver.linkAccMap.get(link.id);
          kineticRate +=
            link.mass *
            units.massToKg *
            (need(velocity?.[0]) * need(acceleration?.[0]) +
              need(velocity?.[1]) * need(acceleration?.[1])) *
            units.distanceToM ** 2;
          kineticRate +=
            link.massMoI *
            units.inertiaToKgM2 *
            need(KinematicsSolver.linkAngVelMap.get(link.id)) *
            need(KinematicsSolver.linkAngAccMap.get(link.id));
        } else if (link instanceof SliderBlock) {
          const pin = link.joints.find((joint) => !(joint instanceof PrisJoint));
          const velocity = pin && KinematicsSolver.jointVelMap.get(pin.id);
          const acceleration = pin && KinematicsSolver.jointAccMap.get(pin.id);
          kineticRate +=
            link.mass *
            units.massToKg *
            (need(velocity?.[0]) * need(acceleration?.[0]) +
              need(velocity?.[1]) * need(acceleration?.[1])) *
            units.distanceToM ** 2;
        }
      }
    }

    if (!complete) continue;
    audited++;
    const supplied = terms.reduce((sum, term) => sum + term, 0);
    const scale = Math.max(1e-9, ...terms.map(Math.abs), Math.abs(kineticRate));
    worst = Math.max(worst, Math.abs(supplied - kineticRate) / scale);
  }
  return { audited, total: series.frames.length, worst };
}

describe('power balance across every topology class', () => {
  for (const { name, fixture } of AUDITS) {
    for (const mode of ['static', 'dynamic'] as ForceAnalysisMode[]) {
      it(`${name}: ${mode} analysis conserves power`, () => {
        const result = audit(fixture(), mode);
        expect(result.audited).toBeGreaterThan(result.total * 0.9);
        expect(result.worst).toBeLessThan(1e-6);
      });
    }
  }
});
