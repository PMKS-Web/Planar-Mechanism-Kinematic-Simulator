import { Joint, PrisJoint, RealJoint, RevJoint } from '../joint';
import { Link, SliderBlock, RealLink, Shape } from '../link';
import { assignBodies, WORLD } from './bodies';
import { Force } from '../force';
import { PositionSolver, PositionSolverDriveState, PRISMATIC_INPUT_STEP } from './position-solver';
import { InstantCenter } from '../instant-center';
import { Loop, LoopSolver } from './loop-solver';
import { Coord } from '../coord';
import { KinematicsSolver } from './kinematic-solver';
import { ForceAnalysisMode, ForceAnalysisSeries, ForceSolver } from './force-solver';
import { roundNumber } from '../utils';
import { LBF_IN_PER_NEWTON_METER, LBF_PER_NEWTON } from '../unit-conversions';
import { MODEL_SCALE } from '../render-scale';

/**
 * Why a mechanism will not run. One of these, not a boolean, because the ways a
 * linkage fails call for quite different things to be done about them.
 */
export type MechanismFailure =
  | 'dangling-slider'
  | 'mobility'
  | 'not-driven'
  | 'nothing-can-move'
  | 'dead-position'
  | 'cycle-never-closes'
  | 'cylinder-has-no-travel';

export class Mechanism {
  private _failure: MechanismFailure | undefined;
  private _unusableCylinder: string | undefined;
  /** Joints the position ordering never reached, captured at the failure. */
  private _unreachableJoints: string[] = [];
  /**
   * How near the cycle came to closing before the solver gave up, in user
   * units. Captured at the failure so the panel can say whether the loop only
   * just misses or wanders wide.
   */
  private _cycleGap: number | undefined;
  private _joints: Joint[][] = [[]];
  private _links: Link[][] = [[]];
  private _forces: Force[][] = [[]];
  private _ics: InstantCenter[][] = [[]];
  private _timeNum: number[] = [];
  private _internalTriangleSimLinkMap = new Map<string, number[]>();
  private forceAnalysisCache = new Map<ForceAnalysisMode, ForceAnalysisSeries>();

  private _gravity: boolean;
  private _unit: string;
  private _dof: number;
  private _inputAngularVelocities: number[] = [];
  private _requiredLoops: Loop[] = [];
  private _driveState?: PositionSolverDriveState;
  private mechanismValid = true;

  constructor(
    joints: Joint[],
    links: Link[],
    forces: Force[],
    ics: InstantCenter[],
    gravity: boolean,
    unit: string,
    inputAngVel: number
  ) {
    joints.forEach((j) => {
      this._joints[0].push(this.cloneJointAt(j, j.x, j.y));
    });
    links.forEach((l) => {
      const linkJoints = l.joints.map((joint) => this._joints[0].find((j) => j.id === joint.id)!);
      switch (l.constructor) {
        case RealLink:
          if (!(l instanceof RealLink)) {
            return;
          }
          const realLink = new RealLink(
            l.id,
            linkJoints,
            l.mass,
            l.massMoI,
            new Coord(l.CoM.x, l.CoM.y),
            this.cloneLinkSubset(l.subset, this._joints[0], true),
            l
          );
          realLink.name = l.name;
          realLink.fill = l.fill;
          this.restoreLinkSubsetState(l.subset, realLink.subset);
          this._links[0].push(realLink);
          break;
        case SliderBlock:
          if (!(l instanceof SliderBlock)) {
            return;
          }
          const piston = new SliderBlock(l.id, linkJoints, l.mass);
          piston.name = l.name;
          this._links[0].push(piston);
          break;
      }
    });
    this.wireJointGraph(0, joints);
    forces.forEach((f) => {
      const link = this._links[0].find((candidate) => candidate.id === f.link.id);
      if (!(link instanceof RealLink)) {
        return;
      }
      const force = new Force(f.id, link, f.startCoord, f.endCoord, f.local, f.arrowOutward, f.mag);
      force.name = f.name;
      this._forces[0].push(force);
    });
    Force.normalizeVisualWidths(this._forces[0]);
    this.attachForcesToLinks(0);
    // joints.forEach(j => { this._joints[0].push(j); });
    // links.forEach(l => { this._links[0].push(l); });
    // forces.forEach(f => { this._forces[0].push(f); });
    // ics.forEach(ic => { this._ics[0].push(ic); });
    this._gravity = gravity;
    this._unit = unit;
    this._dof = this.determineDegreesOfFreedom();
    this._inputAngularVelocities.push(inputAngVel);
    // no index found for input Joint
    // A dangling slider has a block and no direction for it to slide along, so
    // there is no constraint to solve and no honest number to report. Refusing
    // here rather than downstream keeps every solver from having to guess what
    // an absent slot line means (§4.1).
    const dangling = this._joints[0].some(
      (joint) => joint instanceof PrisJoint && joint.isDangling
    );
    const driven = this._joints[0].some((j) => j instanceof RealJoint && j.input);
    // Ordered the way the fixes depend on each other, because this is also the
    // order the panel reports them in: a slider with nothing to slide along has
    // no mobility worth counting, and adding an input to a linkage whose
    // mobility is wrong will not make it run.
    if (dangling) {
      this.setMechanismInvalid('dangling-slider');
    } else if (this._dof !== 1) {
      this.setMechanismInvalid('mobility');
    } else if (!driven) {
      this.setMechanismInvalid('not-driven');
    } else {
      this._requiredLoops = LoopSolver.determineLoops(this._joints[0], this._links[0]);
      this.findFullMovementPos(inputAngVel);
      // The solver's static holds what *this* build found; read it now, before
      // the next mechanism's build resets and overwrites it.
      this._unusableCylinder = PositionSolver.unusableCylinderDrive;
      // For the same reason, and for anything that differentiates this
      // mechanism after every other one has been solved over the top of it.
      // Built here rather than on demand: it is derived from a dozen more of
      // the same statics, and by the time a graph asks they belong elsewhere.
      PositionSolver.ensureSimultaneousSystem(this._joints[0], this._links[0]);
      this._driveState = PositionSolver.captureDriveState();
      // A sealed cylinder with no stroke emits no steps, so the failure above
      // is already recorded -- as "nothing can move", which is true but says
      // nothing a student can act on. Name the ram instead.
      if (this._unusableCylinder !== undefined && !this.mechanismValid) {
        this._failure = 'cylinder-has-no-travel';
      }
    }
  }

