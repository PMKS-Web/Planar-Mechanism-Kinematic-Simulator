import type { Quantity } from '../../test-utils/oracle/compare-oracle';
import type { ForceQuantity } from '../../test-utils/oracle/compare-oracle-forces';
import type { MobilityQuantity } from '../../test-utils/oracle/compare-mobility';

/**
 * Every published machine, or part of one, that the oracle comparison leaves
 * out, and why. docs/numerical-oracle-plan.md § Keeping it current is the rule:
 * an exclusion names the machine, what is left out, the reason and the
 * condition it is reviewed on; a disagreement between PMKS+ and the oracle
 * also names its tracking issue. A PMKS+ solver is never changed to make one
 * go away here, and a budget is never widened for one machine.
 *
 * A problem the exporter could not fully write down (`unsupported` in its
 * problem file) is excluded automatically, with those notes as the reason, and
 * is not listed here.
 */
export type ExclusionKind =
  /** PMKS+ and the oracle disagree, and PMKS+ is believed wrong. Needs an issue. */
  | 'disagreement'
  /** PMKS+ refuses the machine on purpose, by a rule that is not physics. */
  | 'by-design'
  /** The oracle cannot answer this one yet. */
  | 'oracle-limitation';

export interface Exclusion {
  /** The problem id: `<case>.<machine>`, as in src/test-data/oracle/problems. */
  problem: string;
  kind: ExclusionKind;
  /**
   * What is left out. `'runs'` is the question of whether the machine runs at
   * all, and with it every comparison; otherwise only these quantities, only
   * for `parts` when it is given, for a force only in `modes` when given,
   * and only at the grid samples `samples` when given. A part is a joint or a
   * body; a force at `joint/body` is left out by naming either, and a name that
   * is both a joint and a body in the problem is refused by oracle.spec.ts.
   * `'mobility'` leaves out the mobility cross-check (oracle-mobility.spec.ts)
   * and nothing else.
   */
  what:
    | 'runs'
    | {
        quantities: (Quantity | ForceQuantity | MobilityQuantity)[];
        parts?: string[];
        modes?: ('static' | 'dynamic')[];
        samples?: number[];
      };
  reason: string;
  /** Required for a disagreement. */
  issue?: string;
  /** When to look at it again. */
  review: string;
}

