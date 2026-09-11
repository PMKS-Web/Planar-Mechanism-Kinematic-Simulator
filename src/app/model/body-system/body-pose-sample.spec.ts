import { nativeObliqueCylinder } from '../../../test-utils/verification/native-oblique-cylinder-fixture';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition } from './body-admission';
import { buildBodyCycle } from './body-cycle';
import { buildBodyMotionWindow } from './body-motion-window';
import { bodyCycleInputs } from './body-cycle-inputs';

describe('F2: publication separates continuation seeds from physical rates', () => {
  it('publishes no numerical predictor in regular or fold samples of cycles and finite windows', () => {
    const fixture = nativeObliqueCylinder(3.2),
      document = {
        ...fixture.document,
        drivers: [{ ...fixture.driver, profile: { ...fixture.driver.profile, speed: -0.2 } }],
      };
    const compiled = compileBodyDocument(document);
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const admitted = admitBodyPartition(compiled.system, compiled.system.partitions[0]);
    if (!admitted.ok) throw new Error(admitted.reason);
    for (const path of [
      buildBodyCycle(admitted, { commandStep: 0.08 }),
      buildBodyMotionWindow(admitted, { duration: 2, commandStep: 0.08 }),
    ]) {
      if (!path.ok) throw new Error(path.reason);
      expect(path.samples.some((sample) => sample.stop?.kind === 'fold')).toBe(true);
      for (const sample of path.samples) {
        expect(Object.keys(sample.state).sort()).toEqual(['command', 'poses', 'regular']);
        expect('tangent' in sample.state).toBe(false);
        expect(Object.isFrozen(sample.state)).toBe(true);
        expect('set' in sample.state.poses).toBe(false);
      }
      const inputs = bodyCycleInputs(admitted, path, 1);
      if (!inputs.ok) throw new Error(inputs.reason);
      for (const input of inputs.inputs.filter((input) => input.reversal))
        expect(input.rates).toEqual({ ok: false, reason: 'reversal' });
    }
  });
});
