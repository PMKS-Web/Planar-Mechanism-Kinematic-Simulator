import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link, SliderBlock, RealLink } from '../link';
import { slideAssemblies } from '../slide-assembly';
import { KinematicsSolver } from './kinematic-solver';
import { Loop } from './loop-solver';
import { siUnitFactors, SiUnitFactors } from '../unit-conversions';

export type ForceAnalysisMode = 'static' | 'dynamic';

export type ForceAnalysisStatus =
  'ok' | 'singular' | 'unsupported-topology' | 'missing-kinematics' | 'invalid-properties';

export type ForceVector = [number, number];

export interface ForceAnalysisEffort {
  jointId: string;
  kind: 'torque' | 'force';
  /** N*m for torque and N for force. */
  valueSI: number;
}

export interface ForceAnalysisFrame {
  mode: ForceAnalysisMode;
  status: ForceAnalysisStatus;
  timeSeconds: number;
  /** Resultant acting on each root body at a joint, in newtons. */
  jointReactionsByLink: Map<string, Map<string, ForceVector>>;
  /** Compatibility/default view: the resultant on the joint's first root body. */
  jointReactions: Map<string, ForceVector>;
  /**
   * The couple each welded guide applies to its rider, keyed by the sliding
   * joint's id. N·m, counterclockwise-positive on the rider. Only welded
   * prismatic pairs carry one; a free-turning block cannot transmit a moment.
   */
  guideCouples: Map<string, number>;
  inputEffort?: ForceAnalysisEffort;
  rank: number;
  residual: number;
  /** Smallest scaled pivot of the solve — how far this pose sat from singular. */
  minPivot?: number;
  /**
   * True when equilibrium alone could not split the load between supports
   * that share a line, and the evenest split was taken -- see `sharedSupport`
   * in `analyzeFrame`.
   */
  sharedSupport?: boolean;
  message?: string;
}

/**
 * Which joint/body pairs carry a pin reaction, derived from the root topology
 * alone. The analysis panels enumerate their rows from this so a joint's rows
 * and a link's rows stay two filtered views of the same reaction set, even at
 * positions where the solve itself fails.
 */
export interface ForceReactionIndex {
  /** Joint id -> ids of the root bodies that react at that joint. */
  linksByJoint: Map<string, string[]>;
  /** Root body id -> ids of the joints where that body carries a reaction. */
  jointsByLink: Map<string, string[]>;
}

export interface ForceAnalysisSeries {
  mode: ForceAnalysisMode;
  frames: ForceAnalysisFrame[];
  successfulFrames: number;
  /** Frames whose reactions rest on the evenest split of a shared support. */
  sharedSupportFrames: number;
  reactionIndex: ForceReactionIndex;
  diagnostic?: string;
}

interface FrameKinematics {
  linkAccelerations: Map<string, ForceVector>;
  linkAngularAccelerations: Map<string, number>;
  pistonAccelerations: Map<string, ForceVector>;
}

interface MechanismFrames {
  joints: Joint[][];
  links: Link[][];
  timeNum: number[];
  inputAngularVelocities: number[];
  requiredLoops: Loop[];
  gravity: boolean;
  unit: string;
}

type UnitFactors = SiUnitFactors;

interface BodyRows {
  link: Link;
  start: number;
  count: 2 | 3;
}

interface ReactionUnknown {
  joint: RealJoint;
  positiveBody: Link;
  negativeBody?: Link;
  direction: ForceVector;
  column: number;
}

/**
 * The couple a welded guide transmits (docs/phase-3-slide-spec.md §3.8, §9).
 *
 * A free-turning block exchanges only a normal force with its slot. Welding a
 * rider to the block stops the pair rotating, so the guide must also supply a
 * moment — the unknown the count guard used to come up one short by. The block
 * is zero-length and has no moment equation, so the couple passes through it
 * untouched and can couple the rider to the guide directly.
 */
interface GuideCouple {
  /** The sliding joint whose guide supplies the couple. */
  slider: PrisJoint;
  /** The root body the weld holds rigid with the block; +1 in its moment row. */
  rider: RealLink;
  /** The slot's carrier when it is cut into a moving body; −1 in its moment row. */
  carrier?: Link;
  column: number;
}

interface LinearSolution {
  values: number[];
  rank: number;
  residual: number;
  /** Smallest scaled pivot the elimination met — distance from singular. */
  minPivot: number;
}

const GRAVITY = 9.80665;
const MAX_NORMALIZED_RESIDUAL = 1e-8;
/**
 * What an evenest split may leave unbalanced, relative to the loads. Supports
 * that share a line are seldom on it to the last digit -- a rail's pins sit a
 * rounding apart -- so the exact solution is a pair of enormous reactions
 * cancelling across that hair, and the even split balances the loads to a
 * part in a thousand instead. Measured against the loads alone, so a load
 * nothing can balance is still refused however large the reactions grow.
 */
const SHARED_SUPPORT_RESIDUAL = 1e-3;
/**
 * The smallest scaled pivot the elimination accepts before calling the pose
 * singular.
 *
 * A toggle pose reached through exact arithmetic pivots at exactly zero, but
 * the same pose reached through floating-point trig lands within round-off of
 * zero — and *which* side of zero differs by browser, because engines round
 * transcendentals differently at the last bit. Chrome refused the square-rod
 * tangency frame while Safari "solved" it into 8.5e5 N reactions from a 10 N
 * load. Refusing anything below this line makes the call deterministic. The
 * smallest scaled pivot of any healthy solve across the whole fixture corpus
 * is 3.4e-3, 34x above the line (force-solver.fixture.spec.ts holds every
 * frame above 1e-3), so frames the sampler lands merely *near* a toggle still
 * solve, as designed.
 */
