import { RealLink } from '../link';
import { buildMechanism, MechanismFixture } from '../../../test-utils/verification/fixture';
import {
  offsetLoadFourBarFixture,
  punchPressFixture,
} from '../../../test-utils/verification/force-fixtures';
import { wattIFixture, stephensonIiiEx2Fixture } from '../../../test-utils/verification/fixtures';
import { Mechanism } from './mechanism';
import { siUnitFactors } from '../unit-conversions';
import { MODEL_SCALE } from '../render-scale';
import { KinematicsSolver } from './kinematic-solver';
import { scotchYokeFixture } from '../../../test-utils/verification/slot-fixtures';

/** Encode a physical-meter fixture as application geometry without changing its physical body. */
function drawing(fixture: MechanismFixture, unit: string): Mechanism {
  const built = buildMechanism(fixture);
  const units = siUnitFactors(unit);
  const coordinate = MODEL_SCALE / units.distanceToM;
  for (const joint of built.joints) {
    joint.x *= coordinate;
    joint.y *= coordinate;
  }
  for (const link of built.links) {
    link.mass /= units.massToKg;
    if (link instanceof RealLink) {
      link.massMoI /= units.inertiaToKgM2;
      link.CoM.x *= coordinate;
      link.CoM.y *= coordinate;
    }
  }
  for (const force of built.forces) {
    force.startCoord.x *= coordinate;
    force.startCoord.y *= coordinate;
    force.endCoord.x *= coordinate;
    force.endCoord.y *= coordinate;
    force.mag /= units.forceToN;
  }
  const model = new Mechanism(
    built.joints,
    built.links,
    built.forces,
    [],
    fixture.gravity ?? false,
    unit,
    fixture.inputAngVel,
    'degree',
    undefined,
    MODEL_SCALE
  );
  // Preserve the same sampled physical poses. Independent position solves round
  // to four coordinate decimals; at scale 1 and scale 200 those are different
  // physical tolerances. This comparison isolates the force/kinematic unit boundary.
  const physical = built.mechanism;
  for (let i = 0; i < model.joints.length; i++) {
    for (const joint of model.joints[i]) {
      const source = physical.joints[i].find((one) => one.id === joint.id)!;
      joint.x = source.x * coordinate;
      joint.y = source.y * coordinate;
    }
    for (const link of model.links[i]) {
      const source = physical.links[i].find((one) => one.id === link.id)!;
      if (link instanceof RealLink && source instanceof RealLink) {
        link.CoM.x = source.CoM.x * coordinate;
        link.CoM.y = source.CoM.y * coordinate;
      }
    }
    for (const force of model.forces[i]) {
      const source = physical.forces[i].find((one) => one.id === force.id)!;
      force.startCoord.x = source.startCoord.x * coordinate;
      force.startCoord.y = source.startCoord.y * coordinate;
      force.endCoord.x = source.endCoord.x * coordinate;
      force.endCoord.y = source.endCoord.y * coordinate;
    }
  }
  return model;
}

const studies = [
  { name: 'Scotch yoke with welded guide couples', make: scotchYokeFixture },
  { name: 'four-bar with an offset force', make: offsetLoadFourBarFixture },
  { name: 'slider-crank with block mass and applied load', make: punchPressFixture },
  { name: 'Watt I with gravity', make: () => wattIFixture(true) },
  { name: 'Stephenson III with gravity', make: () => stephensonIiiEx2Fixture(true) },
];

