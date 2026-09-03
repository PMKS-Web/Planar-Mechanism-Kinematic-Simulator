import { KinematicsSolver } from '../model/mechanism/kinematic-solver';
import { RealJoint } from '../model/joint';
import { MODEL_SCALE } from '../model/render-scale';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { buildMechanismFixture, MechanismFixture } from '../../tests/fixtures/mechanism-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { teachingLabFourBarFixture } from '../../test-utils/verification/fixtures';
import type { MechanismFixture as VerificationFixture } from '../../test-utils/verification/fixture';
import { AnalysisSampleService } from './analysis-sample.service';
import { SettingsService } from './settings.service';
import { withTestInjector } from '../../test-utils/mechanism-harness';

/** Standard gravity, the value the force solver works to. */
const GRAVITY = 9.80665;

/**
 * The four-bar this file solves its kinematics on, stated here rather than
 * opened from the template library.
 *
 * Everything below is a velocity or an acceleration, and both scale with the
 * speed the input is driven at — so read from a template these numbers moved
 * whenever somebody republished it at a pace that was nicer to watch. The
 * geometry is the classic four-bar's and the crank is pinned at 20 RPM *here*,
 * which is what makes the literals in this file stable.
 *
 * This encodes byte-for-byte to what the `4-Bar` template published while it
 * still ran at 20 RPM, so nothing about the numbers changed when it moved: the
 * mechanism is the same one, it is just no longer borrowed.
 */
const FOUR_BAR_RPM = 20;

const fourBar = (): VerificationFixture => ({
  joints: [
    { id: 'A', x: -3.129, y: -2.014, ground: true, input: true },
    { id: 'B', x: -2.622, y: 0.902 },
    { id: 'C', x: 3.009, y: 2.08 },
    { id: 'D', x: 3.341, y: -1.646, ground: true },
  ],
  // A gram and a gram-centimeter-squared apiece, which is what the app hands a
  // link nobody has typed a mass into. Written out because one test below is
  // about drawing a *small* force smoothly, and a gram is what makes it small.
  links: [
    { joints: 'AB', mass: 1, moi: 1 },
    { joints: 'BC', mass: 1, moi: 1 },
    { joints: 'CD', mass: 1, moi: 1 },
  ],
  // Clockwise, which is the app's default direction and the one the payload
  // below carries; the payload's speed comes from the `rpm` argument.
  inputAngVel: (-FOUR_BAR_RPM * Math.PI) / 30,
});

const FOUR_BAR = fixturePayload(fourBar(), undefined, { rpm: FOUR_BAR_RPM });

/**
 * A four-bar that is actually about force: the MATLAB-verified TeachingLab
 * linkage, whose link masses and inertias are measured off real hardware.
 *
 * The reaction assertions used to read the plain four-bar above, whose links
 * weigh a gram and carry nothing — its ground pins answered in hundredths of a
 * newton, and against a massless drawing the same assertions would have gone
 * on passing over [0, 0, 0].
 */