const SINGULAR_PIVOT_TOLERANCE = 1e-4;

/**
 * Free-body force analysis for the current root topology.
 *
 * The legacy public fields remain as adapters for the equation-panel and old
 * verification callers. New code should consume analyzeFrame/analyzeMechanism.
 */
export class ForceSolver {
  static unknownVariableForcesMap = new Map<string, ForceVector>();
  static unknownVariableTorque = 0;
  static A_matrix: number[][] = [];
  static B_matrix: number[][] = [];
  static lastResult?: ForceAnalysisFrame;

  // Retained compatibility fields used by dormant equation/debug code.
  static jointPositiveForceXLinkMap = new Map<string, string>();
  static jointPositiveForceYLinkMap = new Map<string, string>();
  static linkToFixedPositionMap = new Map<string, string>();
  static jointIdToJointIndexMap = new Map<string, number>();
  static jointIDToUnknownArrayIndexMap = new Map<string, number>();
  static linkIDToUnknownArrayIndexMap = new Map<string, number>();
  static desiredLoopLetters: string[][] = [];
  static inputLinkIndex = -1;

  static resetVariables(): void {
    this.unknownVariableForcesMap = new Map<string, ForceVector>();
    this.unknownVariableTorque = 0;
    this.A_matrix = [];
    this.B_matrix = [];
    this.lastResult = undefined;
    this.jointPositiveForceXLinkMap = new Map<string, string>();
    this.jointPositiveForceYLinkMap = new Map<string, string>();
    this.linkToFixedPositionMap = new Map<string, string>();
    this.jointIdToJointIndexMap = new Map<string, number>();
    this.jointIDToUnknownArrayIndexMap = new Map<string, number>();
    this.linkIDToUnknownArrayIndexMap = new Map<string, number>();
    this.desiredLoopLetters = [];
    this.inputLinkIndex = -1;
  }

  /** Convert old plural string values without leaking them into new callers. */
  static normalizeMode(mode: string): ForceAnalysisMode {
    return mode === 'dynamic' || mode === 'dynamics' ? 'dynamic' : 'static';
  }

  /** Legacy single-frame adapter. */
  static determineForceAnalysis(
    joints: Joint[],
    links: Link[],
    analysisType: string,
    gravity: boolean,
    unit: string
  ): ForceAnalysisFrame {
    const mode = this.normalizeMode(analysisType);
    const kinematics = mode === 'dynamic' ? this.captureCurrentKinematics(links) : undefined;
    const result = this.analyzeFrame(joints, links, mode, gravity, unit, 0, kinematics);

    this.lastResult = result;
    this.unknownVariableForcesMap = new Map(
      joints.map((joint) => [joint.id, result.jointReactions.get(joint.id) ?? [0, 0]])
    );
    this.unknownVariableTorque = result.inputEffort?.valueSI ?? 0;
    return result;
  }

  /** Loop-derived setup is no longer required; keep this as a harmless adapter. */
  static determineDesiredLoopLettersForce(_requiredLoops: Loop[]): void {
    this.desiredLoopLetters = [];
  }

  static analyzeMechanism(
    mechanism: MechanismFrames,
    mode: ForceAnalysisMode
  ): ForceAnalysisSeries {
    const frameCount = Math.min(mechanism.joints.length, mechanism.links.length);
    const fallback =
      mode === 'dynamic' ? this.finiteDifferenceKinematics(mechanism, frameCount) : [];
    const frames: ForceAnalysisFrame[] = [];

    // Two passes at most. The first refuses every rank-deficient pose, which
    // is right for a toggle: an isolated pose where the reactions grow
    // without bound and the chart shows a gap. A support that shares a line
    // is deficient at *every* pose, and only then is the second pass run,
    // taking the evenest split -- so a toggle keeps its gap and a redundant
    // rail keeps its cycle, and the two are never confused.
    for (const evenest of [false, true]) {
      frames.length = 0;
      for (let index = 0; index < frameCount; index++) {
        frames.push(this.frameAt(mechanism, mode, fallback, index, evenest));
      }
      if (frames.some((frame) => frame.status === 'ok')) break;
    }

    const successfulFrames = frames.filter((frame) => frame.status === 'ok').length;
    return {
      mode,
      frames,
      successfulFrames,
      sharedSupportFrames: frames.filter((frame) => frame.sharedSupport).length,
      reactionIndex: this.buildReactionIndex(mechanism.joints[0] ?? [], mechanism.links[0] ?? []),
      // The frame's own message first: it names the joint or the count, where
      // the status alone can only say "topology".
      diagnostic:
        successfulFrames === 0
          ? (frames[0]?.message ?? this.statusMessage(frames[0]?.status ?? 'unsupported-topology'))
          : undefined,
    };
  }

  private static frameAt(
    mechanism: MechanismFrames,
    mode: ForceAnalysisMode,
    fallback: FrameKinematics[],
    index: number,
    evenest: boolean
  ): ForceAnalysisFrame {
    let kinematics: FrameKinematics | undefined;
    if (mode === 'dynamic') {
      // Clear the solver's shared maps each frame so a mid-solve failure at
      // frame k cannot leave frame k-1's finite values in place — which would
      // read as "current" and hide the failure from the fallback below.
      KinematicsSolver.resetVariables();
      KinematicsSolver.requiredLoops = mechanism.requiredLoops;
      try {
        KinematicsSolver.determineKinematics(
          mechanism.joints[index],
          mechanism.links[index],
          mechanism.inputAngularVelocities[index] ?? 0
        );
      } catch {
        // The position sequence is still a valid source for a complete,
        // topology-independent finite-difference fallback.
      }
      kinematics = this.captureCurrentKinematics(mechanism.links[index], fallback[index]);
    }
    return this.analyzeFrame(
      mechanism.joints[index],
      mechanism.links[index],
      mode,
      mechanism.gravity,
      mechanism.unit,
      mechanism.timeNum[index] ?? index,
      kinematics,
      evenest
    );
  }