  /** Copy a joint's concrete type and analysis-relevant state at a new position. */
  private cloneJointAt(source: Joint, x: number, y: number): Joint {
    let copy: Joint;
    if (source instanceof PrisJoint) {
      const prisJoint = new PrisJoint(source.id, x, y, source.input, source.ground);
      prisJoint.angle_rad = source.angle_rad;
      prisJoint.isSealed = source.isSealed;
      // Points at the editable objects for now; wireJointGraph rebinds it to
      // this timestep's copies once they exist.
      if (source.carrier && source.slotJointA && source.slotJointB) {
        prisJoint.slideOn(source.carrier, source.slotJointA, source.slotJointB);
      }
      copy = prisJoint;
    } else if (source instanceof RevJoint) {
      copy = new RevJoint(source.id, x, y, source.input, source.ground);
    } else if (source instanceof RealJoint) {
      copy = new RealJoint(source.id, x, y, source.input, source.ground);
    } else {
      copy = new Joint(source.id, x, y);
    }
    copy.name = source.name;
    if (copy instanceof RealJoint && source instanceof RealJoint) {
      copy.showCurve = source.showCurve;
      copy.isWelded = source.isWelded;
    }
    return copy;
  }

  /** Connect timestep joints only to link/joint instances from that timestep. */
  private wireJointGraph(timestep: number, sources: Joint[]): void {
    const joints = this._joints[timestep];
    const links = this._links[timestep];
    for (const joint of joints) {
      if (!(joint instanceof RealJoint)) {
        continue;
      }
      const source = sources.find((candidate) => candidate.id === joint.id);
      if (!(source instanceof RealJoint)) {
        continue;
      }
      joint.links = source.links
        .map((link) => links.find((candidate) => candidate.id === link.id))
        .filter((link): link is Link => link !== undefined);
      joint.connectedJoints = source.connectedJoints
        .map((connected) => joints.find((candidate) => candidate.id === connected.id))
        .filter((connected): connected is Joint => connected !== undefined);
      // A slot's carrier and defining joints live outside links/connectedJoints
      // (§2.3 Option A), so nothing above reaches them. Left unrebound they
      // would keep pointing at the editable mechanism and every timestep would
      // measure the same, un-moving slot.
      if (joint instanceof PrisJoint) {
        joint.rebindSlot(links, joints);
      }
    }
  }

  /** Copy welded constituent links onto the current timestep's joint graph. */
  private cloneLinkSubset(
    sources: Link[],
    targetJoints: Joint[],
    copyVisualGeometry = false
  ): Link[] {
    return sources.flatMap((source) => {
      const joints = source.joints
        .map((joint) => targetJoints.find((candidate) => candidate.id === joint.id))
        .filter((joint): joint is Joint => joint !== undefined);
      if (joints.length !== source.joints.length) {
        return [];
      }
      if (source instanceof RealLink) {
        const link = new RealLink(
          source.id,
          joints,
          source.mass,
          source.massMoI,
          this.transportPoint(source.CoM, source.joints, joints),
          this.cloneLinkSubset(source.subset, targetJoints, copyVisualGeometry),
          copyVisualGeometry ? source : undefined
        );
        link.name = source.name;
        link.fill = source.fill;
        return [link];
      }
      if (source instanceof SliderBlock) {
        const piston = new SliderBlock(source.id, joints, source.mass);
        piston.name = source.name;
        return [piston];
      }
      return [];
    });
  }

  /** Restore state that compound-path rendering recomputes on constituent links. */
  private restoreLinkSubsetState(sources: Link[], targets: Link[]): void {
    for (const source of sources) {
      const target = targets.find((candidate) => candidate.id === source.id);
      if (!target) {
        continue;
      }
      target.mass = source.mass;
      target.name = source.name;
      if (source instanceof RealLink && target instanceof RealLink) {
        target.massMoI = source.massMoI;
        target.CoM = this.transportPoint(source.CoM, source.joints, target.joints);
        target.fill = source.fill;
        this.restoreLinkSubsetState(source.subset, target.subset);
      }
    }
  }

