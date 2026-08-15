import { RealJoint } from '../model/joint';
import { MODEL_SCALE } from '../model/render-scale';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { buildMechanismFixture, MechanismFixture } from '../../tests/fixtures/mechanism-fixtures';
import { AnalysisSampleService } from './analysis-sample.service';
import { SettingsService } from './settings.service';
import { withTestInjector } from '../../test-utils/mechanism-harness';

/**
 * The numbers here are the ones the graphs plotted before this arithmetic moved
 * out of the graph component, so they pin the extraction. Where a value can be
 * derived from the mechanism instead of copied from it — a crank pin's speed is
 * ωr, its acceleration ω²r toward the pivot, a link's angle an arctangent of its
 * own two ends — it is checked both ways, because a literal alone only says the
 * code still does what it did.
 *
 * The literals are written to three decimals and the service now answers at the
 * precision it solved at, so the two helpers below round to compare. That is a
 * question about the reading rather than about the arithmetic: the digits below
 * the third are what stopped a small force from climbing the graph in stairs,
 * and there is a test at the foot of this file that they are still there.
 */
const readAt = (values: number[], places = 3) =>
  values.map((value) => (Number.isFinite(value) ? Number(value.toFixed(places)) + 0 : value));
describe('AnalysisSampleService', () => {
  let fixture: MechanismFixture;
  let service: AnalysisSampleService;

  const exactly = (index: number, prop: string, part: string, reactionLinkId?: string) =>
    service.sampleAt(
      fixture.mechanism,
      index,
      'kinematic',
      'loop',
      prop,
      part,
      reactionLinkId ?? ''
    );

  const sample = (index: number, prop: string, part: string, reactionLinkId?: string) =>
    readAt(exactly(index, prop, part, reactionLinkId));

  const exactForce = (index: number, mode: string, prop: string, part: string, link = '') =>
    service.sampleAt(fixture.mechanism, index, 'force', mode, prop, part, link);

  const force = (index: number, mode: string, prop: string, part: string, link = '') =>
    readAt(exactForce(index, mode, prop, part, link));

  describe('a four-bar driven at its crank', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
      service = withTestInjector(
        [{ provide: SettingsService, useValue: fixture.settings }],
        () => new AnalysisSampleService()
      );
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
      service = withTestInjector(
        [{ provide: SettingsService, useValue: fixture.settings }],
        () => new AnalysisSampleService()
      );
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

    /**
     * A drawing holds as many machines as are drawn, and every one of them is
     * solved over the top of the last: the solvers keep their working state in
     * statics. Positions survive that, because they were computed while the
     * state was still this machine's — but rates are worked out later, when a
     * graph is opened, and a cylinder drive needs the constraint set to
     * differentiate. Asked for after a second machine had been built, this one
     * was differentiated against the *other* machine's constraints and every
     * velocity and acceleration it plotted came back NaN.
     */
    it('still has rates once another machine has been solved after it', () => {
      const boom = fixture;
      // A second machine, built over the top of the first as the service does.
      buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);

      const velocity = service.sampleAt(
        boom.mechanism,
        45,
        'kinematic',
        'loop',
        'Linear Joint Vel',
        'C',
        ''
      );
      expect(velocity).toHaveLength(3);
      expect(velocity.every(Number.isFinite)).toBe(true);
      // And the same numbers it gives when it is the only machine there.
      expect(readAt(velocity)).toEqual(sample(45, 'Linear Joint Vel', 'C'));
    });
  });

  /**
   * The digits below the third are what a graph draws with.
   *
   * A four-bar's joint reactions run to a few hundredths of a newton, so
   * rounding them to a thousandth left about fifty distinct heights across the
   * cycle and the curve climbed them in steps two per cent of its own range.
   */
  describe('the precision a curve is drawn at', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
      service = withTestInjector(
        [{ provide: SettingsService, useValue: fixture.settings }],
        () => new AnalysisSampleService()
      );
    });

    it('keeps a small force smooth rather than stepping it', () => {
      const along = fixture.mechanism.joints.map(
        (_, index) => exactForce(index, 'static', 'Joint Forces', 'A')[0]
      );
      const solved = along.filter(Number.isFinite);
      expect(solved.length).toBeGreaterThan(100);

      const span = Math.max(...solved) - Math.min(...solved);
      expect(span).toBeGreaterThan(0);
      // Small enough that a thousandth of a newton is a visible fraction of it,
      // which is the case this is about.
      expect(span).toBeLessThan(1);

      // Nearly every sample is its own value. Rounded to a thousandth these
      // collapsed onto about fifty, and the curve inherited the staircase.
      const distinct = new Set(solved.map((value) => value.toFixed(9))).size;
      expect(distinct).toBeGreaterThan(solved.length * 0.9);
      expect(new Set(solved.map((value) => value.toFixed(3))).size).toBeLessThan(distinct / 2);
    });
  });
});