  static analyzeFrame(
    joints: Joint[],
    links: Link[],
    mode: ForceAnalysisMode,
    gravity: boolean,
    unit: string,
    timeSeconds = 0,
    kinematics?: FrameKinematics,
    evenest = false
  ): ForceAnalysisFrame {
    const every = links.filter(
      (link): link is RealLink | SliderBlock =>
        link instanceof RealLink || link instanceof SliderBlock
    );
    // A body pinned to the world at two points is fixed: it is frame, not a
    // link, and gets no equilibrium of its own -- see `frameBodies`.
    const frame = this.frameBodies(every);
    const bodies = every.filter((body) => !frame.has(body.id));
    const units = this.unitFactors(unit);
    const empty = (
      status: ForceAnalysisStatus,
      message = this.statusMessage(status),
      rank = 0,
      residual = Number.POSITIVE_INFINITY
    ): ForceAnalysisFrame => ({
      mode,
      status,
      timeSeconds,
      jointReactionsByLink: new Map(),
      jointReactions: new Map(),
      guideCouples: new Map(),
      rank,
      residual,
      message,
    });

    if (bodies.length === 0) return empty('unsupported-topology');
    const badProperty = this.invalidProperty(bodies, units);
    if (badProperty) return empty('invalid-properties', badProperty);
    if (mode === 'dynamic' && !this.kinematicsAreComplete(bodies, kinematics)) {
      return empty('missing-kinematics');
    }

    const bodyRows = new Map<string, BodyRows>();
    let rowCount = 0;
    for (const body of bodies) {
      const count = body instanceof RealLink ? 3 : 2;
      bodyRows.set(body.id, { link: body, start: rowCount, count });
      rowCount += count;
    }

    const { reactions, incidentByJoint } = this.enumerateReactions(joints, bodies, every, frame);

    // One couple unknown per welded slide (docs/phase-3-slide-spec.md §9).
    // Shapes the couple cannot be written for are refused by name rather than
    // left to the count guard, which would only catch them by coincidence.
    const couples: GuideCouple[] = [];
    for (const assembly of slideAssemblies(joints)) {
      // A dangling guide exerts nothing, so it owes no couple either.
      if (!assembly.slider.ground && !assembly.slider.isFloating) continue;
      // A settled weld has fused every rider into one compound. Mid-edit, the
      // riders can still be several distinct bodies, and one couple cannot
      // speak for all of them — refuse rather than pick a favorite.
      const riderRoots = new Set(assembly.riders.map((leaf) => this.rootBody(bodies, leaf)));
      const rider = riderRoots.size === 1 ? [...riderRoots][0] : undefined;
      const carrier = assembly.slider.isFloating
        ? this.rootBody(bodies, assembly.slider.carrier)
        : undefined;
      if (
        !(rider instanceof RealLink) ||
        rider === carrier ||
        (carrier !== undefined && !(carrier instanceof RealLink))
      ) {
        return empty(
          'unsupported-topology',
          `Joint ${assembly.weldJoint.id} welds ${assembly.riders[0]?.id ?? 'a link'} rigidly ` +
            'to its slider, and that shape has no force model.'
        );
      }
      couples.push({
        slider: assembly.slider,
        rider,
        carrier,
        column: reactions.length + couples.length,
      });
    }

    const inputJoint = joints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    let inputBody: Link | undefined;
    let inputKind: 'torque' | 'force' | undefined;
    let inputDirection: ForceVector = [0, 0];
    if (inputJoint) {
      const incident = incidentByJoint.get(inputJoint.id) ?? [];
      if (inputJoint instanceof PrisJoint) {
        inputBody = incident.find((body) => body instanceof SliderBlock);
        inputKind = inputBody ? 'force' : undefined;
        // slotAngle, not angle_rad: a slot cut into a moving link points
        // somewhere different at every timestep.
        inputDirection = [Math.cos(inputJoint.slotAngle), Math.sin(inputJoint.slotAngle)];
      } else {
        inputBody = incident.find((body) => body instanceof RealLink);
        inputKind = inputBody ? 'torque' : undefined;
      }
    }

    const unknownCount = reactions.length + couples.length + (inputBody && inputKind ? 1 : 0);
    if (unknownCount !== rowCount) {
      // Cause first, arithmetic second: "10 equations, 9 unknowns" is the
      // solver talking to itself. What a reader can act on is which way the
      // count is off — too many supports, or a body with none.
      const counts = `(${rowCount} equilibrium equations, ${unknownCount} unknowns)`;
      return empty(
        'unsupported-topology',
        unknownCount > rowCount
          ? `This linkage has more supports than equilibrium can determine — a redundant support, link, or weld leaves the load's split between them ambiguous. Remove one ${counts}.`
          : `A body here has nothing to react against, so its equilibrium cannot be written. Check for a part carrying load with no support ${counts}.`
      );
    }

    const A = Array.from({ length: rowCount }, () => Array(unknownCount).fill(0));
    const b = Array(rowCount).fill(0);

    const addForceCoefficient = (
      body: Link,
      joint: Joint,
      direction: ForceVector,
      column: number,
      sign: number
    ): void => {
      const rows = bodyRows.get(body.id)!;
      A[rows.start][column] += sign * direction[0];
      A[rows.start + 1][column] += sign * direction[1];
      if (body instanceof RealLink) {
        const rx = (joint.x - body.CoM.x) * units.distanceToM;
        const ry = (joint.y - body.CoM.y) * units.distanceToM;
        A[rows.start + 2][column] += sign * (rx * direction[1] - ry * direction[0]);
      }
    };

    for (const reaction of reactions) {
      addForceCoefficient(
        reaction.positiveBody,
        reaction.joint,
        reaction.direction,
        reaction.column,
        1
      );
      if (reaction.negativeBody) {
        addForceCoefficient(
          reaction.negativeBody,
          reaction.joint,
          reaction.direction,
          reaction.column,
          -1
        );
      }
    }

    // A couple has no force resultant: it enters moment rows alone.
    for (const couple of couples) {
      A[bodyRows.get(couple.rider.id)!.start + 2][couple.column] += 1;
      if (couple.carrier) {
        A[bodyRows.get(couple.carrier.id)!.start + 2][couple.column] -= 1;
      }
    }

    const inputColumn = reactions.length + couples.length;
    if (inputBody && inputKind) {
      const rows = bodyRows.get(inputBody.id)!;
      if (inputKind === 'torque' && inputBody instanceof RealLink) {
        A[rows.start + 2][inputColumn] = 1;
      } else if (inputKind === 'force') {
        A[rows.start][inputColumn] = inputDirection[0];
        A[rows.start + 1][inputColumn] = inputDirection[1];
        // An actuator pushes against something. On a grounded guide that is
        // the world; in a sealed cylinder it is the barrel, and leaving the
        // reaction off turns the drive into an outside hand pushing the block
        // through space — which breaks the oldest property a cylinder has, of
        // being a two-force member between its mounts.
        if (inputJoint instanceof PrisJoint && inputJoint.isFloating) {
          const carrier = this.rootBody(bodies, inputJoint.carrier);
          if (carrier) {
            addForceCoefficient(carrier, inputJoint, inputDirection, inputColumn, -1);
          }
        }
      }
    }

    for (const body of bodies) {
      const rows = bodyRows.get(body.id)!;
      const massKg = body.mass * units.massToKg;
      const acceleration =
        mode === 'dynamic'
          ? body instanceof RealLink
            ? kinematics!.linkAccelerations.get(body.id)!
            : kinematics!.pistonAccelerations.get(body.id)!
          : ([0, 0] as ForceVector);
      b[rows.start] = massKg * acceleration[0] * units.distanceToM;
      b[rows.start + 1] = massKg * acceleration[1] * units.distanceToM;

      if (gravity) b[rows.start + 1] += massKg * GRAVITY;

      if (body instanceof RealLink) {
        const angularAcceleration =
          mode === 'dynamic' ? kinematics!.linkAngularAccelerations.get(body.id)! : 0;
        b[rows.start + 2] = body.massMoI * units.inertiaToKgM2 * angularAcceleration;

        for (const force of body.forces) {
          const fx = force.mag * Math.cos(force.angleRad) * units.forceToN;
          const fy = force.mag * Math.sin(force.angleRad) * units.forceToN;
          const rx = (force.startCoord.x - body.CoM.x) * units.distanceToM;
          const ry = (force.startCoord.y - body.CoM.y) * units.distanceToM;
          b[rows.start] -= fx;
          b[rows.start + 1] -= fy;
          b[rows.start + 2] -= rx * fy - ry * fx;
        }
      }
    }

    // Statics alone cannot split a load between supports that share a line
    // -- two rails holding one jaw at one height, say -- and the elimination
    // finds no pivot. That is not a dead pose; it is one degree of ambiguity
    // in how a determinate total is shared. A body's stiffness would share it
    // evenly, and the evenest split is exactly the minimum-norm solution, so
    // that is the answer taken, and said: the frame is marked and the
    // readiness list carries the warning. A pose where no split balances the
    // load at all -- a true toggle -- still fails the residual below.
    let sharedSupport = false;
    let solution = this.solveLinearSystem(A, b);
    if (!solution && evenest) {
      solution = this.evenestSolution(A, b);
      sharedSupport = solution !== undefined;
    }
    if (!solution) return empty('singular');
    if (solution.residual > (sharedSupport ? SHARED_SUPPORT_RESIDUAL : MAX_NORMALIZED_RESIDUAL)) {
      return empty(
        'singular',
        `Force equilibrium residual ${solution.residual.toExponential(2)} exceeds tolerance.`,
        solution.rank,
        solution.residual
      );
    }

    const jointReactionsByLink = new Map<string, Map<string, ForceVector>>();
    const addReaction = (jointId: string, bodyId: string, fx: number, fy: number): void => {
      let byLink = jointReactionsByLink.get(jointId);
      if (!byLink) {
        byLink = new Map<string, ForceVector>();
        jointReactionsByLink.set(jointId, byLink);
      }
      const current = byLink.get(bodyId) ?? [0, 0];
      byLink.set(bodyId, [current[0] + fx, current[1] + fy]);
    };

    for (const reaction of reactions) {
      const value = solution.values[reaction.column];
      const fx = reaction.direction[0] * value;
      const fy = reaction.direction[1] * value;
      addReaction(reaction.joint.id, reaction.positiveBody.id, fx, fy);
      if (reaction.negativeBody) {
        addReaction(reaction.joint.id, reaction.negativeBody.id, -fx, -fy);
      }
    }

    const jointReactions = new Map<string, ForceVector>();
    for (const [jointId, byLink] of jointReactionsByLink) {
      const firstBody = incidentByJoint.get(jointId)?.[0];
      const value = (firstBody && byLink.get(firstBody.id)) ?? byLink.values().next().value;
      if (value) jointReactions.set(jointId, value);
    }

    const guideCouples = new Map<string, number>();
    for (const couple of couples) {
      guideCouples.set(couple.slider.id, solution.values[couple.column]);
    }

    const inputEffort =
      inputJoint && inputKind
        ? {
            jointId: inputJoint.id,
            kind: inputKind,
            valueSI: solution.values[inputColumn],
          }
        : undefined;

    return {
      mode,
      status: 'ok',
      timeSeconds,
      jointReactionsByLink,
      jointReactions,
      guideCouples,
      inputEffort,
      rank: solution.rank,
      residual: solution.residual,
      minPivot: solution.minPivot,
      sharedSupport,
    };
  }

