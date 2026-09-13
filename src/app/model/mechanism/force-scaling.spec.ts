import { RevJoint } from '../joint';
import { RealLink } from '../link';
import { MODEL_SCALE } from '../render-scale';
import { LengthUnit } from '../unit-enums';
import { createMechanismHarness, wireGraph } from '../../../test-utils/mechanism-harness';
import { KinematicsSolver } from './kinematic-solver';

describe('application force-analysis physical scaling', () => {
  it('requires 0.02 N for 1 kg at 0.02 m and 1 rad/s, including the drawing boundary', () => {
    const h = createMechanismHarness();
    h.settings.lengthUnit.next(LengthUnit.CM);
    h.settings.isGravity.next(false);
    const a = new RevJoint('A', 0, 0, true, true);
    const b = new RevJoint('B', 4 * MODEL_SCALE, 0);
    a.driveSpeed = 30 / Math.PI;
    const bar = new RealLink('AB', [a, b]);
    bar.mass = 1000; // Stored grams: exactly one physical kilogram.
    h.service.joints = [a, b];
    h.service.links = [bar];
    wireGraph(h.service);
    h.service.updateMechanism();
    const machine = h.service.mechanisms[0];
    machine.prepareSolvers();
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = machine.requiredLoops;
    KinematicsSolver.determineKinematics(machine.joints[0], machine.links[0], 1);
    expect(KinematicsSolver.linkAccMap.get('AB')![0]).toBeCloseTo(-2 * MODEL_SCALE, 10);
    expect(KinematicsSolver.linkAccMap.get('AB')![0] / MODEL_SCALE / 100).toBeCloseTo(-0.02, 12);
    const frame = machine.getForceAnalysis('dynamic').frames[0];
    expect(frame.status).toBe('ok');
    expect(frame.jointReactions.get('A')![0]).toBeCloseTo(-0.02, 10);
  });
});
