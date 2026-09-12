import { PrisJoint, RevJoint } from './joint';
import { frictionGlyph } from './friction-visualization';
import { FrictionResult } from './mechanism/friction-analysis';

const contact = (effort: number, kind: 'force' | 'torque' = 'force'): FrictionResult => ({
  jointId: 'P',
  kind,
  positiveBodyId: 'BP',
  normalLoad: 100,
  staticLimit: 30,
  relativeRate: -Math.sign(effort),
  effort,
});
describe('friction drawing geometry in model coordinates', () => {
  for (const angle of [0, Math.PI / 6, Math.PI / 2]) {
    it(`shows the signed force along a guide at ${angle} radians and reverses with motion`, () => {
      const joint = new PrisJoint('P', 1, 2);
      joint.angle_rad = angle;
      const forward = frictionGlyph(joint, contact(-20), 100, 40)!;
      const reverse = frictionGlyph(joint, contact(20), 100, 40)!;
      expect(forward.fx).toBeCloseTo(-20 * Math.cos(angle), 12);
      expect(forward.fy).toBeCloseTo(-20 * Math.sin(angle), 12);
      expect(reverse.fx).toBeCloseTo(-forward.fx, 12);
      expect(reverse.fy).toBeCloseTo(-forward.fy, 12);
      expect(forward.fx * Math.cos(angle) + forward.fy * Math.sin(angle)).toBeLessThan(0);
    });
  }
  it('uses the same cycle scale for changes in force magnitude', () => {
    const joint = new PrisJoint('P', 0, 0);
    const half = frictionGlyph(joint, contact(10), 100, 20)!;
    const full = frictionGlyph(joint, contact(20), 100, 20)!;
    expect(full.label.x).toBeCloseTo(2 * half.label.x, 12);
  });
  it('uses an oppositely directed moment instead of a linear force for a bearing', () => {
    const joint = new RevJoint('A', 0, 0);
    const cw = frictionGlyph(joint, contact(-10, 'torque'), 100, 10)!;
    const ccw = frictionGlyph(joint, contact(10, 'torque'), 100, 10)!;
    expect(cw.sweep).toBeLessThan(0);
    expect(ccw.sweep).toBe(-cw.sweep);
    expect(cw.d).toContain('A 2 2');
    expect(cw.fx).toBe(0);
    expect(cw.fy).toBe(0);
  });
  it('keeps bearing radius at two percent of span while magnitude changes only the sweep', () => {
    const joint = new RevJoint('A', 0, 0);
    const half = frictionGlyph(joint, contact(5, 'torque'), 100, 10)!;
    const full = frictionGlyph(joint, contact(10, 'torque'), 100, 10)!;
    expect(half.label).toEqual(full.label);
    expect(full.label.y).toBe(2);
    expect(full.sweep).toBeCloseTo(1.25 * Math.PI, 12);
    expect(half.sweep).toBeCloseTo(full.sweep / 2, 12);
    expect(frictionGlyph(joint, contact(10, 'torque'), 50, 10)!.label.y).toBe(1);
  });
  for (const effort of [0, NaN, Infinity]) {
    it(`does not draw an invented arrow for ${effort}`, () => {
      expect(frictionGlyph(new PrisJoint('P', 0, 0), contact(effort), 100, 20)).toBeUndefined();
    });
  }
});