  /**
   * The root body in `bodies` that `leaf` belongs to.
   *
   * A weld fuses links into a compound whose members survive as `subset`
   * leaves, so the link a slide assembly names is not always the body the
   * equilibrium rows are written for.
   */
  private static rootBody(bodies: Link[], leaf: Link | undefined): Link | undefined {
    if (!leaf) return undefined;
    const contains = (link: Link): boolean =>
      link.id === leaf.id ||
      (link instanceof RealLink && link.subset.some((member) => contains(member)));
    return bodies.find(contains);
  }

  static statusMessage(status: ForceAnalysisStatus): string {
    switch (status) {
      case 'singular':
        return 'Force equilibrium is singular at this position.';
      case 'unsupported-topology':
        return 'This topology does not have a determinate force-equilibrium model.';
      case 'missing-kinematics':
        return 'Dynamic analysis is missing motion data for one or more bodies.';
      case 'invalid-properties':
        return 'Mass, moment of inertia, or force properties are invalid.';
      default:
        return '';
    }
  }

  static determineMoment(
    origin: { x: number; y: number },
    pointX: number,
    pointY: number,
    forceX: number,
    forceY: number
  ): number[] {
    const xDist = pointX - origin.x;
    const yDist = pointY - origin.y;
    return [xDist * forceY, -yDist * forceX, 0];
  }