  /** Transport a link-fixed point from its initial pose to a simulated pose. */
  private transportPoint(point: Coord, sourceJoints: Joint[], targetJoints: Joint[]): Coord {
    if (sourceJoints.length < 2 || targetJoints.length < 2) {
      return new Coord(point.x, point.y);
    }
    const [sourceA, sourceB] = sourceJoints;
    const [targetA, targetB] = targetJoints;
    const sourceX = sourceB.x - sourceA.x;
    const sourceY = sourceB.y - sourceA.y;
    const sourceLength = Math.hypot(sourceX, sourceY);
    const targetX = targetB.x - targetA.x;
    const targetY = targetB.y - targetA.y;
    const targetLength = Math.hypot(targetX, targetY);
    if (sourceLength === 0 || targetLength === 0) {
      return new Coord(point.x, point.y);
    }
    const relativeX = point.x - sourceA.x;
    const relativeY = point.y - sourceA.y;
    const along = (relativeX * sourceX + relativeY * sourceY) / sourceLength;
    const normal = (-relativeX * sourceY + relativeY * sourceX) / sourceLength;
    const targetUnitX = targetX / targetLength;
    const targetUnitY = targetY / targetLength;
    return new Coord(
      targetA.x + along * targetUnitX - normal * targetUnitY,
      targetA.y + along * targetUnitY + normal * targetUnitX
    );
  }

  /** Ensure every link references only force instances from the same timestep. */
  private attachForcesToLinks(timestep: number): void {
    for (const link of this._links[timestep]) {
      link.forces = this._forces[timestep].filter((force) => force.link.id === link.id);
    }
  }

  /** Joints represented by the force solver (tracer joints have no reaction unknown). */
  private isForceAnalysisJoint(joint: Joint): joint is RealJoint {
    return joint instanceof RealJoint && (joint.links.length !== 1 || joint.ground);
  }

  /**
   * Map every link to the rigid body it belongs to.
   *
   * Two links pinned to each other at two or more shared joints cannot move
   * relative to each other — the second pin constrains nothing the first did
   * not already, so it is redundant. Gruebler's equation has no way to know
   * that and subtracts for it anyway, reporting a mobility one lower than the
   * assembly actually has. Users hit this by drawing a coupler as two
   * overlapping links (or by welding one across a pair of joints another link
   * already spans): a perfectly ordinary four-bar then counts as DOF 0 and
   * refuses to simulate. Collapsing such links into one body before counting
   * removes the paradox.
   */
  /**
   * steps to determine DOF (Gruebler's Criteron with Exceptions):
   1.determine number of links + ground
   1a. Links sharing two or more joints are one rigid body (see assignBodies)
   2.determine number of ground joints
   3.determine number of slider joints
   *
   * What a joint *costs* is one less than the number of bodies it holds
   * together, which is what makes a bar pinned to ground at both ends cost
   * nothing: only one body meets at each of its ends, and that body is the
   * world.
   */
  determineDegreesOfFreedom() {
    const { bodyOf, bodiesAt } = assignBodies(this.joints[0], this.links[0]);

    const hasGround = this.joints[0].some((j) => j instanceof RealJoint && j.ground);
    if (!hasGround) {
      return NaN;
    }

    const bodies = new Set(this.links[0].map(bodyOf));
    bodies.add(WORLD);
    const N = bodies.size;
    let J1 = 0;
    const J2 = 0;
    this.joints[0].forEach((j) => {
      if (!(j instanceof RealJoint)) {
        return;
      }
      J1 += Math.max(bodiesAt(j).size - 1, 0);
    });
    return 3 * (N - 1) - 2 * J1 - J2;
  }

