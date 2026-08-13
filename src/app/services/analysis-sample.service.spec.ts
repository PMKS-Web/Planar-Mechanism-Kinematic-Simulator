import { RealJoint } from '../model/joint';
import { MODEL_SCALE } from '../model/render-scale';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { buildMechanismFixture, MechanismFixture } from '../../tests/fixtures/mechanism-fixtures';
import { AnalysisSampleService } from './analysis-sample.service';

/**
 * The numbers here are the ones the graphs plotted before this arithmetic moved
 * out of the graph component, so they pin the extraction. Where a value can be
 * derived from the mechanism instead of copied from it — a crank pin's speed is
 * ωr, its acceleration ω²r toward the pivot, a link's angle an arctangent of its
 * own two ends — it is checked both ways, because a literal alone only says the
 * code still does what it did.
 */
describe('AnalysisSampleService', () => {
  let fixture: MechanismFixture;
  let service: AnalysisSampleService;

  const sample = (index: number, prop: string, part: string, reactionLinkId?: string) =>
    service.sampleAt(
      fixture.mechanism,
      index,
      'kinematic',
      'loop',
      prop,
      part,
      reactionLinkId ?? ''
    );

  const force = (index: number, mode: string, prop: string, part: string, link = '') =>
    service.sampleAt(fixture.mechanism, index, 'force', mode, prop, part, link);

  describe('a four-bar driven at its crank', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
      service = new AnalysisSampleService(fixture.settings);
    });

    /** The crank A→B at the pose given, in internal model units. */
    const crank = (index: number): [number, number] => {
      const at = (id: string) => fixture.mechanism.joints[index].find((joint) => joint.id === id)!;
      return [at('B').x - at('A').x, at('B').y - at('A').y];
    };

    it('plots a joint position as its solved coordinates in the user unit', () => {
      expect(sample(0, 'Linear Joint Pos', 'B')).toEqual([-2.622, 0.902]);
      expect(sample(45, 'Linear Joint Pos', 'B')).toEqual([-0.709, -0.311]);

      // The same numbers the drawing is built from, divided back down.
      const joint = fixture.mechanism.joints[45].find((candidate) => candidate.id === 'B')!;
      expect(sample(45, 'Linear Joint Pos', 'B')).toEqual([
        Number((joint.x / MODEL_SCALE).toFixed(3)),
        Number((joint.y / MODEL_SCALE).toFixed(3)),
      ]);
    });

    it('leaves a grounded joint standing still', () => {
      const grounded = fixture.mechanism.joints[0].find(
        (joint): joint is RealJoint => joint instanceof RealJoint && joint.ground
      )!;
      expect(sample(0, 'Linear Joint Pos', grounded.id)).toEqual([-3.129, -2.014]);
      expect(sample(0, 'Linear Joint Vel', grounded.id)).toEqual([0, 0, 0]);
      expect(sample(0, 'Linear Joint Acc', grounded.id)).toEqual([0, 0, 0]);
    });

    it('plots the crank pin speed as ωr, across the crank rather than along it', () => {
      const velocity = sample(0, 'Linear Joint Vel', 'B');
      expect(velocity).toEqual([6.107, -1.062, 6.199]);

      const omega = Math.abs(fixture.mechanism.inputAngularVelocities[0]);
      const [dx, dy] = crank(0);
      const radius = Math.hypot(dx, dy) / MODEL_SCALE;
      expect(velocity[2]).toBeCloseTo(omega * radius, 3);
      // A pin on a rigid crank moves perpendicular to it.
      const along = (velocity[0] * dx + velocity[1] * dy) / (velocity[2] * Math.hypot(dx, dy));
      expect(Math.abs(along)).toBeLessThan(1e-3);
    });

    it('plots the crank pin acceleration as ω²r pointing at the pivot', () => {
      const acceleration = sample(0, 'Linear Joint Acc', 'B');
      expect(acceleration).toEqual([-2.224, -12.791, 12.983]);

      const omega = Math.abs(fixture.mechanism.inputAngularVelocities[0]);
      const [dx, dy] = crank(0);
      const length = Math.hypot(dx, dy);
      const radius = length / MODEL_SCALE;
      expect(acceleration[2]).toBeCloseTo(omega * omega * radius, 3);
      // Centripetal: back down the crank, towards the ground pivot.
      expect(acceleration[0]).toBeCloseTo((-dx / length) * acceleration[2], 2);
      expect(acceleration[1]).toBeCloseTo((-dy / length) * acceleration[2], 2);
    });

    it('plots a link angle in degrees, and turns it one degree per sample', () => {
      expect(sample(0, 'Angular Link Pos', 'AB')).toEqual([80.137]);
      expect(sample(1, 'Angular Link Pos', 'AB')).toEqual([79.137]);
      expect(sample(45, 'Angular Link Pos', 'AB')).toEqual([35.137]);

      const [dx, dy] = crank(45);
      expect(sample(45, 'Angular Link Pos', 'AB')[0]).toBeCloseTo(
        (Math.atan2(dy, dx) * 180) / Math.PI,
        3
      );
      // 360 samples of one revolution, driven clockwise.
      expect(sample(0, 'Angular Link Vel', 'AB')).toEqual([-2.094]);
    });

    it('plots a coupler by its centre of mass and its own angle', () => {
      expect(sample(0, "Linear Link's CoM Pos", 'BC')).toEqual([0.194, 1.491]);
      expect(sample(0, 'Angular Link Pos', 'BC')).toEqual([11.816]);
      expect(sample(45, 'Angular Link Pos', 'BC')).toEqual([22.288]);
    });

    it('reports a joint reaction as x, y and the magnitude of the two', () => {
      const reaction = force(0, 'static', 'Joint Forces', 'A');
      expect(reaction).toEqual([0.001, 0.015, 0.015]);
      expect(reaction[2]).toBeCloseTo(Math.hypot(reaction[0], reaction[1]), 3);
      expect(force(0, 'dynamic', 'Joint Forces', 'A')).toEqual([-0.01, -0.01, 0.014]);
      // One value, not three: an input effort is a single quantity.
      expect(force(0, 'static', 'Input Effort', 'A')).toHaveLength(1);
    });

    it('reads a reaction from the link asked for, and gaps where that link is absent', () => {
      expect(force(0, 'static', 'Joint Forces', 'A', 'AB')).toEqual([0.001, 0.015, 0.015]);
      // C is nowhere near link AB, so that row of the panel has no number to show.
      expect(force(0, 'static', 'Joint Forces', 'C', 'AB').every(Number.isNaN)).toBe(true);
      expect(force(0, 'static', 'Joint Forces', 'C', 'AB')).toHaveLength(3);
    });

    it('has nothing to say about a graph it does not draw', () => {
      expect(sample(0, 'ic', 'B')).toEqual([]);
      expect(sample(0, 'Linear Joint Bogus', 'B')).toEqual([]);
      expect(sample(9999, 'Linear Joint Pos', 'B')).toEqual([]);
    });
  });

  describe('a cylinder-driven boom', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(TEMPLATE_LINKAGES['Cylinder_Boom']);
      service = new AnalysisSampleService(fixture.settings);
    });

    it('plots the boom rising, and the piston angle as a gap rather than a number', () => {
      expect(sample(0, 'Linear Joint Pos', 'C')).toEqual([0, 4]);
      expect(sample(45, 'Linear Joint Pos', 'C')).toEqual([1.061, 3.857]);
      expect(sample(0, 'Angular Link Pos', 'OC')).toEqual([90]);
      expect(sample(45, 'Angular Link Pos', 'OC')).toEqual([74.623]);

      // A sealed cylinder's own body has no solved angle; the graph draws a gap
      // at that timestep rather than dropping the sample and shifting the rest.
      const piston = sample(0, 'Angular Link Pos', 'PS');
      expect(piston).toHaveLength(1);
      expect(Number.isNaN(piston[0])).toBe(true);
    });
  });
});