describe('physical force cycles survive the application geometry boundary', () => {
  for (const { name, make } of studies) {
    for (const unit of ['m', 'cm', 'in']) {
      it(`${name}, ${unit}: preserves physical geometry, static equilibrium and dynamics`, () => {
        const reference = buildMechanism(make()).mechanism;
        const scaled = drawing(make(), unit);
        const meters = siUnitFactors(unit).distanceToM / MODEL_SCALE;
        expect(scaled.isMechanismValid()).toBe(true);
        expect(scaled.joints.length).toBe(reference.joints.length);
        for (const mode of ['static', 'dynamic'] as const) {
          const physical = reference.getForceAnalysis(mode);
          const internal = scaled.getForceAnalysis(mode);
          let checked = 0;
          let nonzeroGuideCouple = false;
          for (let i = 0; i < physical.frames.length; i += 30) {
            const before = physical.frames[i],
              after = internal.frames[i];
            expect(after.status, `${mode} frame ${i}`).toBe(before.status);
            for (const joint of scaled.joints[i]) {
              const original = reference.joints[i].find((one) => one.id === joint.id)!;
              expect(joint.x * meters).toBeCloseTo(original.x, 6);
              expect(joint.y * meters).toBeCloseTo(original.y, 6);
            }
            if (before.status !== 'ok') continue;
            checked++;
            expect(after.inputEffort!.valueSI).toBeCloseTo(before.inputEffort!.valueSI, 5);
            for (const [joint, reaction] of before.jointReactions) {
              expect(after.jointReactions.get(joint)![0]).toBeCloseTo(reaction[0], 5);
              expect(after.jointReactions.get(joint)![1]).toBeCloseTo(reaction[1], 5);
            }
            for (const [guide, couple] of before.guideCouples) {
              expect(after.guideCouples.get(guide)).toBeCloseTo(couple, 5);
              nonzeroGuideCouple ||= Math.abs(couple) > 1e-8;
            }
          }
          expect(checked).toBeGreaterThan(0);
          if (name.startsWith('Scotch') && mode === 'dynamic')
            expect(nonzeroGuideCouple).toBe(true);
        }
      });
    }
  }
  it('satisfies physical power balance through the scaled four-bar cycle', () => {
    const mechanism = drawing(offsetLoadFourBarFixture(), 'cm');
    const units = siUnitFactors('cm');
    const meters = units.distanceToM / MODEL_SCALE;
    const series = mechanism.getForceAnalysis('dynamic');
    let checked = 0;
    for (let i = 0; i < series.frames.length; i += 15) {
      const frame = series.frames[i];
      if (frame.status !== 'ok') continue;
      KinematicsSolver.resetVariables();
      mechanism.prepareSolvers();
      KinematicsSolver.determineKinematics(
        mechanism.joints[i],
        mechanism.links[i],
        mechanism.inputAngularVelocities[i]
      );
      let supplied = frame.inputEffort!.valueSI * mechanism.inputAngularVelocities[i];
      let kinetic = 0;
      for (const body of mechanism.links[i]) {
        if (!(body instanceof RealLink)) continue;
        const v = KinematicsSolver.linkVelMap.get(body.id)!;
        const a = KinematicsSolver.linkAccMap.get(body.id)!;
        const omega = KinematicsSolver.linkAngVelMap.get(body.id)!;
        const alpha = KinematicsSolver.linkAngAccMap.get(body.id)!;
        kinetic +=
          body.mass * units.massToKg * (v[0] * a[0] + v[1] * a[1]) * meters ** 2 +
          body.massMoI * units.inertiaToKgM2 * omega * alpha;
        if (mechanism.gravity) supplied -= body.mass * units.massToKg * 9.80665 * v[1] * meters;
        for (const force of body.forces) {
          const vx = v[0] - omega * (force.startCoord.y - body.CoM.y);
          const vy = v[1] + omega * (force.startCoord.x - body.CoM.x);
          supplied +=
            force.mag *
            units.forceToN *
            meters *
            (Math.cos(force.angleRad) * vx + Math.sin(force.angleRad) * vy);
        }
      }
      expect(
        Math.abs(supplied - kinetic) / Math.max(1, Math.abs(supplied), Math.abs(kinetic))
      ).toBeLessThan(1e-8);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
  it('keeps a massless application mechanism identical in static and dynamic modes', () => {
    const fixture = offsetLoadFourBarFixture();
    fixture.links.forEach((body) => {
      body.mass = 0;
      body.moi = 0;
    });
    const mechanism = drawing(fixture, 'cm');
    const statics = mechanism.getForceAnalysis('static');
    const dynamics = mechanism.getForceAnalysis('dynamic');
    for (let i = 0; i < statics.frames.length; i++) {
      expect(dynamics.frames[i].jointReactions).toEqual(statics.frames[i].jointReactions);
      expect(dynamics.frames[i].inputEffort).toEqual(statics.frames[i].inputEffort);
    }
  });
});