  private findFullMovementPos(inputAngVel: number) {
    let simForward = true;
    let falseTwice = 0;
    let inputAngVelDirection = inputAngVel > 0;
    let currentTimeStamp = 0;
    const TOLERANCE = 0.008;
    let curTimeNum = 0;
    // PositionSolver.incrementRevInput steps the crank by exactly one degree, so a
    // fully rotating revolute input closes its cycle after exactly this many samples.
    // Ending on that count instead of on a position tolerance keeps the sample count
    // — and therefore the t=0 pose — identical every time the mechanism is rebuilt.
    const STEPS_PER_REVOLUTION = 360;
    const inputJoint = this.joints[0].find((j) => j instanceof RealJoint && j.input);
    const revoluteInput = inputJoint !== undefined && !(inputJoint instanceof PrisJoint);
    // An input that cannot go round reverses instead, and only the
    // return-to-start tolerance can tell us where its cycle ends.
    let reversals = 0;
    const angularSpeed = Math.abs(inputAngVel);
    PositionSolver.resetStaticVariables();
    PositionSolver.determineJointOrder(this.joints[0], this.links[0]);
    // Before anything is measured from t = 0, put t = 0 on its own constraints.
    PositionSolver.settleInitialPose(this.joints[0]);
    PositionSolver.setUpSolvingForces(this.forces[0]);

    // How far one sample advances the input: a degree of crank for a revolute
    // input, a length along the slot for a prismatic one. Dividing by the
    // speed turns that into the seconds each sample spans, so the two have to
    // be measured in the same units -- a prismatic input's speed is length per
    // second, and using the rotational step against it put playback and the
    // reported cycle time on a clock unrelated to the speed that was asked for.
    //
    // A driven cylinder knows its own travel and asks for a step that cuts it
    // into a fixed number of samples, so a short part is not animated in six
    // frames and a long one in six hundred. Anything else prismatic keeps the
    // fixed step, having no end of travel to divide.
    const sampleStep = revoluteInput
      ? Math.PI / 180
      : (PositionSolver.drivenSampleStep ?? PRISMATIC_INPUT_STEP);
    // Time always moves forward, including across a rocking mechanism's
    // direction reversal. At zero speed retain finite sample coordinates so
    // static-equivalent dynamic results can still be plotted and exported.
    let timeNumIncrement = angularSpeed > Number.EPSILON ? sampleStep / angularSpeed : sampleStep;

    const connectedJointMapIndices = new Map<string, number[]>();
    this.links[0].forEach((l) => {
      const numArray: number[] = [];
      l.joints.forEach((j) => {
        const jointIndex = this.joints[0].findIndex((jt) => jt.id === j.id);
        numArray.push(jointIndex);
      });
      connectedJointMapIndices.set(l.id, numArray);
    });

    const desiredJointID = PositionSolver.jointNumOrderSolverMap.get(1)?.[0];
    const desiredJointIndex = this.joints[0].findIndex((j) => j.id === desiredJointID);
    if (desiredJointIndex === -1) {
      // The ordering emitted no steps at all, so nothing in this mechanism can
      // move. Returning quietly left it *reporting itself valid* with a single
      // frame: the play button enabled, nothing happening, and the panel with
      // nothing to say about why.
      this._unreachableJoints = [...PositionSolver.unsolvableJoints];
      this.setMechanismInvalid('nothing-can-move');
      return;
    }
    const desiredJoint = this.joints[0][desiredJointIndex];
    const startingPositionX = desiredJoint.x;
    const startingPositionY = desiredJoint.y;
    let xDiff = Math.abs(startingPositionX - Math.round(desiredJoint.x * 100) / 100);
    let yDiff = Math.abs(startingPositionY - Math.round(desiredJoint.y * 100) / 100);
    this._timeNum.push(curTimeNum);

    // A reversing input passes through its starting pose twice: once on the way
    // back from the first limit, and again after the second. Stopping at the
    // first crossing precomputes half the motion — for a cylinder, whichever
    // fraction of its stroke happened to lie on one side of where it was drawn.
    // The cycle is closed only once both limits have been reached and the
    // mechanism is home again.
    const cycleIncomplete = () =>
      revoluteInput && reversals === 0
        ? currentTimeStamp < STEPS_PER_REVOLUTION
        : reversals < 2 || xDiff > TOLERANCE || yDiff > TOLERANCE;

    while (!simForward || currentTimeStamp === 0 || cycleIncomplete()) {
      const possible = PositionSolver.determinePositionAnalysis(
        this._joints[currentTimeStamp],
        this._links[currentTimeStamp],
        this._forces[currentTimeStamp],
        inputAngVelDirection
      );
      if (possible) {
        this._joints.push([]);
        this._links.push([]);
        this._forces.push([]);
        // Joint order matters at the moment
        this.joints[0].forEach((j) => {
          const jointCoord = PositionSolver.jointMapPositions.get(j.id)!;
          this._joints[currentTimeStamp + 1].push(
            this.cloneJointAt(j, jointCoord[0], jointCoord[1])
          );
        });
        // TODO: Redo the logic here
        this.links[0].forEach((l, l_index) => {
          let connectedJointIndices: number[];
          let connectedJoints: Joint[] = [];
          connectedJointIndices = connectedJointMapIndices.get(l.id)!;
          connectedJointIndices.forEach((ji: number) => {
            connectedJoints.push(this._joints[currentTimeStamp + 1][ji]);
          });
          switch (l.constructor) {
            case RealLink:
              if (!(l instanceof RealLink)) {
                return;
              }
              const pushLink = new RealLink(
                l.id,
                connectedJoints,
                l.mass,
                l.massMoI,
                this.transportPoint(l.CoM, l.joints, connectedJoints),
                this.cloneLinkSubset(l.subset, this._joints[currentTimeStamp + 1], true),
                l
              );
              pushLink.name = l.name;
              pushLink.fill = l.fill;
              this.restoreLinkSubsetState(l.subset, pushLink.subset);
              this._links[currentTimeStamp + 1].push(pushLink);
              break;
            case SliderBlock:
              if (!(l instanceof SliderBlock)) {
                return;
              }
              const newLink = new SliderBlock(l.id, connectedJoints, l.mass);
              newLink.name = l.name;
              this._links[currentTimeStamp + 1].push(newLink);
              break;
          }
        });
        this.wireJointGraph(currentTimeStamp + 1, this.joints[0]);
        // TODO: If forces are a part of links, is all of this info needed? Or just the positions?
        this.forces[0].forEach((f) => {
          const link = this._links[currentTimeStamp + 1].find((l) => l.id === f.link.id);
          if (link === undefined || !(link instanceof RealLink)) {
            return;
          }
          const start = this.transportPoint(f.startCoord, f.link.joints, link.joints);
          const end = f.local
            ? this.transportPoint(f.endCoord, f.link.joints, link.joints)
            : new Coord(
                start.x + (f.endCoord.x - f.startCoord.x),
                start.y + (f.endCoord.y - f.startCoord.y)
              );
          const force = new Force(f.id, link, start, end, f.local, f.arrowOutward, f.mag);
          force.name = f.name;
          this._forces[currentTimeStamp + 1].push(force);
        });
        Force.normalizeVisualWidths(this._forces[currentTimeStamp + 1]);
        this.attachForcesToLinks(currentTimeStamp + 1);
        falseTwice = 0;
        currentTimeStamp++;
        if (curTimeNum + timeNumIncrement <= 0) {
          timeNumIncrement = timeNumIncrement * -1;
        }
        curTimeNum = curTimeNum + timeNumIncrement;
        this._timeNum.push(curTimeNum);
        this._inputAngularVelocities.push(inputAngVel);
      } else {
        if ((!simForward && currentTimeStamp === 0) || falseTwice === 2) {
          //If we are here, the mechnism is in a toggle point
          this.setMechanismInvalid('dead-position');
          return;
        }
        falseTwice += 1;
        reversals += 1;
        simForward = !simForward;
        inputAngVel = inputAngVel * -1;
        inputAngVelDirection = !inputAngVelDirection;
        // The joints are about to retrace their path, so the solver's record of
        // which way they were heading is now wrong.
        PositionSolver.clearMotionHistory();
      }
      xDiff = Math.abs(
        startingPositionX - roundNumber(this._joints[currentTimeStamp][desiredJointIndex].x, 2)
      );
      yDiff = Math.abs(
        startingPositionY - roundNumber(this._joints[currentTimeStamp][desiredJointIndex].y, 2)
      );
      if (currentTimeStamp === 750) {
        // How close it ever came to its starting pose, skipping the first few
        // frames where it is trivially still there. setMechanismInvalid wipes
        // the frames, so this is the last chance to measure.
        let nearest = Infinity;
        for (let frame = 30; frame < this._joints.length; frame++) {
          const joint = this._joints[frame]?.[desiredJointIndex];
          if (!joint) continue;
          nearest = Math.min(
            nearest,
            Math.hypot(joint.x - startingPositionX, joint.y - startingPositionY)
          );
        }
        this._cycleGap = Number.isFinite(nearest) ? nearest / MODEL_SCALE : undefined;
        this.setMechanismInvalid('cycle-never-closes');
        return;
      }
    }

    // Pin the closing sample to the analytic period 2*pi/|w| rather than to 360
    // accumulated float additions, so the reported cycle time scales exactly with
    // input speed and the last sample lines up with the first.
    if (revoluteInput && reversals === 0 && angularSpeed > Number.EPSILON) {
      this._timeNum[this._timeNum.length - 1] = (2 * Math.PI) / angularSpeed;
      // Closing at a fixed 360 steps assumes assembly-mode tracking held all the
      // way around; if it did not, the cycle no longer ends where it began and
      // the seam would otherwise be silent.
      if (xDiff > TOLERANCE || yDiff > TOLERANCE) {
        console.warn(
          `Cycle did not close: after one input revolution the reference joint is off by (${xDiff}, ${yDiff})`
        );
      }
    }
  }