export const ORACLE_EXCLUSIONS: Exclusion[] = [
  {
    problem: 'gallery.slider-crank-whose-rod-comes-square-to-the-guide.m1',
    kind: 'disagreement',
    what: 'runs',
    reason:
      'Decoded from its published URL, PMKS+ refuses the machine (cycle-never-closes). The oracle runs it through both tangencies and closes it after two crank turns, as square-rod-tangency.spec.ts expects of the fixture built directly.',
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/77',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.four-bar-with-two-inputs.m1',
    kind: 'disagreement',
    what: {
      quantities: [
        'velocity',
        'acceleration',
        'comVelocity',
        'comAcceleration',
        'omega',
        'alpha',
        'reaction',
        'bodyTotal',
        'effort',
      ],
      // The static forces depend on the poses alone, and agree.
      modes: ['dynamic'],
    },
    reason:
      "The poses agree, the rates do not. PMKS+'s analytic angular velocity of the coupler BC is wrong (0.1625 rad/s at the drawn pose, where its own joint velocities and the oracle both give 0.1745), and the joint rates it leaves blank are differenced, outside the differenced budget near the toggles. The in-motion forces rest on those accelerations.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/78',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.four-bar-with-a-second-crank-on-its-input.m1',
    kind: 'by-design',
    what: 'runs',
    reason:
      'Three bodies meet at the driven pin, and PMKS+ refuses to choose which pair the input turns (input-refused). The physics is a one-freedom machine, so the oracle runs it.',
    review: 'If the actuator rule in model/actuator.ts changes.',
  },
  {
    problem: 'gallery.motiongen-gripper.m1',
    kind: 'oracle-limitation',
    what: 'runs',
    reason:
      "Each jaw rides two parallel slots at one height, so the carriage and jaws can turn together at first order and not at second; both solvers agree it has one freedom (oracle-mobility.spec.ts). The oracle does not walk a machine with a freedom that dies at second order: its poses are held along that turn only to the square root of their residual over its curvature, about 1e-5 of the machine's size, and do not reproduce across platforms to the digits a reference keeps. Its rates are past the conditioning limit throughout in any case.",
    review: 'If the oracle learns to solve a pose along a weakly held second-order direction.',
  },
  {
    problem: 'gallery.crank-rocker-driven-from-the-rocker-at-its-limit.m1',
    kind: 'oracle-limitation',
    what: 'runs',
    reason:
      'The drawn pose is a dead point of the driver: both ways along the configuration curve move the rocker the same way, so the oracle does not choose a branch to walk.',
    review: 'If the oracle learns to walk away from a dead point on the branch PMKS+ takes.',
  },
  {
    problem: 'gallery.parallelogram-with-a-third-parallel-crank.m1',
    kind: 'by-design',
    what: { quantities: ['reaction', 'bodyTotal', 'couple', 'effort'] },
    reason:
      "PMKS+ refuses the force analysis of a redundant support and tells the reader to remove one (unsupported-topology). Equilibrium fixes each body's total and the input torque, which the oracle reports; the split between the cranks it does not fix.",
    review: 'If PMKS+ starts reporting resultants for a redundant support.',
  },
  {
    problem: 'gallery.four-bar-driven-at-its-coupler-rocker-pin.m1',
    kind: 'disagreement',
    what: { quantities: ['reaction', 'effort'] },
    reason:
      "PMKS+ applies a floating pin's motor torque to one body only, so the frame supplies the reaction couple from outside: every reaction and the effort differ, while the body totals, which a couple does not change, agree.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/81',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.oscillating-fan.m1',
    kind: 'disagreement',
    what: { quantities: ['reaction', 'effort'] },
    reason:
      "PMKS+ applies a floating pin's motor torque to one body only, so the frame supplies the reaction couple from outside: every reaction and the effort differ, while the body totals, which a couple does not change, agree.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/81',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.walking-beam-pumping-unit.m1',
    kind: 'disagreement',
    what: { quantities: ['reaction', 'effort'] },
    reason:
      "PMKS+ applies a floating pin's motor torque to one body only, so the frame supplies the reaction couple from outside: every reaction and the effort differ, while the body totals, which a couple does not change, agree.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/81',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.leg-on-a-bicycle-crank.m1',
    kind: 'disagreement',
    what: { quantities: ['omega'], parts: ['BP'], samples: [-39] },
    reason:
      "PMKS+ solves the pose at k = -39 twenty times looser than its neighbors (2.2e-9 of scale), and at a condition number of 557 the analytic angular velocity of BP carries that out to 1.29e-7, just outside the budget.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/82',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'template.pedaling-leg.m1',
    kind: 'disagreement',
    what: { quantities: ['omega'], parts: ['BP'], samples: [-39] },
    reason:
      "PMKS+ solves the pose at k = -39 twenty times looser than its neighbors (2.2e-9 of scale), and at a condition number of 557 the analytic angular velocity of BP carries that out to 1.29e-7, just outside the budget.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/82',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.leg-on-a-bicycle-crank.m1',
    kind: 'disagreement',
    what: { quantities: ['reaction', 'effort'] },
    reason:
      "PMKS+ applies a floating pin's motor torque to one body only, so the frame supplies the reaction couple from outside: every reaction and the effort differ, while the body totals, which a couple does not change, agree.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/81',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.scotch-yoke-on-two-guides.m1',
    kind: 'by-design',
    what: { quantities: ['reaction', 'bodyTotal', 'couple', 'effort'] },
    reason:
      "Two guides hold one yoke, a redundant support, and PMKS+ refuses the force analysis and says so (unsupported-topology). Its motion is verified.",
    review: 'If PMKS+ starts reporting resultants for a redundant support.',
  },
  {
    problem: 'gallery.cylinder-driven-gripper.m1',
    kind: 'oracle-limitation',
    what: 'runs',
    reason:
      "Drawn within 1e-5 m of a dead point of its drive: the oracle's minimum-norm projection of the drawn pose slides two percent of the machine's size along the nearly free direction, and its corrector fails two steps later. Which way the reader meant it to go from a dead point is not the oracle's to choose.",
    review: 'If the oracle learns to start a walk at a dead point.',
  },
  {
    problem: 'template.hood-hinge.m1',
    kind: 'disagreement',
    what: {
      quantities: ['com', 'comVelocity', 'comAcceleration', 'reaction', 'bodyTotal', 'couple', 'effort'],
      parts: ['AA1', 'BP'],
    },
    reason:
      "The cylinder is stored a hair off its line. From frame 1 PMKS+ straightens its interior but carries the barrel's and rod's centers of mass rigidly from the unstraightened frame 0, which puts them 3e-6 of the machine's size off the members.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/83',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'template.aircraft-landing-gear.m1',
    kind: 'disagreement',
    what: {
      quantities: ['com', 'comVelocity', 'comAcceleration', 'reaction', 'bodyTotal', 'couple', 'effort'],
      parts: ['ER', 'II1'],
    },
    reason:
      "The cylinder is stored a hair off its line. From frame 1 PMKS+ straightens its interior but carries the barrel's and rod's centers of mass rigidly from the unstraightened frame 0, which puts them 4e-5 of the machine's size off the members.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/83',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.cylinder-riding-a-slot.m1',
    kind: 'disagreement',
    what: {
      quantities: ['velocity', 'comVelocity', 'omega', 'reaction', 'bodyTotal', 'couple', 'effort'],
    },
    reason:
      "The cylinder is stored a hair off its line. Every analytic rate comes out about 1e-7 of its scale too high, and the static forces 3e-8 of the largest force off, a uniform scale the size of 1 - cos of the drawn misalignment, against budgets of 1e-7 and 1e-8.",
    issue: 'https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/issues/83',
    review: 'When the issue is closed, delete this entry.',
  },
  {
    problem: 'gallery.locomotive-drive-wheels.m1',
    kind: 'by-design',
    what: { quantities: ['reaction', 'bodyTotal', 'couple', 'effort'] },
    reason:
      "One side rod couples three wheels, where two would fix the motion: a redundant support, and PMKS+ refuses the force analysis and says so (unsupported-topology). Nothing on it has mass or a load, so the oracle's forces are all zero; its motion is verified.",
    review: 'If PMKS+ starts reporting resultants for a redundant support.',
  },
];