  /** The pin-reaction unknowns implied by the topology, before any solve. */
  /**
   * The bodies that are frame rather than links: pinned to the world at two
   * distinct points, so they cannot move at all.
   *
   * Kinematics never minded one -- the position solver holds both pins still.
   * Statics did: three equilibrium equations against four ground reactions,
   * and the split of load between the two pins has no unique answer, so a
   * drawing with a bracket like this refused with "more supports than
   * equilibrium can determine". The bracket is the world's, not the
   * mechanism's. It gets no rows here, its other joints act as ground pins for
   * whatever hangs on them (`jointsOnFrame`), and the reactions at its own two
   * pins -- the indeterminate pair -- are simply not asked for.
   */
  private static frameBodies(bodies: Link[]): Set<string> {
    const frame = new Set<string>();
    for (const body of bodies) {
      if (!(body instanceof RealLink)) continue;
      const pins = body.joints.filter(
        (joint): joint is RealJoint =>
          joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint)
      );
      const distinct = pins.filter(
        (pin, index) =>
          pins.findIndex((other) => Math.hypot(other.x - pin.x, other.y - pin.y) < 1e-6) === index
      );
      if (distinct.length >= 2) frame.add(body.id);
    }
    return frame;
  }

  /** Every joint on a frame body: a ground pin to whatever else meets it there. */
  private static jointsOnFrame(bodies: Link[], frame: ReadonlySet<string>): Set<string> {
    const joints = new Set<string>();
    for (const body of bodies) {
      if (frame.has(body.id)) body.joints.forEach((joint) => joints.add(joint.id));
    }
    return joints;
  }

  private static enumerateReactions(
    joints: Joint[],
    bodies: Link[],
    every: Link[] = bodies,
    frame: ReadonlySet<string> = new Set()
  ): { reactions: ReactionUnknown[]; incidentByJoint: Map<string, Link[]> } {
    const reactions: ReactionUnknown[] = [];
    const incidentByJoint = new Map<string, Link[]>();
    const frameJoints = this.jointsOnFrame(every, frame);
    const onFrame = (leaf: Link | undefined): boolean => {
      const root = this.rootBody(every, leaf);
      return !!root && frame.has(root.id);
    };
    for (const candidate of joints) {
      if (!(candidate instanceof RealJoint)) continue;
      const incident = this.incidentBodies(candidate, bodies);
      incidentByJoint.set(candidate.id, incident);
      if (incident.length === 0) continue;
      // Ground, or as good as: a pin on a frame body is a pin on the world.
      const grounded = candidate.ground || frameJoints.has(candidate.id);

      if (candidate instanceof PrisJoint) {
        const piston = incident.find((body) => body instanceof SliderBlock);
        // A grounded slot pushes against the world, which needs no equation of
        // its own. A floating one pushes against the carrier, and that reaction
        // has to appear in the carrier's equilibrium as well or the slot
        // transmits force out of nowhere. Resolved through compounds: a weld
        // may have folded the carrier into a root whose id is not its own. A
        // slot cut into a frame body resolves to no carrier here, which is the
        // grounded case: it pushes against the world.
        const carrier = candidate.isFloating ? this.rootBody(bodies, candidate.carrier) : undefined;
        const cutIntoFrame = candidate.isFloating && onFrame(candidate.carrier);
        if (piston && (candidate.ground || carrier || cutIntoFrame)) {
          reactions.push({
            joint: candidate,
            positiveBody: piston,
            negativeBody: carrier,
            // The reaction is normal to the slot, so it rotates with it.
            direction: [-Math.sin(candidate.slotAngle), Math.cos(candidate.slotAngle)],
            column: reactions.length,
          });
        }
        continue;
      }

      if (grounded) {
        for (const body of incident) {
          reactions.push({
            joint: candidate,
            positiveBody: body,
            direction: [1, 0],
            column: reactions.length,
          });
          reactions.push({
            joint: candidate,
            positiveBody: body,
            direction: [0, 1],
            column: reactions.length,
          });
        }
      } else if (incident.length >= 2) {
        const reference = incident[0];
        for (const other of incident.slice(1)) {
          reactions.push({
            joint: candidate,
            positiveBody: reference,
            negativeBody: other,
            direction: [1, 0],
            column: reactions.length,
          });
          reactions.push({
            joint: candidate,
            positiveBody: reference,
            negativeBody: other,
            direction: [0, 1],
            column: reactions.length,
          });
        }
      }
    }
    return { reactions, incidentByJoint };
  }

  /** Joint <-> root-body pairing that both analysis panels enumerate rows from. */
  static buildReactionIndex(joints: Joint[], links: Link[]): ForceReactionIndex {
    const every = links.filter(
      (link): link is RealLink | SliderBlock =>
        link instanceof RealLink || link instanceof SliderBlock
    );
    // The same cut the frame assembly makes: a frame body has no reactions
    // of its own to list, and its pins are ground to its neighbors.
    const frame = this.frameBodies(every);
    const bodies = every.filter((body) => !frame.has(body.id));
    const linksByJoint = new Map<string, string[]>();
    const jointsByLink = new Map<string, string[]>();
    const pair = (jointId: string, bodyId: string): void => {
      const forJoint = linksByJoint.get(jointId) ?? [];
      if (!forJoint.includes(bodyId)) forJoint.push(bodyId);
      linksByJoint.set(jointId, forJoint);

      const forLink = jointsByLink.get(bodyId) ?? [];
      if (!forLink.includes(jointId)) forLink.push(jointId);
      jointsByLink.set(bodyId, forLink);
    };

    for (const reaction of this.enumerateReactions(joints, bodies, every, frame).reactions) {
      pair(reaction.joint.id, reaction.positiveBody.id);
      if (reaction.negativeBody) pair(reaction.joint.id, reaction.negativeBody.id);
    }
    return { linksByJoint, jointsByLink };
  }

  private static incidentBodies(joint: RealJoint, bodies: Link[]): Link[] {
    const ordered: Link[] = [];
    const add = (body: Link | undefined): void => {
      if (body && !ordered.some((candidate) => candidate.id === body.id)) ordered.push(body);
    };
    joint.links.forEach((link) => add(bodies.find((body) => body.id === link.id)));
    bodies.forEach((body) => {
      if (body.joints.some((candidate) => candidate.id === joint.id)) add(body);
    });
    // A slot's carrier is reachable through neither route: Option A keeps it out
    // of the slider's `links` and keeps the slider out of the carrier's
    // `joints`, so without this the body on the far side of the slot is simply
    // missing from the joint's incidence.
    if (joint instanceof PrisJoint && joint.isFloating) {
      add(this.rootBody(bodies, joint.carrier));
    }
    return ordered;
  }

  /**
   * The first invalid mass, inertia, or force property, described by name —
   * or undefined when everything is a usable number. The panel shows this
   * sentence verbatim, so it has to say which part to go and fix.
   */
  private static invalidProperty(bodies: Link[], units: UnitFactors): string | undefined {
    if (!Object.values(units).every(Number.isFinite)) {
      return 'The unit conversion is invalid — reselect the global units.';
    }
    const nameOf = (body: Link): string => ('name' in body && body.name) || body.id;
    for (const body of bodies) {
      if (!Number.isFinite(body.mass) || body.mass < 0) {
        return `Link ${nameOf(body)} has a mass that is not a usable number. Set Link Mass in Mass Settings.`;
      }
      if (body instanceof RealLink) {
        if (!Number.isFinite(body.massMoI) || body.massMoI < 0) {
          return `Link ${nameOf(body)} has a moment of inertia that is not a usable number. Set it in Mass Settings.`;
        }
        for (const force of body.forces) {
          if (
            !Number.isFinite(force.mag) ||
            !Number.isFinite(force.angleRad) ||
            !Number.isFinite(force.startCoord.x) ||
            !Number.isFinite(force.startCoord.y)
          ) {
            return `The force on link ${nameOf(body)} has an invalid magnitude or position. Select it and re-enter its values.`;
          }
        }
      }
    }
    return undefined;
  }

  private static kinematicsAreComplete(
    bodies: Link[],
    kinematics?: FrameKinematics
  ): kinematics is FrameKinematics {
    if (!kinematics) return false;
    const vectorFinite = (value?: ForceVector): boolean => !!value && value.every(Number.isFinite);
    return bodies.every((body) => {
      if (body instanceof RealLink) {
        return (
          vectorFinite(kinematics.linkAccelerations.get(body.id)) &&
          Number.isFinite(kinematics.linkAngularAccelerations.get(body.id))
        );
      }
      return vectorFinite(kinematics.pistonAccelerations.get(body.id));
    });
  }

  private static captureCurrentKinematics(
    links: Link[],
    fallback?: FrameKinematics
  ): FrameKinematics {
    const captured: FrameKinematics = {
      linkAccelerations: new Map(),
      linkAngularAccelerations: new Map(),
      pistonAccelerations: new Map(),
    };
    const finiteVector = (value?: ForceVector): value is ForceVector =>
      !!value && value.every(Number.isFinite);

    for (const link of links) {
      if (link instanceof RealLink) {
        const acceleration = KinematicsSolver.linkAccMap.get(link.id);
        const angular = KinematicsSolver.linkAngAccMap.get(link.id);
        captured.linkAccelerations.set(
          link.id,
          finiteVector(acceleration) ? acceleration : fallback?.linkAccelerations.get(link.id)!
        );
        captured.linkAngularAccelerations.set(
          link.id,
          Number.isFinite(angular) ? angular! : fallback?.linkAngularAccelerations.get(link.id)!
        );
      } else if (link instanceof SliderBlock) {
        const movingJoint = link.joints.find((joint) => !(joint instanceof PrisJoint));
        const acceleration = movingJoint
          ? KinematicsSolver.jointAccMap.get(movingJoint.id)
          : undefined;
        captured.pistonAccelerations.set(
          link.id,
          finiteVector(acceleration) ? acceleration : fallback?.pistonAccelerations.get(link.id)!
        );
      }
    }
    return captured;
  }

  private static finiteDifferenceKinematics(
    mechanism: MechanismFrames,
    frameCount: number
  ): FrameKinematics[] {
    const frames = Array.from({ length: frameCount }, (): FrameKinematics => ({
      linkAccelerations: new Map(),
      linkAngularAccelerations: new Map(),
      pistonAccelerations: new Map(),
    }));
    if (frameCount === 0) return frames;

    const rawTimes = Array.from(
      { length: frameCount },
      (_, index) => mechanism.timeNum[index] ?? index
    );
    const times: number[] = [];
    rawTimes.forEach((time, index) => {
      const previous = times[index - 1] ?? -1;
      times.push(Number.isFinite(time) && time > previous ? time : previous + 1);
    });
    const ids = new Set(mechanism.links.flatMap((links) => links.map((link) => link.id)));

    for (const id of ids) {
      const bodyAt = (index: number): Link | undefined =>
        mechanism.links[index]?.find((link) => link.id === id);
      const positions = Array.from({ length: frameCount }, (_, index): ForceVector => {
        const body = bodyAt(index);
        if (body instanceof RealLink) return [body.CoM.x, body.CoM.y];
        if (body instanceof SliderBlock) {
          const moving = body.joints.find((joint) => !(joint instanceof PrisJoint));
          return [moving?.x ?? 0, moving?.y ?? 0];
        }
        return [0, 0];
      });
      const angles = this.unwrapAngles(
        Array.from({ length: frameCount }, (_, index) => {
          const body = bodyAt(index);
          if (!(body instanceof RealLink) || body.joints.length < 2) return 0;
          return Math.atan2(
            body.joints[1].y - body.joints[0].y,
            body.joints[1].x - body.joints[0].x
          );
        })
      );

      for (let index = 0; index < frameCount; index++) {
        const body = bodyAt(index);
        const ax = this.secondDerivative(
          positions.map((position) => position[0]),
          times,
          index
        );
        const ay = this.secondDerivative(
          positions.map((position) => position[1]),
          times,
          index
        );
        if (body instanceof RealLink) {
          frames[index].linkAccelerations.set(id, [ax, ay]);
          frames[index].linkAngularAccelerations.set(
            id,
            this.secondDerivative(angles, times, index)
          );
        } else if (body instanceof SliderBlock) {
          frames[index].pistonAccelerations.set(id, [ax, ay]);
        }
      }
    }
    return frames;
  }

  private static secondDerivative(values: number[], times: number[], index: number): number {
    // Fewer than three samples cannot support a finite-difference acceleration;
    // report NaN so the frame surfaces as missing-kinematics rather than an
    // unfounded zero.
    if (values.length < 3) return Number.NaN;
    const center = Math.min(Math.max(index, 1), values.length - 2);
    const t0 = times[center - 1];
    const t1 = times[center];
    const t2 = times[center + 1];
    const d01 = t0 - t1;
    const d02 = t0 - t2;
    const d10 = t1 - t0;
    const d12 = t1 - t2;
    const d20 = t2 - t0;
    const d21 = t2 - t1;
    if ([d01, d02, d10, d12, d20, d21].some((value) => Math.abs(value) < 1e-15)) {
      return Number.NaN;
    }
    return (
      (2 * values[center - 1]) / (d01 * d02) +
      (2 * values[center]) / (d10 * d12) +
      (2 * values[center + 1]) / (d20 * d21)
    );
  }

  private static unwrapAngles(values: number[]): number[] {
    if (values.length === 0) return values;
    const result = [values[0]];
    for (let index = 1; index < values.length; index++) {
      let delta = values[index] - values[index - 1];
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      result.push(result[index - 1] + delta);
    }
    return result;
  }

  private static unitFactors(unit: string): UnitFactors {
    return siUnitFactors(unit);
  }

  /**
   * The minimum-norm solution of a rank-deficient but consistent system.
   *
   * Through the normal equations with a ridge small against the matrix,
   * (AᵀA + λI)x = Aᵀb, which tends to the minimum-norm solution as λ goes to
   * zero and is well posed at every λ. The residual is then measured against
   * the original system: consistent systems come back with one on the order
   * of λ, and a system the elimination refused for being contradictory rather
   * than redundant does not, and is refused here too.
   */
  private static evenestSolution(A: number[][], b: number[]): LinearSolution | undefined {
    const n = A.length;
    if (n === 0) return undefined;
    const scale = Math.max(...A.flatMap((row) => row.map(Math.abs)), 0);
    if (!(scale > 0)) return undefined;
    const ridge = scale * scale * 1e-12;
    const normal = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += A[k][i] * A[k][j];
        return i === j ? sum + ridge : sum;
      })
    );
    const rhs = Array.from({ length: n }, (_, i) => {
      let sum = 0;
      for (let k = 0; k < n; k++) sum += A[k][i] * b[k];
      return sum;
    });
    // Plain elimination, without the pivot floor the main solve applies: the
    // ridge is meant to be tiny against the matrix, and that floor would
    // refuse it as singular, which is the situation this exists to answer.
    const values = this.solvePositiveDefinite(normal, rhs);
    if (!values) return undefined;
    // Against the loads alone: the main solve's measure divides by the size
    // of the solution as well, and a pair of enormous cancelling reactions
    // would make an unbalanced load look balanced.
    let residualNorm = 0;
    let rhsNorm = 0;
    for (let row = 0; row < n; row++) {
      const calculated = A[row].reduce((sum, c, column) => sum + c * values[column], 0);
      residualNorm = Math.max(residualNorm, Math.abs(calculated - b[row]));
      rhsNorm = Math.max(rhsNorm, Math.abs(b[row]));
    }
    const residual = residualNorm / Math.max(rhsNorm, 1e-9);
    return { values, rank: n, residual, minPivot: 0 };
  }

  /** Gaussian elimination with partial pivoting, refusing only what is not finite. */
  private static solvePositiveDefinite(M: number[][], rhs: number[]): number[] | undefined {
    const n = M.length;
    const m = M.map((row, i) => [...row, rhs[i]]);
    for (let column = 0; column < n; column++) {
      let pivot = column;
      for (let row = column + 1; row < n; row++) {
        if (Math.abs(m[row][column]) > Math.abs(m[pivot][column])) pivot = row;
      }
      if (!(Math.abs(m[pivot][column]) > 0)) return undefined;
      if (pivot !== column) [m[column], m[pivot]] = [m[pivot], m[column]];
      for (let row = column + 1; row < n; row++) {
        const factor = m[row][column] / m[column][column];
        if (factor === 0) continue;
        for (let next = column; next <= n; next++) m[row][next] -= factor * m[column][next];
      }
    }
    const values = Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let value = m[row][n];
      for (let column = row + 1; column < n; column++) value -= m[row][column] * values[column];
      values[row] = value / m[row][row];
    }
    return values.every(Number.isFinite) ? values : undefined;
  }

  private static solveLinearSystem(A: number[][], b: number[]): LinearSolution | undefined {
    const n = A.length;
    if (n === 0 || b.length !== n || A.some((row) => row.length !== n)) return undefined;
    const matrix = A.map((row, index) => [...row, b[index]]);
    const scales = A.map((row) => Math.max(...row.map(Math.abs), 0));
    let rank = 0;
    let minPivot = Infinity;

    for (let column = 0; column < n; column++) {
      let pivotRow = -1;
      let pivotScore = -1;
      for (let row = column; row < n; row++) {
        const score = scales[row] === 0 ? 0 : Math.abs(matrix[row][column]) / scales[row];
        if (score > pivotScore) {
          pivotScore = score;
          pivotRow = row;
        }
      }
      // Near-toggle frames legitimately have small pivots and large reactions;
      // they solve, and the normalized residual judges the result. But a pivot
      // within SINGULAR_PIVOT_TOLERANCE of zero is a toggle pose seen through
      // round-off, and which browser's round-off must not decide the answer.
      if (
        pivotRow < 0 ||
        !Number.isFinite(matrix[pivotRow][column]) ||
        pivotScore < SINGULAR_PIVOT_TOLERANCE
      ) {
        return undefined;
      }
      minPivot = Math.min(minPivot, pivotScore);
      if (pivotRow !== column) {
        [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
        [scales[column], scales[pivotRow]] = [scales[pivotRow], scales[column]];
      }
      rank++;
      for (let row = column + 1; row < n; row++) {
        const factor = matrix[row][column] / matrix[column][column];
        matrix[row][column] = 0;
        for (let next = column + 1; next <= n; next++) {
          matrix[row][next] -= factor * matrix[column][next];
        }
      }
    }

    const values = Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let value = matrix[row][n];
      for (let column = row + 1; column < n; column++) {
        value -= matrix[row][column] * values[column];
      }
      values[row] = value / matrix[row][row];
    }
    if (!values.every(Number.isFinite)) return undefined;

    let residualNorm = 0;
    let matrixNorm = 0;
    let rhsNorm = 0;
    let solutionNorm = 0;
    for (let row = 0; row < n; row++) {
      const calculated = A[row].reduce(
        (sum, coefficient, column) => sum + coefficient * values[column],
        0
      );
      residualNorm = Math.max(residualNorm, Math.abs(calculated - b[row]));
      matrixNorm = Math.max(
        matrixNorm,
        A[row].reduce((sum, value) => sum + Math.abs(value), 0)
      );
      rhsNorm = Math.max(rhsNorm, Math.abs(b[row]));
      solutionNorm = Math.max(solutionNorm, Math.abs(values[row]));
    }
    const residual = residualNorm / Math.max(1, matrixNorm * solutionNorm + rhsNorm);
    return { values, rank, residual, minPivot };
  }
}