  /** Seconds spanned by one full traversal of the precomputed motion. */
  get cyclePeriod(): number {
    return this._timeNum.length > 1 ? this._timeNum[this._timeNum.length - 1] : 0;
  }

  private setMechanismInvalid(cause: MechanismFailure) {
    // TODO: Set all of the joints, links, force, instant center positions as empty
    this.joints = [[]];
    this.links = [[]];
    this.forces = [[]];
    this.requiredLoops = [];
    this.mechanismValid = false;
    this._failure = cause;
  }

  public isMechanismValid(): boolean {
    return this.mechanismValid;
  }

  /**
   * Why this mechanism will not run, or undefined if it will.
   *
   * Four quite different situations used to arrive at the same false: a shape
   * nothing can move, a linkage locked at a dead position, a cycle that never
   * comes back to where it started, and a mobility that is simply not one. The
   * panel can only tell a student which of those they are looking at -- and so
   * what to do about it -- if the solver says which one it hit.
   */
  get failure(): MechanismFailure | undefined {
    return this._failure;
  }

  /**
   * The cylinder whose barrel is too short to slide in at all, if any.
   *
   * Captured here rather than read from the solver's static afterwards: with
   * several mechanisms built one after another, that static holds whatever the
   * last one found, so a good linkage would inherit the complaint of a bad one
   * built after it.
   */
  get unusableCylinder(): string | undefined {
    return this._unusableCylinder;
  }

  /** Joints the position ordering never reached, when nothing-can-move. */
  get unreachableJoints(): string[] {
    return this._unreachableJoints;
  }

