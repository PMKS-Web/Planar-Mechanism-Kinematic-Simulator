import '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';
import {
  redundantParallelCrankFixture,
  teachingLabFourBarFixture,
  teachingLabSliderCrankFixture,
} from '../../test-utils/verification/fixtures';

/**
 * Gruebler's paradox, and the second question that keeps the cure honest.
 *
 * Counting bodies and joints answers "can this move" correctly almost always,
 * and wrongly in one direction: it charges twice for constraints that say the
 * same thing, so a linkage whose redundancy is geometric comes out too low.
 * Reported by a reader whose drawing -- three parallel cranks carrying one
 * coupler -- refused to simulate.
 *
 * Asking the geometry instead is right but not sufficient: a rank deficiency
 * says the linkage can move *at this instant*, which a tangency also says. So
 * both halves are pinned here, on the same page, because either alone is a
 * wrong answer to a different drawing.
 */
describe('a mechanism Gruebler counts as rigid', () => {
  it('turns, when its third crank only repeats what the first two said', () => {
    const built = buildMechanism(redundantParallelCrankFixture());

    expect(built.mechanism.dof).toBe(1);
    expect(built.mechanism.isMechanismValid()).toBe(true);
  });

  it('and turns as a parallelogram: every bar rigid, the coupler never turning', () => {
    // The claim worth making is not that a cycle came back -- it is that the
    // cycle is the motion a parallelogram has. Each bar keeps its length, and
    // the coupler translates on a circle without rotating, which is what makes
    // this linkage worth drawing in the first place.
    const built = buildMechanism(redundantParallelCrankFixture());
    const frames = built.mechanism.joints;
    expect(frames.length).toBeGreaterThan(300);

    const at = (frame: (typeof frames)[number], id: string) => frame.find((one) => one.id === id)!;
    const span = (id: string, other: string) =>
      frames.map((frame) =>
        Math.hypot(at(frame, id).x - at(frame, other).x, at(frame, id).y - at(frame, other).y)
      );
    for (const [from, to] of [
      ['A', 'B'],
      ['E', 'F'],
      ['I', 'J'],
      ['B', 'E'],
      ['B', 'I'],
    ]) {
      const lengths = span(from, to);
      expect(Math.max(...lengths) - Math.min(...lengths), `${from}${to}`).toBeLessThan(1e-3);
    }

    // The coupler holds its heading the whole way round: that is what "the
    // third crank changes nothing" means, said as a measurement. The bound is
    // a twentieth of a degree -- the solver's own drift, and four orders below
    // the radians a coupler that really turned would move through.
    const headings = frames.map((frame) =>
      Math.atan2(at(frame, 'E').y - at(frame, 'B').y, at(frame, 'E').x - at(frame, 'B').x)
    );
    expect(Math.max(...headings) - Math.min(...headings)).toBeLessThan(1e-3);
  });

  it('and its rates solve, with one loop more than it has unknowns', () => {
    // The loop solver finds two independent loops here and only three rates
    // to solve for -- the two idle cranks and the coupler -- so the loop
    // equations are four rows on three columns. They agree with each other,
    // because the third crank does repeat the first two, and the least-squares
    // answer is the exact one. Sized by the unknowns alone, the matrix had no
    // row for the second loop to write into, and the Kinematic Analysis panel
    // threw on the first mechanism this was ever asked of.
    const built = buildMechanism(redundantParallelCrankFixture());
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = built.mechanism.requiredLoops;
    expect(built.mechanism.requiredLoops.length).toBe(2);
    for (let t = 0; t < built.mechanism.joints.length; t++) {
      KinematicsSolver.determineKinematics(
        built.mechanism.joints[t],
        built.mechanism.links[t],
        built.mechanism.inputAngularVelocities[t]
      );
      const driven = built.mechanism.inputAngularVelocities[t];
      // Twice a turn the cranks lie along the coupler, and there the loop
      // equations genuinely lose a rank: the parallelogram could fold into
      // its anti-parallelogram, and no first-order solve can tell. Near that
      // change point the rows are nearly dependent and the answer is a
      // compromise that worsens as the flat pose nears -- a fifth of a
      // thousandth at fifteen degrees from it, half a turn's worth at it.
      // Away from it the answer is exact to the arithmetic.
      const b = built.mechanism.joints[t].find((joint) => joint.id === 'B')!;
      const crank = Math.abs(Math.sin(Math.atan2(b.y, b.x)));
      if (crank < Math.sin((15 * Math.PI) / 180)) continue;
      // Every crank turns with the driven one, and the coupler never turns,
      // to the few ten-thousandths the recorded positions leave the rows
      // disagreeing by.
      expect(KinematicsSolver.linkAngVelMap.get('AB')).toBeCloseTo(driven, 3);
      expect(KinematicsSolver.linkAngVelMap.get('EF')).toBeCloseTo(driven, 3);
      expect(KinematicsSolver.linkAngVelMap.get('BEI')).toBeCloseTo(0, 3);
      // The acceleration rows carry the velocities' error once more, squared
      // against the crank's radius, so they are good to a few thousandths.
      expect(KinematicsSolver.linkAngAccMap.get('BEI')).toBeCloseTo(0, 2);
    }
  });

  it('stays rigid when the freedom is a tangency rather than a motion', () => {
    // The same test, told no. A slider-crank whose coupler is welded to its
    // block has the crank pin on a circle and on a line at once; drawn where
    // the two touch, the rank finds a freedom that the second step takes away.
    // Counting it would hand a solver a linkage to tear apart.
    const welded = { ...teachingLabSliderCrankFixture(), welds: ['C'] };

    expect(buildMechanism(welded).mechanism.dof).toBe(0);
  });

  it('leaves an ordinary four-bar exactly where it found it', () => {
    // Nothing above may reach a drawing the count already gets right: the
    // geometry is asked only when the count says the linkage cannot move.
    expect(buildMechanism(teachingLabFourBarFixture()).mechanism.dof).toBe(1);
  });
});
