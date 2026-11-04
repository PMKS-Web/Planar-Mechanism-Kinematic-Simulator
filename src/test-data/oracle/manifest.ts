import type { Quantity } from '../../test-utils/oracle/compare-oracle';
import type { ForceQuantity } from '../../test-utils/oracle/compare-oracle-forces';

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
   * for `parts` when it is given, and for a force only in `modes` when given.
   */
  what:
    | 'runs'
    | {
        quantities: (Quantity | ForceQuantity)[];
        parts?: string[];
        modes?: ('static' | 'dynamic')[];
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
      "Each jaw rides two parallel slots at one height, so it can turn at first order and not at second. The oracle's rank test is first order and counts two freedoms; PMKS+'s mobility.ts drops the one that dies at second order and runs it.",
    review: 'Phase 4, when the oracle gains a second-order mobility test.',
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
    problem: 'gallery.locomotive-drive-wheels.m1',
    kind: 'by-design',
    what: { quantities: ['reaction', 'bodyTotal', 'couple', 'effort'] },
    reason:
      "One side rod couples three wheels, where two would fix the motion: a redundant support, and PMKS+ refuses the force analysis and says so (unsupported-topology). Nothing on it has mass or a load, so the oracle's forces are all zero; its motion is verified.",
    review: 'If PMKS+ starts reporting resultants for a redundant support.',
  },
];