  /** Nearest return to the starting pose in user units, when the cycle never closes. */
  get cycleGap(): number | undefined {
    return this._cycleGap;
  }

  get internalTriangleSimLinkMap(): Map<string, number[]> {
    return this._internalTriangleSimLinkMap;
  }

  set internalTriangleSimLinkMap(value: Map<string, number[]>) {
    this._internalTriangleSimLinkMap = value;
  }

  get dof(): number {
    return this._dof;
  }

  set dof(value: number) {
    this._dof = value;
  }

  get gravity(): boolean {
    return this._gravity;
  }

  set gravity(value: boolean) {
    this._gravity = value;
  }

  get unit(): string {
    return this._unit;
  }

  set unit(value: string) {
    this._unit = value;
  }

  /**
   * Put the shared solvers back on this mechanism's own constraints.
   *
   * `KinematicsSolver` and `PositionSolver` both keep their working state in
   * statics, which was fine when a drawing held one mechanism. It holds as many
   * as are drawn now, and every one of them is solved over the top of the last
   * -- so anything that comes back later to differentiate a particular one has
   * to say which one it means first. Cheap: three assignments and a reference.
   */
  prepareSolvers(): void {
    PositionSolver.restoreDriveState(this._driveState);
    KinematicsSolver.requiredLoops = this._requiredLoops;
  }

  get requiredLoops(): Loop[] {
    return this._requiredLoops;
  }

  set requiredLoops(value: Loop[]) {
    this._requiredLoops = value;
  }

  get joints(): Joint[][] {
    return this._joints;
  }

  get inputAngularVelocities(): number[] {
    return this._inputAngularVelocities;
  }

  set inputAngularVelocities(value: number[]) {
    this._inputAngularVelocities = value;
  }

  set joints(value: Joint[][]) {
    this._joints = value;
  }

  get timeNum(): number[] {
    return this._timeNum;
  }

  set timeNum(value: number[]) {
    this._timeNum = value;
  }

  get links(): Link[][] {
    return this._links;
  }

  set links(value: Link[][]) {
    this._links = value;
  }

  get forces(): Force[][] {
    return this._forces;
  }

  set forces(value: Force[][]) {
    this._forces = value;
  }

  get ics(): InstantCenter[][] {
    return this._ics;
  }

  set ics(value: InstantCenter[][]) {
    this._ics = value;
  }