const LOADED_FOUR_BAR_RPM = 10;
const LOADED_FOUR_BAR = fixturePayload(teachingLabFourBarFixture(), undefined, {
  rpm: LOADED_FOUR_BAR_RPM,
});

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
      fixture = buildMechanismFixture(FOUR_BAR);
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

    it('plots a coupler by its center of mass and its own angle', () => {
      expect(sample(0, "Linear Link's CoM Pos", 'BC')).toEqual([0.194, 1.491]);
      expect(sample(0, 'Angular Link Pos', 'BC')).toEqual([11.816]);
      expect(sample(45, 'Angular Link Pos', 'BC')).toEqual([22.288]);
    });

    it('has nothing to say about a graph it does not draw', () => {
      expect(sample(0, 'ic', 'B')).toEqual([]);
      expect(sample(0, 'Linear Joint Bogus', 'B')).toEqual([]);
      expect(sample(9999, 'Linear Joint Pos', 'B')).toEqual([]);
    });
  });

  /**
   * The reactions, read off a mechanism whose links weigh something.
   *
   * Nothing below is a copied constant. Each assertion is either a definition —
   * a magnitude is the hypotenuse of its own two components — or a statement of
   * statics: an unloaded machine is held up by its ground pins and by nothing
   * else, so those pins carry its weight and no more. That is a claim a
   * massless drawing cannot satisfy, which is the point of moving these here.
   */
  describe('a four-bar whose links have mass', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(LOADED_FOUR_BAR);
      service = withTestInjector(
        [{ provide: SettingsService, useValue: fixture.settings }],
        () => new AnalysisSampleService()
      );
    });

    /** What the whole drawing weighs, in newtons. Masses are entered in grams. */
    const weightNewtons = () =>
      fixture.service.links.reduce((total, link) => total + link.mass, 0) * 1e-3 * GRAVITY;

    it('reports a joint reaction as x, y and the magnitude of the two', () => {
      const reaction = exactForce(0, 'static', 'Joint Forces', 'A');
      expect(reaction[2]).toBeCloseTo(Math.hypot(reaction[0], reaction[1]), 9);
      // Newtons rather than the float dust a massless drawing would answer with.
      expect(reaction[2]).toBeGreaterThan(1);

      // A and D are the only two things touching the ground and there is no
      // load, so between them they hold up exactly the weight of the linkage.
      const other = exactForce(0, 'static', 'Joint Forces', 'D');
      expect(weightNewtons()).toBeGreaterThan(0);
      expect(reaction[0] + other[0]).toBeCloseTo(0, 9);
      expect(reaction[1] + other[1]).toBeCloseTo(weightNewtons(), 9);

      // Inertia is the whole of the difference between the two modes, and these
      // are measured inertias turning at 10 RPM: they leave the weight far
      // behind. Told the same mechanism weighed nothing, the two modes would
      // agree and this could not pass.
      expect(exactForce(0, 'dynamic', 'Joint Forces', 'A')[2]).toBeGreaterThan(10 * reaction[2]);

      // One value, not three: an input effort is a single quantity.
      expect(force(0, 'static', 'Input Effort', 'A')).toHaveLength(1);
    });

    it('reads a reaction from the link asked for, and gaps where that link is absent', () => {
      // Only the crank meets A, so naming it changes nothing but the question.
      const viaCrank = force(0, 'static', 'Joint Forces', 'A', 'ABH');
      expect(viaCrank.every(Number.isFinite)).toBe(true);
      // A number, so that the agreement below is between two readings and not
      // between two absences.
      expect(viaCrank[2]).toBeGreaterThan(1);
      expect(viaCrank).toEqual(force(0, 'static', 'Joint Forces', 'A'));

      // C is nowhere near link ABH, so that row of the panel has no number to show.
      expect(force(0, 'static', 'Joint Forces', 'C', 'ABH').every(Number.isNaN)).toBe(true);
      expect(force(0, 'static', 'Joint Forces', 'C', 'ABH')).toHaveLength(3);
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
      buildMechanismFixture(FOUR_BAR);

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
   *
   * The mechanism is the plain four-bar above, and it is the right one here
   * precisely because a gram is a small force: the case this test is about is a
   * curve whose whole range a thousandth of a newton is a visible fraction of.
   * That is a property of the mechanism the spec states, not of any template.
   */
  describe('the precision a curve is drawn at', () => {
    beforeEach(() => {
      fixture = buildMechanismFixture(FOUR_BAR);
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

describe('AnalysisSampleService keeps each solve', () => {
  let fixture: MechanismFixture;
  let service: AnalysisSampleService;
  beforeEach(() => {
    fixture = buildMechanismFixture(FOUR_BAR);
    service = withTestInjector(
      [{ provide: SettingsService, useValue: fixture.settings }],
      () => new AnalysisSampleService()
    );
  });
  const ask = (index: number, prop: string, part: string) =>
    service.sampleAt(fixture.mechanism, index, 'kinematic', 'loop', prop, part);

  it('solves a sample once however many rows read it', () => {
    const solves = vi.spyOn(KinematicsSolver, 'determineKinematics');
    const velocity = ask(45, 'Linear Joint Vel', 'B');
    const acceleration = ask(45, 'Linear Joint Acc', 'B');
    const angular = ask(45, 'Angular Link Vel', 'BC');
    expect(solves).toHaveBeenCalledTimes(1);
    // And the kept answer is the solver's answer, not a stale one.
    const fresh = withTestInjector(
      [{ provide: SettingsService, useValue: fixture.settings }],
      () => new AnalysisSampleService()
    );
    expect(
      fresh.sampleAt(fixture.mechanism, 45, 'kinematic', 'loop', 'Linear Joint Acc', 'B')
    ).toEqual(acceleration);
    expect(
      fresh.sampleAt(fixture.mechanism, 45, 'kinematic', 'loop', 'Linear Joint Vel', 'B')
    ).toEqual(velocity);
    expect(
      fresh.sampleAt(fixture.mechanism, 45, 'kinematic', 'loop', 'Angular Link Vel', 'BC')
    ).toEqual(angular);
    solves.mockRestore();
  });

  it('solves again for another sample, and for another mechanism', () => {
    const solves = vi.spyOn(KinematicsSolver, 'determineKinematics');
    ask(45, 'Linear Joint Vel', 'B');
    ask(46, 'Linear Joint Vel', 'B');
    expect(solves).toHaveBeenCalledTimes(2);
    const another = buildMechanismFixture(FOUR_BAR);
    service.sampleAt(another.mechanism, 45, 'kinematic', 'loop', 'Linear Joint Vel', 'B');
    expect(solves).toHaveBeenCalledTimes(3);
    solves.mockRestore();
  });
});
