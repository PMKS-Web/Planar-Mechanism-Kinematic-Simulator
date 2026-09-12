import { PrisJoint, RealJoint } from '../joint';
import { RealLink } from '../link';
import { frictionless } from '../joint-friction';
import { ForceSolver } from './force-solver';
import { FrictionMotion } from './friction-analysis';
import { KinematicsSolver } from './kinematic-solver';
import { loadedInvertedSliderCrankFixture } from '../../../test-utils/verification/slot-fixtures';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import {
  frictionBearingFixture,
  frictionSliderCrankFixture,
} from '../../../test-utils/verification/friction-fixtures';

function slider() {
  return buildMechanism(frictionSliderCrankFixture());
}
function motion(direction = 1): FrictionMotion {
  return {
    jointVelocities: new Map([['D', [(-8 / 3) * direction, 0]]]),
    angularVelocities: new Map([
      ['AB', direction],
      ['BC', -direction / 3],
    ]),
  };
}

describe('coupled Coulomb friction', () => {
  it('uses carrier-relative sliding velocity and applies opposite loads to a floating guide', () => {
    const built = buildMechanism(loadedInvertedSliderCrankFixture());
    const guide = built.joints.find((joint) => joint instanceof PrisJoint) as PrisJoint;
    guide.friction = { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0 };
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
    KinematicsSolver.determineKinematics(built.joints, built.links, 1);
    const rates: FrictionMotion = {
      jointVelocities: new Map(KinematicsSolver.jointVelMap),
      angularVelocities: new Map(KinematicsSolver.linkAngVelMap),
    };
    const solve = (motion: FrictionMotion) =>
      ForceSolver.analyzeFrame(
        built.joints,
        built.links,
        'static',
        false,
        'm',
        0,
        undefined,
        false,
        motion
      );
    const first = solve(rates);
    expect(first.status).toBe('ok');
    const translated = {
      ...rates,
      jointVelocities: new Map(
        [...rates.jointVelocities].map(([id, v]) => [
          id,
          [v[0] + 1000, v[1] - 500] as [number, number],
        ])
      ),
    };
    const second = solve(translated);
    expect(second.status).toBe('ok');
    expect(second.friction!.get(guide.id)!.effort).toBeCloseTo(
      first.friction!.get(guide.id)!.effort,
      8
    );
    const reactions = [...first.jointReactionsByLink.get(guide.id)!.values()];
    expect(reactions).toHaveLength(2);
    expect(reactions[0][0] + reactions[1][0]).toBeCloseTo(0, 8);
    expect(reactions[0][1] + reactions[1][1]).toBeCloseTo(0, 8);
  });

  it('keeps the bearing torque invariant under a change of length units', () => {
    const built = buildMechanism(frictionBearingFixture());
    const before = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion()
    );
    built.joints.forEach((joint) => {
      joint.x *= 100;
      joint.y *= 100;
      (joint as RealJoint).friction.radius *= 100;
    });
    built.links.forEach((link) => {
      if (link instanceof RealLink) {
        link.CoM.x *= 100;
        link.CoM.y *= 100;
      }
    });
    const after = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'cm',
      0,
      undefined,
      false,
      motion()
    );
    expect(after.inputEffort!.valueSI).toBeCloseTo(before.inputEffort!.valueSI, 10);
  });

  it('refuses nonconvergent friction instead of returning the frictionless answer', () => {
    const built = slider();
    (built.joints.find((joint) => joint instanceof PrisJoint) as RealJoint).friction = {
      staticCoefficient: 4,
      kineticCoefficient: 4,
      radius: 0,
    };
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion(-1)
    );
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.message).toContain('did not converge');
    expect(frame.inputEffort).toBeUndefined();
  });

  it('refuses a pin bearing attached to a free-turning block', () => {
    const built = slider();
    (built.joints.find((joint) => joint.id === 'C') as RealJoint).friction = {
      staticCoefficient: 0.2,
      kineticCoefficient: 0.1,
      radius: 0.1,
    };
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion()
    );
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.message).toContain('simple bearing');
  });
  it('solves the guide normal load together with friction and required crank torque', () => {
    const built = slider();
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion()
    );
    expect(frame.status).toBe('ok');
    // Moment balance of the connecting rod gives N = 100 - Ff/3; Ff = 0.2*N.
    const contact = frame.friction!.get('D')!;
    expect(contact.normalLoad).toBeCloseTo(93.75, 7);
    expect(contact.effort).toBeCloseTo(18.75, 7);
    expect(contact.staticLimit).toBeCloseTo(28.125, 7);
    expect(frame.inputEffort!.valueSI).toBeCloseTo(50, 7);
    expect(frame.jointReactions.get('D')![0]).toBeCloseTo(18.75, 7);
    expect(frame.jointReactions.get('D')![1]).toBeCloseTo(93.75, 7);
    expect(contact.effort * contact.relativeRate).toBeLessThan(0);
    expect(frame.residual).toBeLessThan(1e-8);
  });

  it('reverses friction and resolves the changed normal load when motion reverses', () => {
    const built = slider();
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion(-1)
    );
    const contact = frame.friction!.get('D')!;
    expect(contact.normalLoad).toBeCloseTo(100 / (1 - 0.2 / 3), 7);
    expect(contact.effort).toBeCloseTo(-0.2 * contact.normalLoad, 7);
    expect(contact.effort * contact.relativeRate).toBeLessThan(0);
  });

  it('produces the known effective-radius bearing torque, including its static limit', () => {
    const built = buildMechanism(frictionBearingFixture());
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion()
    );
    expect(frame.status).toBe('ok');
    expect(frame.inputEffort!.valueSI).toBeCloseTo(10, 10);
    expect(frame.friction!.get('A')!.effort).toBeCloseTo(-10, 10);
    expect(frame.friction!.get('A')!.staticLimit).toBeCloseTo(15, 10);
  });

  it('balances each rigid body with a frictional floating pin and guide', () => {
    const built = slider();
    (built.joints.find((joint) => joint.id === 'B') as RealJoint).friction = {
      staticCoefficient: 0.2,
      kineticCoefficient: 0.1,
      radius: 0.1,
    };
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion()
    );
    expect(frame.status).toBe('ok');
    for (const body of built.links.filter((one): one is RealLink => one instanceof RealLink)) {
      let fx = 0,
        fy = 0,
        moment = 0;
      for (const joint of body.joints) {
        const force = frame.jointReactionsByLink.get(joint.id)?.get(body.id) ?? [0, 0];
        fx += force[0];
        fy += force[1];
        moment += (joint.x - body.CoM.x) * force[1] - (joint.y - body.CoM.y) * force[0];
        const contact = frame.friction?.get(joint.id);
        if (contact?.kind === 'torque')
          moment += contact.effort * (contact.positiveBodyId === body.id ? 1 : -1);
      }
      for (const force of body.forces) {
        const x = force.mag * Math.cos(force.angleRad),
          y = force.mag * Math.sin(force.angleRad);
        fx += x;
        fy += y;
        moment += (force.startCoord.x - body.CoM.x) * y - (force.startCoord.y - body.CoM.y) * x;
      }
      if (body.id === 'AB') moment += frame.inputEffort!.valueSI;
      expect(fx).toBeCloseTo(0, 7);
      expect(fy).toBeCloseTo(0, 7);
      expect(moment).toBeCloseTo(0, 7);
    }
  });

  it('keeps zero-friction results on the original solver path without velocity data', () => {
    const built = slider();
    (built.joints.find((joint) => joint instanceof PrisJoint) as RealJoint).friction =
      frictionless();
    const frame = ForceSolver.analyzeFrame(built.joints, built.links, 'static', false, 'm');
    expect(frame.status).toBe('ok');
    expect(frame.inputEffort!.valueSI).toBeCloseTo(0, 8);
    expect(frame.jointReactions.get('D')![1]).toBeCloseTo(100, 8);
    expect(frame.friction).toBeUndefined();
  });

  it('reports a resting contact as indeterminate instead of inventing a holding force', () => {
    const built = slider();
    const frame = ForceSolver.analyzeFrame(
      built.joints,
      built.links,
      'static',
      false,
      'm',
      0,
      undefined,
      false,
      motion(0)
    );
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.message).toContain('Static friction is a range');
    expect(frame.inputEffort).toBeUndefined();
    expect(frame.jointReactions.size).toBe(0);
  });

  it('preserves friction in sampled poses and uses velocity in both force modes', () => {
    const built = slider();
    for (const mode of ['static', 'dynamic'] as const) {
      const series = built.mechanism.getForceAnalysis(mode);
      expect(series.successfulFrames).toBeGreaterThan(300);
      for (const frame of series.frames.filter((one) => one.status === 'ok')) {
        const contact = frame.friction!.get('D')!;
        expect(contact.effort * contact.relativeRate).toBeLessThanOrEqual(0);
        expect(Math.abs(contact.effort)).toBeCloseTo(0.2 * contact.normalLoad, 7);
      }
    }
  });
});