  forceTitleRow(analysisType: string) {
    const forceTitleRow = new Array<string>();
    forceTitleRow.push('Current Time');
    let posUnit: string;
    let velUnit: string;
    let accUnit: string;
    let forceUnit: string;
    let torqueUnit: string;
    const angPosUnit = 'deg';
    const angVelUnit = 'rad/s';
    const angAccUnit = 'rad/s^2';
    switch (this._unit) {
      case 'cm':
        posUnit = 'cm';
        velUnit = 'cm/s';
        accUnit = 'cm/s^2';
        forceUnit = 'N';
        torqueUnit = 'N*m';
        break;
      case 'm':
        posUnit = 'm';
        velUnit = 'm/s';
        accUnit = 'm/s^2';
        forceUnit = 'N';
        torqueUnit = 'N*m';
        break;
      case 'in':
        posUnit = 'in';
        velUnit = 'in/s';
        accUnit = 'in/s^2';
        forceUnit = 'lbf';
        torqueUnit = 'lbf*in';
        break;
      default:
        return;
    }
    for (const joint of this.joints[0].filter((candidate) =>
      this.isForceAnalysisJoint(candidate)
    )) {
      forceTitleRow.push('Joint ' + joint.id + ' Force ' + ' x ' + '(' + forceUnit + ')');
      forceTitleRow.push('Joint ' + joint.id + ' Force ' + ' y ' + '(' + forceUnit + ')');
    }
    forceTitleRow.push('Torque ' + torqueUnit);
    forceTitleRow.push(' ');
    this.forces[0].forEach((f) => {
      forceTitleRow.push('Force ' + f.id + ' x ' + '(' + posUnit + ')');
      forceTitleRow.push('Force ' + f.id + ' y ' + '(' + posUnit + ')');
    });
    forceTitleRow.push(' ');
    switch (analysisType) {
      case 'statics':
        this.joints[0].forEach((j) => {
          forceTitleRow.push('Joint ' + j.id + ' x ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' y ' + '(' + posUnit + ')');
        });
        break;
      case 'dynamics':
        this.joints[0].forEach((j) => {
          forceTitleRow.push('Joint ' + j.id + ' x ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' y ' + '(' + posUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Vel x ' + '(' + velUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Vel y ' + '(' + velUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Acc x ' + '(' + accUnit + ')');
          forceTitleRow.push('Joint ' + j.id + ' Acc y' + '(' + accUnit + ')');
        });
        forceTitleRow.push(' ');
        this.links[0].forEach((l) => {
          if (l instanceof SliderBlock) {
            return;
          }
          forceTitleRow.push('Link ' + l.id + ' CoM x ' + posUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM y ' + posUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Vel x ' + velUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Vel y ' + velUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Acc x ' + accUnit);
          forceTitleRow.push('Link ' + l.id + ' CoM Acc y ' + accUnit);
        });
        forceTitleRow.push(' ');
        this.links[0].forEach((l) => {
          if (l instanceof SliderBlock) {
            return;
          }
          forceTitleRow.push('Link ' + l.id + ' angPos ' + angPosUnit);
          forceTitleRow.push('Link ' + l.id + ' angVel ' + angVelUnit);
          forceTitleRow.push('Link ' + l.id + ' angAcc ' + angAccUnit);
        });
        break;
    }

    return forceTitleRow;
  }

  /** One immutable force-analysis result is shared by every graph/export. */
  getForceAnalysis(mode: ForceAnalysisMode): ForceAnalysisSeries {
    let result = this.forceAnalysisCache.get(mode);
    if (!result) {
      result = ForceSolver.analyzeMechanism(this, mode);
      this.forceAnalysisCache.set(mode, result);
    }
    return result;
  }

  kinematicLoopTitleRow() {
    const kinematicTitleRow = new Array<string>();
    kinematicTitleRow.push('Current Time');
    let posUnit: string;
    let velUnit: string;
    let accUnit: string;
    const angPosUnit = 'degree';
    const angVelUnit = 'rad/s';
    const angAccUnit = 'rad/s^2';
    switch (this._unit) {
      case 'cm':
        posUnit = 'cm';
        velUnit = 'cm/s';
        accUnit = 'cm/s^2';
        break;
      case 'm':
        posUnit = 'm';
        velUnit = 'm/s';
        accUnit = 'm/s^2';
        break;
      case 'in':
        posUnit = 'in';
        velUnit = 'in/s';
        accUnit = 'in/s^2';
        break;
    }
    this.joints[0].forEach((j) => {
      kinematicTitleRow.push('Joint ' + j.id + ' x ' + posUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' y ' + posUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' vx ' + velUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' vy ' + velUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' ax ' + accUnit);
      kinematicTitleRow.push('Joint ' + j.id + ' ay ' + accUnit);
    });
    kinematicTitleRow.push(' ');
    this.links[0].forEach((l) => {
      if (l instanceof SliderBlock) {
        return;
      }
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'x ' + posUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'y ' + posUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'vx ' + velUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'vy ' + velUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'ax ' + accUnit);
      kinematicTitleRow.push('Link ' + l.id + ' CoM ' + 'ay ' + accUnit);
    });
    kinematicTitleRow.push(' ');
    this.links[0].forEach((l) => {
      if (l instanceof SliderBlock) {
        return;
      }
      kinematicTitleRow.push('Link ' + l.id + ' angle ' + angPosUnit);
      kinematicTitleRow.push('Link ' + l.id + ' angVel ' + angVelUnit);
      kinematicTitleRow.push('Link ' + l.id + ' angAcc ' + angAccUnit);
    });
    return kinematicTitleRow;
  }

  forceAnalysis(analysisType: string) {
    const forceAnalysis = new Array<Array<string>>();
    let forceUnitConversion: number;
    let torqueUnitConversion: number;
    let posUnitConversion: number;
    let velUnitConversion: number;
    let accUnitConversion: number;
    switch (this._unit) {
      case 'cm':
        forceUnitConversion = 1; // convert from newtons -> newton
        torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
        posUnitConversion = 1;
        velUnitConversion = 1;
        accUnitConversion = 1; // cm/s^2
        break;
      case 'm':
        forceUnitConversion = 1; // convert from newtons -> newton
        torqueUnitConversion = 1; // convert from newton_meter -> newton_centimeter
        posUnitConversion = 1;
        velUnitConversion = 1;
        accUnitConversion = 1; // cm/s^2
        break;
      case 'in':
        forceUnitConversion = LBF_PER_NEWTON;
        torqueUnitConversion = LBF_IN_PER_NEWTON_METER;
        posUnitConversion = 1;
        velUnitConversion = 1;
        accUnitConversion = 1;
        break;
    }
    ForceSolver.resetVariables();
    ForceSolver.determineDesiredLoopLettersForce(this.requiredLoops);
    if (analysisType === 'dynamics') {
      KinematicsSolver.resetVariables();
      // The inertia terms come from differentiating this mechanism, and the
      // solvers have been used by every other mechanism in the drawing since.
      this.prepareSolvers();
    }
    // Go through each step within the mechanism
    this.joints.forEach((_, index) => {
      const force_row = Array<string>();
      force_row.push(this.timeNum[index].toString());
      if (analysisType === 'dynamics') {
        // determine kinematic analysis
        KinematicsSolver.determineKinematics(
          this.joints[index],
          this.links[index],
          this.inputAngularVelocities[index]
        );
      }
      ForceSolver.determineForceAnalysis(
        this.joints[index],
        this.links[index],
        analysisType,
        this.gravity,
        this.unit
      );
      for (const joint of this.joints[index].filter((candidate) =>
        this.isForceAnalysisJoint(candidate)
      )) {
        const joint_id = joint.id;
        force_row.push(
          roundNumber(
            ForceSolver.unknownVariableForcesMap.get(joint_id)![0] * forceUnitConversion,
            4
          ).toString()
        );
        force_row.push(
          roundNumber(
            ForceSolver.unknownVariableForcesMap.get(joint_id)![1] * forceUnitConversion,
            4
          ).toString()
        );
      }
      force_row.push(
        roundNumber(ForceSolver.unknownVariableTorque * torqueUnitConversion, 4).toString()
      );
      force_row.push(' ');
      this.forces[index].forEach((f) => {
        force_row.push(roundNumber(f.startCoord.x, 4).toString());
        force_row.push(roundNumber(f.startCoord.y, 4).toString());
      });
      force_row.push(' ');
      switch (analysisType) {
        case 'statics':
          this.joints[index].forEach((j) => {
            force_row.push(roundNumber(j.x, 4).toString());
            force_row.push(roundNumber(j.y, 4).toString());
          });
          break;
        case 'dynamics':
          this.joints[index].forEach((j) => {
            force_row.push(roundNumber(j.x, 4).toString());
            force_row.push(roundNumber(j.y, 4).toString());
            force_row.push(
              roundNumber(
                KinematicsSolver.jointVelMap.get(j.id)![0] * velUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.jointVelMap.get(j.id)![1] * velUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.jointAccMap.get(j.id)![0] * accUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.jointAccMap.get(j.id)![1] * accUnitConversion,
                4
              ).toString()
            );
          });
          force_row.push(' ');
          this.links[index].forEach((l) => {
            if (l instanceof SliderBlock) {
              return;
            }
            force_row.push(
              roundNumber(
                KinematicsSolver.linkCoMMap.get(l.id)![0] * posUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.linkCoMMap.get(l.id)![1] * posUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.linkVelMap.get(l.id)![0] * velUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.linkVelMap.get(l.id)![1] * velUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.linkAccMap.get(l.id)![0] * accUnitConversion,
                4
              ).toString()
            );
            force_row.push(
              roundNumber(
                KinematicsSolver.linkAccMap.get(l.id)![1] * accUnitConversion,
                4
              ).toString()
            );
          });
          force_row.push(' ');
          this.links[index].forEach((l) => {
            if (l instanceof SliderBlock) {
              return;
            }
            force_row.push(roundNumber(KinematicsSolver.linkAngPosMap.get(l.id)!, 4).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAngVelMap.get(l.id)!, 4).toString());
            force_row.push(roundNumber(KinematicsSolver.linkAngAccMap.get(l.id)!, 4).toString());
          });
          break;
      }
      forceAnalysis.push(force_row);
    });
    return forceAnalysis;
  }

  kinematicLoopAnalysis() {
    const kinematicAnalysis = Array<Array<string>>();
    KinematicsSolver.resetVariables();
    this.prepareSolvers();
    this.joints.forEach((_, index) => {
      const row = Array<string>();
      row.push(this.timeNum[index].toString());
      KinematicsSolver.determineKinematics(
        this.joints[index],
        this.links[index],
        this.inputAngularVelocities[index]
      );
      let posUnitConversion: number;
      let velUnitConversion: number;
      let accUnitConversion: number;
      switch (this._unit) {
        case 'cm':
          posUnitConversion = 1; // cm
          velUnitConversion = 1; // cm/s
          accUnitConversion = 1; // cm/s^2
          break;
        case 'm':
          posUnitConversion = 1; // cm
          velUnitConversion = 1; // cm/s
          accUnitConversion = 1; // cm/s^2
          break;
      }

      this.joints[0].forEach((j) => {
        row.push(
          roundNumber(
            this.joints[index][KinematicsSolver.jointIndexMap.get(j.id)!].x * posUnitConversion,
            4
          ).toString()
        );
        row.push(
          roundNumber(
            this.joints[index][KinematicsSolver.jointIndexMap.get(j.id)!].y * posUnitConversion,
            4
          ).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.jointVelMap.get(j.id)![0] * velUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.jointVelMap.get(j.id)![1] * velUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.jointAccMap.get(j.id)![0] * accUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.jointAccMap.get(j.id)![1] * accUnitConversion, 4).toString()
        );
      });
      row.push(' ');
      this.links[0].forEach((l) => {
        if (l instanceof SliderBlock) {
          return;
        }
        row.push(
          roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![0] * posUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.linkCoMMap.get(l.id)![1] * posUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.linkVelMap.get(l.id)![0] * velUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.linkVelMap.get(l.id)![1] * velUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.linkAccMap.get(l.id)![0] * accUnitConversion, 4).toString()
        );
        row.push(
          roundNumber(KinematicsSolver.linkAccMap.get(l.id)![1] * accUnitConversion, 4).toString()
        );
      });
      row.push(' ');
      this.links[0].forEach((l) => {
        if (l instanceof SliderBlock) {
          return;
        }
        row.push(roundNumber(KinematicsSolver.linkAngPosMap.get(l.id)!, 4).toString());
        row.push(roundNumber(KinematicsSolver.linkAngVelMap.get(l.id)!, 4).toString());
        row.push(roundNumber(KinematicsSolver.linkAngAccMap.get(l.id)!, 4).toString());
      });
      kinematicAnalysis.push(row);
    });
    return kinematicAnalysis;
  }
}
