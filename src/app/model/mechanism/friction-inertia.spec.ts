import { RevJoint } from '../joint';
import { RealLink } from '../link';
import { Coord } from '../coord';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { ForceSolver } from './force-solver';

function barAtScale(scale: number, enabled: boolean) {
  new SettingsService();
  new ColorService();
  const a = new RevJoint('A', 0, 0, true, true),
    b = new RevJoint('B', 4 * scale, 0);
  const bar = new RealLink('AB', [a, b]);
  bar.mass = 1000;
  bar.massMoI = 0;
  bar.CoM = new Coord(2 * scale, 0);
  a.links = [bar];
  b.links = [bar];
  if (enabled)
    a.friction = { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0.5 * scale };
  return ForceSolver.analyzeFrame(
    [a, b],
    [bar],
    'dynamic',
    false,
    'cm',
    0,
    {
      linkAccelerations: new Map([['AB', [-2 * scale, 0]]]),
      linkAngularAccelerations: new Map([['AB', 0]]),
      pistonAccelerations: new Map(),
    },
    false,
    { coordinateScale: scale, jointVelocities: new Map(), angularVelocities: new Map([['AB', 1]]) }
  );
}
describe('friction and the inherited drawing-scale inertia limitation', () => {
  it('preserves the staging frictionless answer, including its known scale discrepancy', () => {
    // Reproduced against acba1b77: physical 1 kg at 2 cm, 1 rad/s needs 0.02 N,
    // whereas staging evaluates its 400 internal cm/s^2 acceleration as 4 N.
    expect(Math.abs(barAtScale(200, false).jointReactions.get('A')![0])).toBeCloseTo(4, 12);
  });
  it('refuses drawing-scale friction results dependent on that uncorrected inertia', () => {
    const frame = barAtScale(200, true);
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.message).toContain('Use Static analysis');
    expect(frame.jointReactions.size).toBe(0);
    expect(frame.inputEffort).toBeUndefined();
    expect(frame.friction).toBeUndefined();
  });
  it('solves a physical unscaled inertial bearing load and torque correctly', () => {
    const frame = barAtScale(1, true);
    expect(frame.status).toBe('ok');
    expect(frame.friction!.get('A')!.normalLoad).toBeCloseTo(0.02, 12);
    expect(frame.friction!.get('A')!.effort).toBeCloseTo(-0.00002, 12);
    expect(frame.inputEffort!.valueSI).toBeCloseTo(0.00002, 12);
  });
});
