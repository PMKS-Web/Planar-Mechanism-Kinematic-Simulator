import { linkArtwork, schematicLink } from '../model/link-artwork';
import { cylinderJoints } from '../model/cylinder';
import { pickLink } from '../model/link-pick';
import { Injectable, Injector, inject } from '@angular/core';
import { HoldBar, HoldGoal, reachedByHolds, settleHolds } from '../model/hold-solver';
import {
  heldBars,
  heldBarsReaching,
  heldBySentence,
  holdJoints,
  holdOf,
} from '../model/link-holds';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { roundNumber, point_on_line_segment_closest_to_point } from '../model/utils';
import { Link, RealLink } from '../model/link';
import {
  JointOperationContext,
  OperationRefusal,
  refuseGround,
  refuseJointOperation,
} from '../model/joint-operation-permission';
import {
  EditPlan,
  EditRequest,
  Point,
  carryPoint,
  planEdit,
  snapshotOf,
} from '../model/cylinder-pose-plan';
import { NotificationService } from './notification.service';
import {
  Cylinder,
  CylinderHolds,
  CylinderPose,
  cylinderLengthsOf,
  isInsideCylinder,
  layoutCylinder,
  cylindersIn,
  stretchedCylinderPose,
} from '../model/cylinder';
import {
  CylinderEdit,
  CylinderEditContext,
  poseForBarrelLength,
  poseForCylinderAngle,
  poseForCylinderStart,
  poseForRodLength,
  poseForSealAt,
} from '../model/cylinder-edit';
import { SettingsService } from './settings.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { MechanismService } from './mechanism.service';
import { SelectedTabService } from '../selected-tab.service';
import { EditPermissionService } from './edit-permission.service';
import { canDrive } from '../model/actuator';
import { Lockable, frozenJointIds, locksHolding } from '../model/lock-set';
import { Coord } from '../model/coord';
import { constrainForceAnchor } from '../model/force-anchor';
import { PositionSolver } from '../model/mechanism/position-solver';
import { Force } from '../model/force';
import { Arc, Line } from '../model/line';
import { SynthesisPose } from './synthesis/synthesis-util';
import { SynthesisBuilderService } from './synthesis/synthesis-builder.service';
import { SvgGridService } from './svg-grid.service';
import { ColorService } from './color.service';

/**
 * Map a point from one two-joint frame to another, letting the frame stretch.
 *
 * A neighbor of a link drag is deformed rather than moved: its reference
 * joints change separation as well as direction. A rigid transform would hold
 * the load's absolute distance from the first joint and slide it off the end of
 * a shortened link, so the frame's scale has to come along too. That keeps the
 * load at the same point *of the link*, which is the invariant dragJoint
 * already preserves for a binary link.
 */
function pointThroughFrame(
  point: { x: number; y: number },
  fromStart: { x: number; y: number },
  fromEnd: { x: number; y: number },
  toStart: { x: number; y: number },
  toEnd: { x: number; y: number }
): [number, number] {
  const fromX = fromEnd.x - fromStart.x;
  const fromY = fromEnd.y - fromStart.y;
  const fromLengthSquared = fromX * fromX + fromY * fromY;
  if (fromLengthSquared === 0) {
    return [point.x + (toStart.x - fromStart.x), point.y + (toStart.y - fromStart.y)];
  }

  // The point in the frame's own basis: `along` the joint axis and `across` it.
  const relativeX = point.x - fromStart.x;
  const relativeY = point.y - fromStart.y;
  const along = (relativeX * fromX + relativeY * fromY) / fromLengthSquared;
  const across = (relativeY * fromX - relativeX * fromY) / fromLengthSquared;

  const toX = toEnd.x - toStart.x;
  const toY = toEnd.y - toStart.y;
  return [toStart.x + along * toX - across * toY, toStart.y + along * toY + across * toX];
}

/** A joint by the letter it wears, or the name somebody typed over it. */
function nameOfJoint(joint: { name?: string; id: string }): string {
  return joint.name || joint.id;
}

/**
 * How an edit that could not be fully honored says so (decision S19).
 *
 * The model knows how far it got and what stopped it; only the service knows
 * what the reader calls the thing that stopped and what its number reads as on
 * screen. That split is why this is a pair of callbacks rather than a sentence.
 */
interface StoppedShort {
  /** What stopped: `Barrel AB`, `Rod BC`, `Starts at`. */
  subject: string;
  /** The value reached, in the reader's own units. */
  say: (reached: number) => string;
}

@Injectable({
  providedIn: 'root',
})
export class GridUtilsService {
  private synthesisBuilder = inject(SynthesisBuilderService);
  svgGrid = inject(SvgGridService);
  private injector = inject(Injector);
  private notify = inject(NotificationService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);

  /**
   * MechanismService injects this service, so it can only be resolved at call
   * time — the same cycle-breaking the codebase already uses in MechanismService
   * and UrlProcessorService.
   */
  private get mechanismSrv(): MechanismService {
    return this.injector.get(MechanismService);
  }

  /** At call time for the same reason: SelectedTabService injects the mechanism. */
  private get tabService(): SelectedTabService {
    return this.injector.get(SelectedTabService);
  }

  /**
   * Whether a state out of the history may replace the drawing right now.
   *
   * Both surfaces that offer undo — the top bar's buttons and the keyboard
   * shortcut — quote this, so they cannot answer differently. They used to:
   * the buttons grayed while the mechanism was animating, the shortcut did
   * not, and in the window where the mechanism is paused away from timestep 0
   * Ctrl+Z replayed a URL under a displaced pose beside two grayed buttons
   * that refused to. It lives here, on a service both can reach, rather than
   * on either of them.
   */
  canRestoreHistory(): boolean {
    return this.injector.get(EditPermissionService).may('history');
  }

  //Return a boolean, is this link a ground link?
  getGround(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    return joint.ground;
  }

  createRealLink(id: string, joints: Joint[]) {
    let newLink = new RealLink(id, joints);
    newLink.fill = ColorService.instance.getNextLinkColor();
    return newLink;
  }

  /**
   * How big this joint's marker is drawn.
   *
   * Every joint, not only a pin. A slider was drawn at the coincident
   * `RevJoint` riding it and the prismatic joint itself was never marked, so
   * answering zero for one was right; the slider is the joint a reader sees and
   * grabs now (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), and zero
   * would leave it with no marker and no hitbox at its own center.
   */
  getJointR(joint: Joint) {
    if (!(joint instanceof RealJoint)) {
      return 0;
    }
    return joint.r;
  }

  getJointShowCurve(joint: Joint) {
    if (!(joint instanceof RevJoint) && !(joint instanceof PrisJoint)) {
      return false;
    }
    return joint.showCurve;
  }

  getInput(joint: Joint) {
    if (!(joint instanceof RevJoint || joint instanceof PrisJoint)) {
      return;
    }
    return joint.input;
  }

  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
      default:
        return '?';
    }
  }

  typeOfLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
      default:
        return '?';
    }
  }

  getPrisAngle(joint: Joint) {
    return (joint as PrisJoint).angle_rad;
  }

  /**
   * Whether the Input control may be used on this joint.
   *
   * Lives here so the Edit panel and the right-click menu ask the same
   * question. They had drifted: the menu still grayed Ground out on a slider
   * and Weld out on a joint the reconciler would refuse, both of which the
   * panel deliberately stopped doing in §4.1 — Ground and Slider are
   * independent axes of the 2x2 now, and a refusal is explained rather than
   * hidden. Two surfaces onto one model that disagree about what is possible
   * are worse than either rule on its own.
   */
  canToggleInput(joint: Joint): boolean {
    // A floating pin is drivable now (§2.9, Phase 6): driving it prescribes the
    // relative angle between the two bodies that meet there, which is a
    // perfectly good input as long as exactly two of them do. The control stays
    // *enabled* where three meet, so the refusal is explained rather than
    // hidden -- the same rule Ground and Slider follow.
    if (!(joint instanceof RealJoint)) {
      return false;
    }
    // Always enabled to turn *off*: the same control is how an input is removed,
    // and a joint an edit has since made undrivable is exactly the one a user
    // most needs to be able to un-drive.
    //
    // Asked of the joint itself. A slider's drive lived on the prismatic half
    // of a coincident pair while the panel and the menu were pointed at the
    // pin, so this had to make the hop first; one joint carries both now.
    return joint.input || canDrive(joint);
  }

  /**
   * Whether the Weld control may be used on this joint, shared by the Edit
   * panel's toggle and the right-click menu so the two cannot drift.
   *
   * Structural rule only: a weld fuses what meets at a joint, so a joint with
   * fewer than two links — a tracer, a bar's free end — has nothing to fuse and
   * the control is grayed rather than offered-then-refused. A grounded or
   * driven joint keeps the enabled control and gets the model's refusal with
   * its reason (§4.1's explained-refusal rule); an already-welded joint stays
   * enabled because the same control is how it is unwelded.
   */
  canToggleWeld(joint: Joint): boolean {
    return this.weldRefusal(joint) === undefined;
  }

  /**
   * Why Weld is grayed on this joint, short and long.
   *
   * Both directions through one model: the control that welds is the control
   * that unwelds, so it asks about whichever way it would actually go. The
   * rule itself lives in `model/joint-operation-permission.ts`, which the menu,
   * the panel, the group edit and the mutation all read, so a row cannot be
   * grayed for a reason nothing enforces or offered against one that is.
   */
  weldRefusal(joint: Joint): { short: string; long: string } | undefined {
    // The same two facts `jointTypeAt` reads: a Slide says it in `rotates` on
    // the sliding joint, every other joint says it in `isWelded`. They were one
    // bit before a slider became one joint, when the weld sat on the coincident
    // pin -- so asking `isWelded` of a slider now offers Weld on a Slide.
    const welded =
      joint instanceof PrisJoint ? !joint.rotates : joint instanceof RealJoint && joint.isWelded;
    return refuseJointOperation(joint, welded ? 'unweld' : 'weld', this.operationContext());
  }

  /**
   * Why Grounded is grayed on this joint, short and long.
   *
   * The one place that answers it, so the menu row, the Edit panel's switch and
   * `MechanismService.toggleGround` cannot disagree about a cylinder's seal.
   */
  groundRefusal(joint: Joint | undefined): OperationRefusal | undefined {
    return refuseGround(joint, this.operationContext());
  }

  /** Whether this joint may gain or lose a sliding block, and why not. */
  sliderRefusal(joint: Joint, wanted: boolean): { short: string; long: string } | undefined {
    return refuseJointOperation(
      joint,
      wanted ? 'add-slider' : 'remove-slider',
      this.operationContext()
    );
  }

  /**
   * The facts the permission model cannot work out for itself.
   *
   * A slider's input lives on its guide rather than on the pin riding it, and
   * this service is where that is already settled — so it is handed over
   * rather than derived a second time.
   */
  operationContext(): JointOperationContext {
    return {
      cylinders: this.mechanismSrv.sealedStructures(),
      isDriven: (joint) => this.isVisuallyInput(joint),
      hasSlider: (joint) => this.isAttachedToSlider(joint),
    };
  }

  /**
   * The joints the current Lock marks hold still, so every asker (the drag
   * gates, the canvas paint, the panel) reads the same answer.
   *
   * Through the service's cache rather than re-deriving: the closure walks
   * every body and every sealed assembly, and the canvas asks it several times
   * per joint on every change detection pass.
   */
  /**
   * What the last move against a hold could not do, for the canvas to say.
   *
   * Cleared by every move the holds allowed. `immovable` names the joints the
   * holds leave no freedom at all; `bars` are the holds involved, nearest to
   * the asked joint first, which is what a Release action lets go of.
   */
  lastHoldRefusal?: {
    immovable: RealJoint[];
    bars: RealLink[];
    shortfall: number;
    /** False when the ask is simply beyond reach rather than the joint being fixed. */
    satisfied: boolean;
  };

  /**
   * Put the asked-for joints where the holds allow, moving what the holds
   * require with them.
   *
   * Returns nothing when no hold reaches any of the asks, in which case nothing
   * was written and the caller moves the joints itself as it always did.
   * Otherwise the holds answered: every joint they reach is written, the ids
   * of those joints are returned so the caller can move the rest itself, and
   * `lastHoldRefusal` says what, if anything, could not be granted.
   */
  settleHolds(goals: readonly HoldGoal[]): Set<string> | undefined {
    // Every ask starts clean. A refusal that stood from an earlier move used
    // to survive the bars being unlocked, because a drawing with no holds
    // returns here before anything below could clear it -- and the canvas
    // went on reporting a limit that no longer existed.
    this.lastHoldRefusal = undefined;
    const links = this.mechanismSrv.links;
    const cylinders = this.mechanismSrv.sealedStructures();
    const bars = heldBars(links, cylinders);
    if (bars.length === 0) return undefined;
    const asked = goals.map((goal) => this.mechanismSrv.joints.find((j) => j.id === goal.id));
    const reached = reachedByHolds(
      goals.map((goal) => goal.id),
      bars
    ).joints;
    if (!reached.size || !bars.some((bar) => reached.has(bar.a))) return undefined;
    const frozen = this.frozenJointIds();
    // A grounded joint anchors the others, not itself: in Edit a ground pin
    // is dragged like any other, and the bar it is on follows.
    const moving = new Set(goals.map((goal) => goal.id));
    const joints = holdJoints(this.mechanismSrv.joints, (joint) =>
      this.holdAnchor(joint, frozen, moving)
    );
    const solved = settleHolds(joints, bars, goals);
    // An ask no configuration satisfies is refused whole: the half-settled
    // positions the sweep stopped in have a hold or two false in them, and
    // writing those is how a locked length came to change under a drag.
    if (solved.satisfied) {
      solved.positions.forEach((at, id) => {
        const joint = this.mechanismSrv.joints.find((j) => j.id === id);
        if (joint instanceof RealJoint) this.dragJoint(joint, new Coord(at.x, at.y), false, true);
      });
    }
    const immovable = solved.immovable
      .map((id) => this.mechanismSrv.joints.find((j) => j.id === id))
      .filter((joint): joint is RealJoint => joint instanceof RealJoint);
    const refused = immovable.length > 0 || !solved.satisfied;
    this.lastHoldRefusal = refused
      ? {
          immovable,
          bars: asked
            .filter((joint): joint is Joint => joint !== undefined)
            .flatMap((joint) => heldBarsReaching(joint, links, cylinders))
            .filter((bar, index, all) => all.indexOf(bar) === index),
          shortfall: solved.shortfall,
          satisfied: solved.satisfied,
        }
      : undefined;
    return reached;
  }

  /**
   * Give a bar a typed length or angle, as a constraint rather than a place.
   *
   * A typed number is exact, and moving one end to make it true is only right
   * when nothing else has a say. Near a lock it has to be solved: the bar's
   * new value joins the holds, both of its ends are asked to stay, and the
   * solver moves whatever must move -- a grounded end not at all, a free end
   * on a locked neighbor along that neighbor's arc, both ends a little when
   * both are free. A bar locked on that very value keeps its lock and now
   * holds the new number, which is what typing into a locked field means.
   *
   * Returns 'unheld' when no hold reaches the bar, so the caller may do what
   * it always did; 'applied' when the number is now true; 'refused' when no
   * configuration makes it true, in which case nothing moved.
   */
  setBarValue(
    link: RealLink,
    kind: 'length' | 'angle',
    value: number
  ): 'unheld' | 'applied' | 'refused' {
    this.lastHoldRefusal = undefined;
    const links = this.mechanismSrv.links;
    const [a, b] = link.joints;
    if (!(a instanceof RealJoint) || !(b instanceof RealJoint) || link.joints.length !== 2) {
      return 'unheld';
    }
    // The bar's own hold on the *other* value stays in force: typing an
    // angle into a bar with a locked length turns it at that length.
    const others = heldBars(links).filter((bar) => !(bar.id === link.id && bar.hold === kind));
    const reach = reachedByHolds([a.id, b.id], others).bars;
    const frozen = this.frozenJointIds();
    // A locked end is an anchor the solver knows how to keep; the panel's own
    // rule moves an end of its own choosing and would ask the locked one.
    const anchored = frozen.has(a.id) || frozen.has(b.id);
    if (reach.length === 0 && holdOf(link) === undefined && !anchored) return 'unheld';
    const asked: HoldBar = {
      id: link.id,
      a: a.id,
      b: b.id,
      hold: kind,
      length: kind === 'length' ? value : Math.hypot(b.x - a.x, b.y - a.y),
      angle: kind === 'angle' ? value : Math.atan2(b.y - a.y, b.x - a.x),
    };
    // Which of the bar's own ends a typed number may move. The free pin, by
    // preference, so a crank drawn from a ground pin swings its far end; but
    // a ground pin is not a lock -- in Edit it moves like any other -- so
    // with the far end locked the ground pin is the end that gives. Bolted
    // down with the rest, both ends of such a crank stood still and the
    // number did nothing.
    const free = [a, b].filter((joint) => !frozen.has(joint.id));
    const preferred = free.filter((joint) => !joint.ground);
    const moving = new Set((preferred.length > 0 ? preferred : free).map((joint) => joint.id));
    const joints = holdJoints(this.mechanismSrv.joints, (joint) =>
      this.holdAnchor(joint, frozen, moving)
    );
    const solved = settleHolds(
      joints,
      [...others, asked],
      [a, b].map((joint) => ({ id: joint.id, x: joint.x, y: joint.y })),
      // A typed number changes the holds; the ends go where it puts them.
      { holdStill: false }
    );
    if (!solved.satisfied) {
      this.lastHoldRefusal = {
        immovable: [],
        bars: heldBarsReaching(a, links).concat(heldBarsReaching(b, links)),
        shortfall: solved.shortfall,
        satisfied: false,
      };
      return 'refused';
    }
    solved.positions.forEach((at, id) => {
      const joint = this.mechanismSrv.joints.find((j) => j.id === id);
      if (joint instanceof RealJoint) this.dragJoint(joint, new Coord(at.x, at.y), false, true);
    });
    this.lastHoldRefusal = undefined;
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    return 'applied';
  }

  /**
   * Assign one dimension to several bars in one solve. Sequential drags use
   * stale shared endpoints, and ask a fixed dimension to keep its old value.
   * Nothing is written until every requested dimension and remaining hold agrees.
   */
  setBarValues(links: readonly RealLink[], kind: 'length' | 'angle', value: number): boolean {
    this.lastHoldRefusal = undefined;
    const cylinders = this.mechanismSrv.sealedStructures();
    const held = heldBars(this.mechanismSrv.links, cylinders);
    const selected = new Set(links.map((link) => link.id));
    const constraints = held.filter((bar) => !(selected.has(bar.id) && bar.hold === kind));
    const moving = new Set<string>();
    const anchors = new Set<string>();
    const goals = new Map<string, HoldGoal>();
    for (const link of links) {
      const [a, b] = link.joints as RealJoint[];
      const target: HoldBar = {
        id: link.id,
        a: a.id,
        b: b.id,
        hold: kind,
        length: kind === 'length' ? value : link.length,
        angle: kind === 'angle' ? value : link.angleRad,
      };
      constraints.push(target);
      // An angle edit turns a bar at its existing length; constraining only
      // its direction admits a collapsed, zero-length bar as a solution.
      // A length edit retains its direction unless neighboring holds need
      // it to turn, just as they do for a one-bar dimension edit.
      if (kind === 'angle' || reachedByHolds([a.id, b.id], held).bars.length === 0) {
        constraints.push({ ...target, hold: kind === 'length' ? 'angle' : 'length' });
      }
      const anchor = b.ground ? b : a;
      const moved = b.ground ? a : b;
      anchors.add(anchor.id);
      moving.add(moved.id);
      for (const joint of [a, b]) {
        goals.set(joint.id, { id: joint.id, x: joint.x, y: joint.y });
      }
    }
    const frozen = this.frozenJointIds();
    const joints = holdJoints(
      this.mechanismSrv.joints,
      (joint) =>
        this.holdAnchor(joint, frozen, moving) || (anchors.has(joint.id) && !moving.has(joint.id))
    );
    const solved = settleHolds(joints, constraints, [...goals.values()], { holdStill: false });
    if (!solved.satisfied) {
      this.lastHoldRefusal = {
        immovable: [],
        bars: [...links],
        shortfall: solved.shortfall,
        satisfied: false,
      };
      return false;
    }
    solved.positions.forEach((at, id) => {
      const joint = this.mechanismSrv.joints.find((one) => one.id === id);
      if (joint instanceof RealJoint) this.dragJoint(joint, new Coord(at.x, at.y), false, true);
    });
    return true;
  }

  /**
   * The held bars that leave this joint no freedom at all, or none.
   *
   * Asked at the grab, before anything moves: a joint the holds have fully
   * determined never enters the dragging state, the same way a locked one
   * does not, so nothing downstream has to hold it still.
   */
  holdsImmobilizing(joint: RealJoint): RealLink[] {
    const links = this.mechanismSrv.links;
    const cylinders = this.mechanismSrv.sealedStructures();
    const bars = heldBars(links, cylinders);
    if (bars.length === 0 || heldBarsReaching(joint, links, cylinders).length === 0) return [];
    const frozen = this.frozenJointIds();
    const joints = holdJoints(this.mechanismSrv.joints, (j) =>
      this.holdAnchor(j, frozen, new Set([joint.id]))
    );
    const solved = settleHolds(joints, bars, [{ id: joint.id, x: joint.x, y: joint.y }]);
    return solved.immovable.includes(joint.id) ? heldBarsReaching(joint, links, cylinders) : [];
  }

  /**
   * Which joints the hold solver may never move: grounded pins are bolted to
   * the frame -- unless the pin is the one being moved, since in Edit a ground
   * pin drags like any other -- locked ones are held by a mark, and a slider's
   * joints live on a line of their own that the solver does not know.
   *
   * A cylinder's *interior* is the same kind of thing: the barrel's buried
   * end, the welded pin and the block are placed by the layout and re-derived
   * on every normalize, so a solver that moved them would be overwritten and
   * would meanwhile be solving the wrong geometry. Its two *mounts* are not --
   * they are ordinary joints a reader grabs and drags, and every route that
   * writes one back re-poses the ram around it. Anchoring them was what made a
   * cylinder that holds its angle refuse the drag outright rather than slide
   * the mount along the line it is holding.
   */
  isHoldAnchor(joint: RealJoint): boolean {
    return this.holdAnchor(joint, this.frozenJointIds());
  }

  private holdAnchor(joint: RealJoint, frozen: Set<string>, moving = new Set<string>()): boolean {
    return (
      (joint.ground && !moving.has(joint.id)) ||
      frozen.has(joint.id) ||
      joint instanceof PrisJoint ||
      this.mechanismSrv.cylindersAt(joint).some((cylinder) => isInsideCylinder(cylinder, joint))
    );
  }

  frozenJointIds(): Set<string> {
    return this.mechanismSrv.frozenJoints();
  }

  isJointFrozen(joint: Joint): boolean {
    return this.frozenJointIds().has(joint.id);
  }

  /** The locked objects an Unlock action has to clear for this joint to move. */
  locksHolding(joint: Joint): Lockable[] {
    return locksHolding(
      joint.id,
      this.mechanismSrv.joints,
      this.mechanismSrv.links,
      this.mechanismSrv.sealedStructures()
    );
  }

  dragJoint(
    selectedJoint: RealJoint,
    trueCoord: Coord,
    rebuild: boolean = true,
    settled: boolean = false
  ) {
    // The last line of defense, not the first: the canvas refuses at the
    // grab and the panel grays its fields, but every route to "move this
    // joint" — distance fields aimed at a neighbor, the linkage table, a
    // caller not yet written — lands here, and a held joint holds whoever
    // asks.
    if (this.frozenJointIds().has(selectedJoint.id)) {
      return selectedJoint;
    }
    // The same rule for a bar's hold on its length or angle, for the same
    // reason. Asked here, every route that moves a joint gets the CAD answer:
    // the joint goes where the holds allow, and whatever else the holds need
    // moved moves with it. `settled` is how the answer is written back
    // without being asked again.
    if (!settled && this.settleHolds([{ id: selectedJoint.id, x: trueCoord.x, y: trueCoord.y }])) {
      if (rebuild) {
        this.mechanismSrv.reseatFloatingSliders();
        this.mechanismSrv.updateMechanism(false);
      }
      return selectedJoint;
    }
    // TODO: have the round Number be integrated within function for determining trueCoord

    // A cylinder mount never free-moves, whoever asks — canvas drag, the
    // panel's X/Y fields, the distance-to-joint fields, the linkage table.
    // Every route lands on the same parametric re-pose, so no surface can
    // bend the part (§ cylinder 6).
    // Every cylinder on this joint, not just the first: two rams can share a
    // mount, and each has to be told about the move in its own terms. Left to
    // the normalizer afterwards, the second one holds its mounts and repairs
    // the only thing it can -- its interior -- so it quietly changes size.
    const sealedHere = this.mechanismSrv.cylindersAt(selectedJoint);
    if (sealedHere.length > 0) {
      // The seal is a joint the reader can grab now, and grabbing it is
      // *Starts at* by hand (decision S7): it runs along its own axis between
      // the stops, and the same tiebreak as the typed field decides what gives.
      // Its partner N is still nobody's handle -- nothing selects it, so a call
      // here is a stray path, and moving it would bend the part.
      for (const sealed of sealedHere.filter((one) => one.seal.id === selectedJoint.id)) {
        this.dragCylinderSeal(sealed, trueCoord, false);
      }
      const mounted = sealedHere.filter(
        (sealed) => selectedJoint.id === sealed.mountA.id || selectedJoint.id === sealed.mountB.id
      );
      // Where the mount can actually go, agreed between every ram on it before
      // any of them moves.
      //
      // Each ram clamps the mount at its own minimum span, along its own axis,
      // so asked one at a time they write different positions to the one joint
      // and the last to run wins -- which makes the result depend on the order
      // the cylinders happen to be in. Taking the most restrictive answer first
      // and then posing all of them to it is order-independent, and it is also
      // the right answer: a mount two rams hold can only go where both allow.
      // Iterated to a fixed point, not decided in one pass. Each ram clamps
      // along its own axis, so the landing that satisfies the most restrictive
      // one may still violate another's minimum -- in two dimensions "furthest
      // from where the cursor asked" is not a proof of feasibility. Re-clamping
      // the agreed point against every ram until it stops moving is, and it
      // terminates because a clamp only ever pushes the point further from the
      // request. The cap is a backstop against a pathological arrangement, not
      // an expected exit.
      let agreed = trueCoord;
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (const sealed of mounted) {
          const landed = this.cylinderMountLanding(sealed, selectedJoint, agreed);
          if (!landed) continue;
          if (this.getPointDistance(landed.x, landed.y, agreed.x, agreed.y) > 1e-6) {
            agreed = landed;
            moved = true;
          }
        }
        if (!moved) break;
      }
      for (const sealed of mounted) {
        this.dragCylinderMount(sealed, selectedJoint, agreed, false);
      }
      if (rebuild) {
        this.mechanismSrv.reseatFloatingSliders();
        this.mechanismSrv.updateMechanism(false);
      }
      return selectedJoint;
    }

    let oldX = selectedJoint.x;
    let oldY = selectedJoint.y;

    selectedJoint.x = roundNumber(trueCoord.x, 6);
    selectedJoint.y = roundNumber(trueCoord.y, 6);
    // Every joint, not only a pin. A slider used to be dragged by a coincident
    // `RevJoint` that carried the riders, so a switch on `RevJoint` reached them
    // -- and had to write the block's other joint back onto the same point. The
    // slider is the joint now and the riders are its own, so a switch here would
    // leave a dragged slider's bars with stale outlines, centers and loads.
    selectedJoint.links.forEach((l) => {
      if (!(l instanceof RealLink)) {
        return;
      }
      // TODO: delete this if this is not needed (verify this)
      const jointIndex = l.joints.findIndex((jt) => jt.id === selectedJoint.id);
      l.joints[jointIndex].x = roundNumber(trueCoord.x, 6);
      l.joints[jointIndex].y = roundNumber(trueCoord.y, 6);
      // A dragged joint deforms the link, so an auto center of mass
      // follows the geometry. A custom one stays where its author put it:
      // there is no rigid motion to carry it, and guessing would move a
      // number somebody chose.
      if (!l.comIsCustom) {
        l.CoM = RealLink.determineCenterOfMass(l.joints);
        l.updateCoMDs();
      }
      l.updateLengthAndAngle();

      if (l.subset.length > 0) {
        l.subset.forEach((slink) => {
          let subLink = slink as RealLink;
          // Same rule as the root: a member's hand-placed center survives
          // for the unweld that will one day restore it.
          if (!subLink.comIsCustom) {
            subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
            subLink.updateCoMDs();
          }
          subLink.updateLengthAndAngle();
        });
      }

      // PositionSolver.setUpSolvingForces(GridComponent.selectedLink.forces);
      PositionSolver.setUpInitialJointLocations(l.joints);

      // move forces only if dragged joint is not inside link
      let jointInHull: boolean = false;
      let hull = l.getHullPoints();
      hull.forEach((point) => {
        if (selectedJoint.x == point[0] && selectedJoint.y == point[1]) jointInHull = true;
      });

      // find original joint A and joint B
      let jointA = [l.joints[0].x, l.joints[0].y];
      let jointB = [l.joints[1].x, l.joints[1].y];
      let newJointA = jointA;
      let newJointB = jointB;
      if (selectedJoint.x === jointA[0] && selectedJoint.y === jointA[1]) {
        jointA = [oldX, oldY];
      } else {
        jointB = [oldX, oldY];
      }

      if (l.joints.length == 2) {
        // special binary link case, maintain ratio
        let linkDistance = this.getPointDistance(jointA[0], jointA[1], jointB[0], jointB[1]);

        l.forces.forEach((f) => {
          // calculate ratio to be maintained
          let forceDistance = this.getPointDistance(
            jointA[0],
            jointA[1],
            f.startCoord.x,
            f.startCoord.y
          );
          let ratio = forceDistance / linkDistance;

          // update force start position with ratio
          let newX = newJointA[0] + (newJointB[0] - newJointA[0]) * ratio;
          let newY = newJointA[1] + (newJointB[1] - newJointA[1]) * ratio;

          f.moveForceTo(newX, newY);
        });
      } else if (jointInHull) {
        l.forces.forEach((f) => {
          // drag offset
          let offsetX = selectedJoint.x - oldX;
          let offsetY = selectedJoint.y - oldY;

          // Offset is divided by number of joints to average out change
          let newX = f.startCoord.x + offsetX / f.link.joints.length;
          let newY = f.startCoord.y + offsetY / f.link.joints.length;

          f.moveForceTo(newX, newY);
        });
      }
    });
    // Before the rebuild, not after. A floating slider is deliberately not a
    // member of its carrier -- that is what makes it a slot rather than a pin --
    // so moving the carrier, or one of the two joints defining the slot, leaves
    // the block behind. Putting it back afterwards fixes only the pose on
    // screen: updateMechanism has already copied the stale position into every
    // solved timestep, so pressing Play snapped the block straight back off its
    // channel.
    if (rebuild) {
      this.mechanismSrv.reseatFloatingSliders();
      this.mechanismSrv.updateMechanism(false);
    }
    return selectedJoint;
  }

  /**
   * Translate a whole link, and everything rigidly attached to it, by (dx, dy).
   *
   * A link drag is a rigid translation, which is a stronger statement than "drag
   * each of its joints in turn": the link's own center of mass and forces move
   * with the body exactly, rather than being re-derived from the new joint
   * positions. Only the *neighboring* links genuinely change shape, so those
   * are the ones that get recomputed.
   */
  /**
   * The joints a drag of this link would carry, filtered to the ones the
   * current Lock marks hold still. Carried means moved *as a body*: the
   * link's own joints, and a sealed cylinder's.
   *
   * A floating slider riding this link is not among them, locked or not. Its
   * mark holds where it sits along the slot, and moving the link moves the
   * slot with the block still at that place on it — so a locked block is no
   * reason to refuse the drag, and pivoting the link about one would be
   * anchoring a point nothing asked to have held.
   */
  frozenCarriedJoints(link: Link): Joint[] {
    link = this.mechanismSrv.rootLinkOwning(link) ?? link;
    const carried = new Map<string, Joint>();
    const add = (joint: Joint) => carried.set(joint.id, joint);
    const bodyCylinder = this.mechanismSrv.cylinderAt(link);
    if (bodyCylinder) {
      cylinderJoints(bodyCylinder).forEach(add);
    } else {
      // The link's own joints. A slider riding one of them used to bring the
      // coincident partner the block paired it with; a slider is one joint now,
      // so a slider that is a member of this body is already among them.
      link.joints.forEach(add);
    }
    const frozen = this.frozenJointIds();
    return [...carried.values()].filter((joint) => frozen.has(joint.id));
  }

  dragLink(selectedLink: Link, dx: number, dy: number) {
    if (dx === 0 && dy === 0) {
      return selectedLink;
    }
    return this.moveLinkRigidly(selectedLink, (x, y) => ({ x: x + dx, y: y + dy }));
  }

  /**
   * Turn a whole link about a point, carrying everything rigidly attached.
   *
   * This is what a link drag becomes when exactly one of the joints it would
   * carry is locked: the body cannot translate without moving the held joint,
   * but it can swing about it — which is also the only motion the real linkage
   * would allow if that pin were bolted down.
   */
  rotateLink(selectedLink: Link, pivot: Coord, theta: number) {
    if (theta === 0) {
      return selectedLink;
    }
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return this.moveLinkRigidly(selectedLink, (x, y) => ({
      x: pivot.x + (x - pivot.x) * cos - (y - pivot.y) * sin,
      y: pivot.y + (x - pivot.x) * sin + (y - pivot.y) * cos,
    }));
  }

  private moveLinkRigidly(
    selectedLink: Link,
    mapPoint: (x: number, y: number) => { x: number; y: number }
  ) {
    // A held bar somewhere on this body, or on a neighbor sharing one of its
    // joints, has a say in where the joints go. Then this is not a rigid move
    // at all: every joint is asked for as a goal, the holds answer for the
    // ones they reach, and the rest go where the body would have put them.
    // The link's own joints, and only those. A slider riding one of them used
    // to bring its coincident partner along through the block that joined the
    // two; a slider is one joint now, so one that is a *member* of this body is
    // already in the list -- and a floating one riding the body deliberately is
    // not, because its mark holds its place along the slot and the reseat
    // carries it there.
    selectedLink = this.mechanismSrv.rootLinkOwning(selectedLink) ?? selectedLink;
    const carried: Joint[] = [...selectedLink.joints];
    const goals: HoldGoal[] = carried
      .filter((joint, index) => carried.indexOf(joint) === index)
      .map((joint) => ({ id: joint.id, ...mapPoint(joint.x, joint.y) }));
    const settled = this.settleHolds(goals);
    if (settled) {
      goals.forEach((goal) => {
        if (settled.has(goal.id)) return;
        const joint = carried.find((candidate) => candidate.id === goal.id);
        if (joint instanceof RealJoint) {
          this.dragJoint(joint, new Coord(goal.x, goal.y), false, true);
        }
      });
      this.mechanismSrv.reseatFloatingSliders();
      this.mechanismSrv.updateMechanism(false);
      return selectedLink;
    }

    // Planned, not written. The drag's own joints and every cylinder those
    // joints reach are worked out from one snapshot, so a part that cannot
    // follow refuses the whole gesture rather than leaving the bar moved and
    // the cylinder behind with no way back to where it started.
    //
    // This is a `moves` request and never a body motion, so under S21 a
    // cylinder it reaches re-lays between its own two end joints rather than
    // being picked up (the canvas sends a real body drag to `dragCylinder`).
    // A joint a cylinder derives for itself is dropped by the plan rather than
    // taken as a constraint: a compound that has swallowed a barrel holds N,
    // and asking for it here is asking for a joint that has an owner.
    const moves = new Map<string, Point>();
    const noteMove = (joint: Joint) => {
      if (moves.has(joint.id)) return;
      moves.set(joint.id, mapPoint(joint.x, joint.y));
    };
    selectedLink.joints.forEach(noteMove);

    // The dragged body's own properties go through the drag's own transform,
    // which turns a load's direction with it; the plan's frame transport moves
    // only the anchor. So it is carried here and named as already handled.
    const ownBodies: Link[] = [selectedLink];
    if (selectedLink instanceof RealLink) ownBodies.push(...selectedLink.subset);
    // Except a cylinder's own barrel or rod. That bar is laid out by its part
    // and not by this gesture -- it turns and resizes to reach an end joint the
    // drag never touched -- so the plan says what moved it, and carrying it
    // here as well would put a load on it through a motion it did not make.
    const members = new Set(
      this.mechanismSrv.sealedStructures().flatMap((one) => [one.barrel.id, one.rod.id])
    );
    const carriedHere = ownBodies.filter((link) => !members.has(link.id));
    const ownIds = new Set(carriedHere.map((link) => link.id));

    if (!this.runEdit({ moves }, false, ownIds)) {
      return selectedLink;
    }
    carriedHere.forEach((link) => this.transformLinkBody(link, mapPoint));

    // Before the rebuild, not after. A floating slider is deliberately not a
    // member of its carrier -- that is what makes it a slot rather than a pin --
    // so moving the carrier, or one of the two joints defining the slot, leaves
    // the block behind. Putting it back afterwards fixes only the pose on
    // screen: updateMechanism has already copied the stale position into every
    // solved timestep, so pressing Play snapped the block straight back off its
    // channel.
    this.mechanismSrv.reseatFloatingSliders();
    this.mechanismSrv.updateMechanism(false);
    return selectedLink;
  }

  /** Where this ram would put the mount, without moving anything. */
  private cylinderMountLanding(
    sealed: Cylinder,
    mount: RealJoint,
    wanted: Coord
  ): Coord | undefined {
    const pose = this.cylinderMountPose(sealed, mount, wanted);
    if (!pose) return undefined;
    const landed = mount.id === sealed.mountA.id ? pose.mountA : pose.mountB;
    return new Coord(landed.x, landed.y);
  }

  private cylinderMountPose(
    sealed: Cylinder,
    mount: RealJoint,
    wanted: Coord
  ): CylinderPose | undefined {
    const draggingBarrelMount = mount.id === sealed.mountA.id;
    return layoutCylinder(
      draggingBarrelMount ? wanted : sealed.mountA,
      draggingBarrelMount ? sealed.mountB : wanted,
      cylinderLengthsOf(sealed),
      0.15 * SettingsService.cylinderObjectScale,
      // The anchor is the mount NOT being dragged: it stays exactly still,
      // and the dragged mount is what the span floor stops.
      draggingBarrelMount ? 'rod' : 'barrel',
      // The axis before this move, so a drag through the anchor clamps at the
      // minimum span instead of flipping the part 180°.
      {
        x: sealed.mountB.x - sealed.mountA.x,
        y: sealed.mountB.y - sealed.mountA.y,
      },
      // A member keeping its length does not resize past a stop; the other
      // takes all of it, and with both held the mount stops at the stop.
      this.cylinderLengthHolds(sealed)
    );
  }

  /**
   * Which of a cylinder's members are keeping their length (decision S5).
   *
   * Read straight off the flags rather than through `heldBars`, which is the
   * solver's list and deliberately never carries a member's `'length'`: the
   * thing that hold constrains is a length the *layout* picks, so the layout is
   * where it has to be honored.
   */
  private cylinderLengthHolds(sealed: Cylinder): CylinderHolds {
    return {
      barrel: sealed.barrel instanceof RealLink && sealed.barrel.hold === 'length',
      rod: sealed.rod.hold === 'length',
    };
  }

  /**
   * Drag one mount of a sealed cylinder (§ cylinder 6): the assembly re-poses
   * about the OTHER mount — axis through the mounts, barrel rigid to mount A,
   * rod rigid to mount C, pin re-derived on the axis with the stroke clamped
   * to the slot ends. Collinearity holds by construction, so no drag can bend
   * a cylinder.
   */
  dragCylinderMount(
    sealed: Cylinder,
    mount: RealJoint,
    wanted: Coord,
    rebuild: boolean = true
  ): boolean {
    const pose = this.cylinderMountPose(sealed, mount, wanted);
    if (!pose) return false;
    this.applyCylinderPose(sealed, pose, rebuild);
    return pose.atMinimum === true;
  }

  /**
   * Drag the body: the whole assembly translates rigidly.
   *
   * One of the two **body motions** (decision S21), and with `rotateCylinder`
   * the only pair that carries a welded neighbor. The reader has the part
   * itself in hand — a barrel, a rod, or a bracket welded to either, which the
   * canvas routes here through `cylinderAt` — so everything welded to it comes
   * along, the way picking the assembly up off the bench does. Every other
   * edit of a cylinder writes its own joints and lets the bodies around them
   * change shape.
   */
  dragCylinder(sealed: Cylinder, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.applyCylinderPose(
      sealed,
      {
        mountA: { x: sealed.mountA.x + dx, y: sealed.mountA.y + dy },
        inner: { x: sealed.inner.x + dx, y: sealed.inner.y + dy },
        seal: { x: sealed.seal.x + dx, y: sealed.seal.y + dy },
        mountB: { x: sealed.mountB.x + dx, y: sealed.mountB.y + dy },
      },
      true,
      'body'
    );
  }

  /**
   * Swing the whole assembly about a point — a rotation is rigid, so
   * collinearity survives and the pose lands as-is. This is a body drag with
   * one joint locked: the part cannot translate, but it can turn on that joint.
   *
   * The other body motion, so it carries what is welded to either member
   * (S21).
   */
  rotateCylinder(sealed: Cylinder, pivot: Coord, theta: number): void {
    if (theta === 0) return;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const turn = (point: { x: number; y: number }) => ({
      x: pivot.x + (point.x - pivot.x) * cos - (point.y - pivot.y) * sin,
      y: pivot.y + (point.x - pivot.x) * sin + (point.y - pivot.y) * cos,
    });
    this.applyCylinderPose(
      sealed,
      {
        mountA: turn(sealed.mountA),
        inner: turn(sealed.inner),
        seal: turn(sealed.seal),
        mountB: turn(sealed.mountB),
      },
      true,
      'body'
    );
  }

  /**
   * Turn the whole cylinder to a bearing — Barrel Angle, Rod Angle and the
   * slide's Slider Angle, which are one number (decision D10).
   */
  setCylinderAngle(sealed: Cylinder, angleRad: number): boolean {
    return this.commitCylinderEdit(
      sealed,
      poseForCylinderAngle(sealed, angleRad, this.editContext(sealed))
    );
  }

  /** Put the seal at a share of its travel — *Starts at* (decision D11). */
  setCylinderStart(sealed: Cylinder, start: number): boolean {
    return this.commitCylinderEdit(
      sealed,
      poseForCylinderStart(sealed, start, this.editContext(sealed)),
      true,
      // One decimal, which is the resolution the field itself shows: a number
      // said to more places than the box can hold reads as a disagreement.
      { subject: 'Starts at', say: (share) => `${Math.round(share * 1000) / 10}%` }
    );
  }

  /** Give the barrel a length: the buried end moves, and the travel with it. */
  setBarrelLength(sealed: Cylinder, length: number): boolean {
    return this.commitCylinderEdit(
      sealed,
      poseForBarrelLength(sealed, length, this.editContext(sealed)),
      true,
      this.memberStop(sealed.barrel)
    );
  }

  /** Give the rod a length: the far joint moves, unless the frame holds it. */
  setRodLength(sealed: Cylinder, length: number): boolean {
    return this.commitCylinderEdit(
      sealed,
      poseForRodLength(sealed, length, this.editContext(sealed)),
      true,
      this.memberStop(sealed.rod)
    );
  }

  /**
   * How a member says it stopped short: its own name, and its length in the
   * reader's unit.
   *
   * Through the panel's own pair (`NumberUnitParserService.formatModelLength`
   * and `MechanismService.bodyLabel`), because the sentence sits beside a field
   * the reader is looking at — a second way of rounding a length, or a name
   * built from the id, would read as the app disagreeing with itself.
   */
  private memberStop(member: Link): StoppedShort {
    return {
      subject: this.mechanismSrv.bodyLabel(member),
      say: (length) => this.nup.formatModelLength(length, this.settings.lengthUnit.getValue()),
    };
  }

  /**
   * Slide the seal to where the pointer is — *Starts at* by hand (decision S7).
   *
   * Every refusal on this road is silent: a pointermove asks sixty times a
   * second, and a cylinder that has run out of room has simply stopped
   * following the cursor, the way a mount at its shortest always has.
   */
  dragCylinderSeal(sealed: Cylinder, wanted: Coord, rebuild: boolean = true): boolean {
    return this.commitCylinderEdit(
      sealed,
      poseForSealAt(sealed, wanted, this.editContext(sealed)),
      rebuild
    );
  }

  /**
   * What the pure edits cannot work out for themselves: the scale, what is
   * grounded, what a Lock holds, which lengths are fixed, and how to name
   * either of the last two.
   */
  private editContext(sealed: Cylinder): CylinderEditContext {
    const links = this.mechanismSrv.links;
    const cylinders = this.mechanismSrv.sealedStructures();
    const frozen = this.frozenJointIds();
    // The part's own angle hold never refuses its own edit: every edit here
    // either keeps the bearing or is the one that sets it, and a hold on the
    // number being typed is a hold on the new number.
    const own = new Set([sealed.barrel.id, sealed.rod.id]);
    return {
      r: 0.15 * SettingsService.cylinderObjectScale,
      isGrounded: (joint) => joint instanceof RealJoint && joint.ground,
      // The same set `planEdit` judges the finished plan against, asked one
      // rung earlier so the ladder can try the *other* end instead of walking
      // into the backstop and refusing.
      isLocked: (joint) => frozen.has(joint.id),
      holds: this.cylinderLengthHolds(sealed),
      heldBy: (displaced) => {
        const bars = displaced
          .flatMap((joint) => heldBarsReaching(joint, links, cylinders))
          .filter((bar, index, all) => all.indexOf(bar) === index && !own.has(bar.id));
        return bars.length > 0 ? heldBySentence(bars, this.mechanismSrv.joints) : undefined;
      },
      // Named by the member's own two joints, which is what its panel is
      // headed with and what the padlock the reader pressed sits in. The id
      // will not do: a barrel's holds N, the joint the drawing never shows.
      fixedBy: (members) => {
        const bars = members.filter((member): member is RealLink => member instanceof RealLink);
        return bars.length > 0
          ? heldBySentence(bars, undefined, (bar) => this.mechanismSrv.bodyLabel(bar))
          : undefined;
      },
    };
  }

  /** One planned transaction, or the reason there is none. The caller saves. */
  private commitCylinderEdit(
    sealed: Cylinder,
    edit: CylinderEdit,
    rebuild: boolean = true,
    stopped?: StoppedShort
  ): boolean {
    if (!edit.ok) {
      if (!edit.refusal.silent) this.notify.refusal(edit.refusal.code, edit.refusal.long);
      return false;
    }
    const went = this.applyCylinderPose(sealed, edit.pose, rebuild);
    // News rather than a refusal (decision S19): the edit landed, and a refusal
    // is the app's word for nothing having changed. It is the same shape as the
    // anchor's `starts here now` -- something happened, and the consequence
    // that came with it is worth one sentence.
    if (went && edit.stoppedBy && stopped) {
      this.notify.news(
        edit.stoppedBy.code,
        `${stopped.subject} stopped at ${stopped.say(edit.stoppedBy.reached)}: ${edit.stoppedBy.cause}.`
      );
    }
    return went;
  }

  /**
   * Land a pose, and re-lay any cylinder bolted to what just moved.
   *
   * Two cylinders can share an end joint: the first's rod end is the second's
   * barrel end. Moving the first moves that joint without the second being
   * asked, and the second was then holding a barrel of the wrong length with
   * its head as far outside it as the stretch -- on screen, a part in two
   * pieces with a gap down the middle. It re-lays itself between its own two
   * end joints instead, resizing to reach: both halves together, so both of its
   * ends move, which is what a drag on a cylinder's own end joint has always
   * done past its stops.
   *
   * `dragLink` has always repaired this for a link drag. Every path that poses
   * a cylinder needs it, which is all of them: dragging the body, dragging an
   * end joint, and the length and Starts-at fields in its panel.
   *
   * `motion` is the difference S21 turns on. `'body'` says the reader has the
   * whole assembly in hand, and only then does a bar welded to either member
   * come along; left off — which is every other caller here — the part writes
   * its own four joints and a welded bracket changes shape around them.
   *
   * One level deep, as `dragLink` is: a third cylinder bolted to the second
   * follows on the next rebuild rather than in this one.
   */
  private applyCylinderPose(
    sealed: Cylinder,
    pose: CylinderPose,
    rebuild: boolean = true,
    motion?: 'body'
  ): boolean {
    return this.runEdit({ poses: [{ cylinder: sealed, pose, motion }] }, rebuild);
  }

  /**
   * Plan a whole edit, and commit it only if all of it stands up.
   *
   * One snapshot for the gesture's own moves and for every cylinder they
   * reach. A ram that cannot follow, a body that would have to change shape,
   * a lock on anything carried: any of those refuses the edit outright and
   * nothing is written. Committing the initiating move first and discovering
   * the refusal afterwards left a drag half applied with no way back.
   */
  runEdit(
    request: EditRequest,
    rebuild: boolean,
    alreadyCarried: Set<string> = new Set()
  ): boolean {
    const cylinders = cylindersIn(this.mechanismSrv.joints);
    const snapshot = snapshotOf(this.mechanismSrv.joints);
    const frozen = this.frozenJointIds();
    // Each cylinder's rigid member lengths, read while its geometry is still
    // straight -- laying one out from a bent intermediate state is what bakes
    // the split in. From the snapshot, because nothing has moved yet and
    // nothing may until the whole plan stands up. Both lengths, because they
    // are two numbers now: taking the barrel's for the rod's would re-lay a
    // carried part as the part it would have been before either was typed.
    const members = new Map(
      cylinders.map((one) => {
        const span = (from: string, to: string) => {
          const at = snapshot.get(from);
          const other = snapshot.get(to);
          return at && other ? this.getPointDistance(at.x, at.y, other.x, other.y) : 0;
        };
        return [
          one.seal.id,
          {
            lengths: {
              barrel: span(one.mountA.id, one.inner.id),
              rod: span(one.seal.id, one.mountB.id),
            },
            holds: this.cylinderLengthHolds(one),
          },
        ] as const;
      })
    );

    const planned = planEdit(request, {
      cylinders,
      snapshot,
      tolerance: 1e-6,
      // A refusal names bodies and joints, and `planEdit` cannot know what a
      // reader calls either: a link's id is the sorted letters of its joints,
      // and one of those may be a cylinder's buried inner end -- which is how a
      // refusal came to name a body `CC1F`. These are the app's own names
      // (S10, S11, S16), said once here for every sentence that file can write.
      names: {
        body: (body) => this.mechanismSrv.bodyLabel(body),
        // A cylinder by its two end joints, the way its own panel is headed
        // (S10) -- never by a member's id, which holds the buried end.
        cylinder: (one) => `Cylinder ${nameOfJoint(one.mountA)}${nameOfJoint(one.mountB)}`,
        joint: (id) => {
          const joint = this.mechanismSrv.joints.find((one) => one.id === id);
          return joint ? nameOfJoint(joint) : id;
        },
      },
      layoutFor: (cylinder, mountA, mountB) => {
        const carried = members.get(cylinder.seal.id);
        if (!carried) return undefined;
        return stretchedCylinderPose(
          mountA,
          mountB,
          carried.lengths,
          0.15 * SettingsService.cylinderObjectScale,
          carried.holds
        );
      },
      // Asked of every joint the plan would move, not only a ram's own five: a
      // lock out on a bracket welded to a mount holds that mount just as
      // surely, and the gate at the canvas cannot see that far.
      frozen: (id) => frozen.has(id),
      // Named by the member's own two joints rather than by the part, which is
      // what its panel is headed with: with both lengths fixed the reader has
      // two padlocks to choose between, and "fixed length AD" twice over names
      // neither of them.
      heldBy: (cylinder) => {
        const holding = [cylinder.barrel, cylinder.rod].filter(
          (member): member is RealLink => member instanceof RealLink && member.hold === 'length'
        );
        return holding.length > 0
          ? heldBySentence(holding, undefined, (bar) => this.mechanismSrv.visibleBodyName(bar))
          : undefined;
      },
    });
    if (!planned.ok) {
      this.notify.refusal(planned.refusal.code, planned.refusal.long);
      return false;
    }

    this.commitEditPlan(planned.plan, alreadyCarried);
    if (rebuild) {
      this.mechanismSrv.reseatFloatingSliders();
      this.mechanismSrv.updateMechanism(false);
    }
    return true;
  }

  /**
   * Write a plan out, once, and carry each body's properties by its own motion.
   *
   * Three kinds of body come out of a plan and they are not interchangeable. A
   * bar carried rigidly takes its forces and its center of mass through the
   * transform that carried it. A bar the edit deliberately resized -- a
   * cylinder's own barrel and rod -- goes through its change of reference
   * frame, which is what stretches a point fixed to it. Anything else holding a
   * moved joint has been genuinely deformed and follows its own frame too.
   *
   * Reading one frame off every root's first two joints instead put a resized
   * cylinder's stretch onto the bracket welded to it, moving a force anchor and
   * a center of mass that had not moved at all.
   *
   * Under S21 a body welded to a cylinder member is deformed by almost every
   * edit, so both halves of that have to hold at once: the member goes through
   * its own rigid motion and is then left alone, and the body around it is
   * transported through a frame that is **not** the member (`frameJointsOf`).
   */
  commitEditPlan(plan: EditPlan, alreadyCarried: Set<string> = new Set()): void {
    const handled = new Set<string>(alreadyCarried);
    plan.carried.forEach(({ leaf }) => handled.add(leaf.id));
    plan.reshaped.forEach((leaf) => handled.add(leaf.id));
    const derived = this.derivedJointIds();

    const framed = [
      // A bar the caller is transporting itself is not transported again. It
      // could not happen while a link drag over a welded cylinder was refused
      // outright; it can now, and doing both moves a load twice.
      ...plan.reshaped.filter((link) => !alreadyCarried.has(link.id)),
      ...this.mechanismSrv.links.filter(
        (link): link is RealLink =>
          link instanceof RealLink &&
          !handled.has(link.id) &&
          link.joints.some((joint) => plan.movedIds.has(joint.id))
      ),
    ].map((link) => {
      const frame = this.frameJointsOf(link as RealLink, derived);
      return { link, frame, from: frame.map((joint) => ({ x: joint.x, y: joint.y })) };
    });

    this.mechanismSrv.joints.forEach((joint) => {
      const to = plan.placements.get(joint.id);
      if (!to) return;
      joint.x = roundNumber(to.x, 6);
      joint.y = roundNumber(to.y, 6);
    });

    plan.carried.forEach(({ leaf, move }) => {
      if (alreadyCarried.has(leaf.id)) return;
      this.transformLinkBody(leaf, (x, y) => carryPoint(move, { x, y }));
    });
    framed.forEach(({ link, frame, from }) =>
      this.reframeDeformedLink(link as RealLink, frame, from, handled)
    );
  }

  /**
   * The two joints a deformed body's fixed points are transported through.
   *
   * Its first two, skipping any joint a cylinder derives for itself. A body's
   * id is the sorted ids of its joints and a bracket welded to a barrel's end
   * joint holds N, so `AA1W` offered its first two as `A` and the buried `A1`
   * -- the barrel. Reading the frame off *that* pair swings a force or a
   * hand-placed center of mass sitting out on the bracket round with a bar it
   * is not on, every time the barrel is given a new length.
   *
   * A body with no cylinder in it has nothing to skip, so its frame is the pair
   * it always was and its numbers do not move.
   */
  private frameJointsOf(link: RealLink, derived: ReadonlySet<string>): Joint[] {
    const own = link.joints.filter((joint) => !derived.has(joint.id));
    // A member bar is two thirds derived -- a barrel is A and N, a rod S and B
    // -- and it is transported through its own stretch on purpose, so it falls
    // back to the pair it has.
    return (own.length >= 2 ? own : link.joints).slice(0, 2);
  }

  /** N and S of every cylinder: the joints their own part places (S11). */
  private derivedJointIds(): Set<string> {
    return new Set(
      this.mechanismSrv.sealedStructures().flatMap((one) => [one.inner.id, one.seal.id])
    );
  }

  /**
   * Carry one deformed link's fixed points through its change of frame.
   *
   * A link holding a joint that moved has been deformed, not translated, so its
   * outline and an automatic center of mass follow from where its joints now
   * are. Its forces do not, and neither does a custom center of mass: those are
   * points somebody fixed to *this body*, and leaving them at their old world
   * position silently moves them to a different point of the link. A frame too
   * degenerate to transport through leaves them untouched.
   *
   * One copy for both drag paths — a link drag and a cylinder re-pose. They
   * each carried their own, identical, and a fix to either would have reached
   * only one kind of drag, surfacing as a discrepancy in force numbers.
   *
   * @param frame the two joints the transport is read off, chosen by
   * `frameJointsOf` rather than taken as the first two.
   * @param from where those two stood before the move, captured by the caller
   * while the geometry was still the old one.
   * @param handled the bars something else has already moved — a member of a
   * cylinder this edit carried or resized. Transporting one of those through
   * the body's frame as well moves its load a second time.
   */
  private reframeDeformedLink(
    link: RealLink,
    frame: Joint[],
    from: { x: number; y: number }[],
    handled: ReadonlySet<string> = new Set()
  ): void {
    const [start, end] = frame;
    const transportable = from.length === 2 && !!start && !!end;
    if (transportable) {
      link.forces.forEach((force) => {
        const [x, y] = pointThroughFrame(force.startCoord, from[0], from[1], start, end);
        force.moveForceTo(x, y);
      });
    }
    if (link.comIsCustom) {
      if (transportable) {
        const [comX, comY] = pointThroughFrame(link.CoM, from[0], from[1], start, end);
        link.CoM = new Coord(comX, comY);
      }
    } else {
      link.CoM = RealLink.determineCenterOfMass(link.joints);
    }
    link.updateCoMDs();
    link.updateLengthAndAngle();
    link.subset.forEach((sub) => {
      const subLink = sub as RealLink;
      if (handled.has(subLink.id)) return;
      if (subLink.comIsCustom) {
        if (transportable) {
          const [subX, subY] = pointThroughFrame(subLink.CoM, from[0], from[1], start, end);
          subLink.CoM = new Coord(subX, subY);
        }
      } else {
        subLink.CoM = RealLink.determineCenterOfMass(subLink.joints);
      }
      subLink.updateCoMDs();
      subLink.updateLengthAndAngle();
    });
    PositionSolver.setUpInitialJointLocations(link.joints);
  }

  private transformLinkBody(
    link: Link,
    mapPoint: (x: number, y: number) => { x: number; y: number }
  ) {
    // Both endpoints through the map, not just the anchor: a load is fixed to
    // the body it acts on, so a body that turns takes the arrow's direction
    // round with it — under a pure translation this collapses to the old move.
    link.forces.forEach((force) => {
      const start = mapPoint(force.startCoord.x, force.startCoord.y);
      const end = mapPoint(force.endCoord.x, force.endCoord.y);
      force.moveAnchor(new Coord(start.x, start.y));
      force.moveDirectionHandle(new Coord(end.x, end.y));
    });
    if (!(link instanceof RealLink)) return;
    const center = mapPoint(link.CoM.x, link.CoM.y);
    link.CoM = new Coord(center.x, center.y);
    link.updateCoMDs();
    link.updateLengthAndAngle();
    PositionSolver.setUpInitialJointLocations(link.joints);
  }

  findJointIDIndex(id: string, joints: Joint[]) {
    return joints.findIndex((j) => j.id === id);
  }

  /**
   * Where a force's anchor may sit on its link, given where the pointer is.
   *
   * Two joints are two different answers. A pin shared by more than one link is
   * refused outright: a force applied *there* does not say which of the bodies
   * meeting there it acts on, and every answer the force solver could pick is a
   * guess the user never made — the same rule a driven joint follows. A joint on
   * exactly one link has no such ambiguity, so the anchor snaps onto it, which
   * is how a load is put on a tracer point at the end of a boom.
   *
   * `undefined` means the anchor may not go there at all. The caller keeps its
   * own "inside the bar" test, because that one needs the drawn path.
   */
  forceAnchorAt(
    link: RealLink,
    point: Coord,
    objectScale: number
  ): { at: Coord; snappedTo?: RealJoint; shared?: RealJoint } {
    // Generous enough to catch by hand: a joint is 0.15 object scales across.
    const snapRadius = 0.3 * objectScale;
    let nearest: RealJoint | undefined;
    let nearestGap = Infinity;
    for (const joint of link.joints) {
      if (!(joint instanceof RealJoint)) continue;
      const gap = Math.hypot(joint.x - point.x, joint.y - point.y);
      if (gap < nearestGap) {
        nearest = joint;
        nearestGap = gap;
      }
    }
    if (nearest && nearestGap <= snapRadius) {
      // A pin several links meet at is not a place for a force -- it would
      // not say which body it acts on -- but it is not a wall either. The
      // caller keeps the force on the link, short of the pin.
      if (nearest.links.length > 1) return { at: point, shared: nearest };
      return { at: new Coord(nearest.x, nearest.y), snappedTo: nearest };
    }
    return { at: point };
  }

  /**
   * Move a force under a drag.
   *
   * `how` names which of the three things the gesture is: the tail alone (the
   * point the load acts at, leaving the arrow pointing where it did *from* the
   * new point), the whole arrow, or the head (its direction).
   */
  dragForce(selectedForce: Force, trueCoord: Coord, how: 'anchor' | 'whole' | 'direction') {
    if (how === 'direction') {
      selectedForce.moveDirectionHandle(trueCoord);
      return selectedForce;
    }
    // Kept to the region the link's joints span -- the line between a bar's
    // two joints, the inside of a plate -- so a load cannot end up floating
    // beside the link it is applied to.
    const at = constrainForceAnchor(selectedForce.link, trueCoord, 0);
    if (how === 'whole') selectedForce.moveAnchor(at);
    else selectedForce.moveApplicationPoint(at);
    return selectedForce;
  }

  /**
   * Whether this joint slides.
   *
   * One question, where there used to be four that could disagree. A slider was
   * a prismatic joint with a coincident pin joined by a block, so "does this
   * slide?" was asked of `connectedJoints` here and of `links` in `sliderFor`,
   * and only the block put the two joints in each other's lists at all. A slider
   * is one joint now (Stage 1 of `docs/joint-type-and-cylinder-plan.md`), so the
   * question is what the joint is.
   */
  isAttachedToSlider(lastRightClick: Joint | Link | Force | String) {
    return lastRightClick instanceof PrisJoint;
  }

  connectedToPrisJoint(joints: Joint[]) {
    return joints.some((joint) => joint instanceof PrisJoint);
  }

  /** The joint that slides, which is this joint when it is one. */
  getSliderJoint(joint: Joint): Joint {
    return joint;
  }

  /**
   * Turn a joint's traced path on, or off.
   *
   * One joint, one flag. A slider kept its path on the prismatic half of a
   * coincident pair, so this had to find that half and write through it -- and
   * it fell through every arm for the prismatic joint itself, which is a switch
   * that flips nothing. There is nothing left to hop to.
   */
  toggleCurve(lastRightClick: Joint | Link | Force | String) {
    if (!(lastRightClick instanceof RealJoint)) return;
    lastRightClick.showCurve = !lastRightClick.showCurve;
    this.saveTrace(lastRightClick.showCurve);
  }

  /**
   * A traced path is part of the drawing, so the drawing has to record it.
   *
   * `showCurve` rides the URL like everything else a shared link carries, and
   * it was the one thing in there that never reached the history: the toggle
   * left Undo disabled, and the next undo of anything else -- a drag made
   * minutes later -- replayed a URL written before the trace and switched it
   * off with no notice. In the URL and out of the history is the one place a
   * setting cannot be.
   */
  private saveTrace(shown: boolean): void {
    if (shown) this.injector.get(SettingsService).isShowTraces.next(true);
    // A display flag needs no solve. Rebuilding from the displayed pose would
    // make a paused frame the new t = 0; save() encodes against the real start.
    this.mechanismSrv.save();
    this.mechanismSrv.onMechUpdateState.next(2);
  }

  getLinkSubset(link: Link): Link[] {
    if (!(link instanceof RealLink)) {
      return [];
    }
    return link.subset;
  }

  getCenter(line: Line) {
    return (line as Arc).center;
  }

  /**
   * Whether this joint is drawn as fused rather than as a bearing.
   *
   * The two facts `jointTypeAt` reads: a Slide says it in `rotates` on the
   * sliding joint, every other joint says it in `isWelded`. One bit before a
   * slider became one joint, when the weld sat on the coincident pin -- which
   * is the object that used to draw this mark.
   */
  getWelded(joint: Joint) {
    if (joint instanceof PrisJoint) return !joint.rotates;
    return (joint as RealJoint).isWelded;
  }

  pickLinkAt(link: RealLink, selected: RealLink | undefined, event: MouseEvent): RealLink {
    const point = this.svgGrid.screenToModelFromXY(event.clientX, event.clientY);
    const defs = document.querySelector('#canvas defs');
    if (!defs) return link;
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // Chromium needs a connected SVG tree to resolve stroke geometry. A defs
    // child is measurable without painting anything or intercepting the pointer.
    defs.appendChild(hit);
    const cylinders = this.mechanismSrv.sealedStructures();
    try {
      return pickLink(this.mechanismSrv.links, link, selected, (leaf) => {
        const skeleton = this.settings.isSchematic ? schematicLink(leaf, cylinders) : '';
        if (skeleton) {
          hit.setAttribute('d', skeleton);
          hit.setAttribute('stroke', 'transparent');
          hit.setAttribute('stroke-width', String(this.svgGrid.scaleWithZoom(12)));
          return hit.isPointInStroke(new DOMPoint(point.x, point.y));
        }
        hit.setAttribute('d', linkArtwork(leaf, this.settings.drawingScale, cylinders));
        return hit.isPointInFill(new DOMPoint(point.x, point.y));
      });
    } finally {
      hit.remove();
    }
  }

  updateLastSelectedSublink(mouseEvent: MouseEvent, clickedObj: RealLink) {
    //Seach each link in the subset to see if the mouse is over it
    // use isPointInsideLink()
    //First convert the screen coordinates to true coordinates
    let trueCoords = this.svgGrid.screenToModel(new Coord(mouseEvent.clientX, mouseEvent.clientY));

    clickedObj.lastSelectedSublink = null;

    clickedObj.subset.forEach((link) => {
      if (this.isPointInsideLink(trueCoords, link as RealLink)) {
        clickedObj.lastSelectedSublink = link;
      }
    });
  }

  isPointInsideLink(startPosition: Coord, link: RealLink) {
    //Check if the point is inside of the shape created by the lines
    //First, draw a line that is infinitely long and check if it intersects with the shape an odd number of times
    const infiniteLine = new Line(startPosition, new Coord(10000, startPosition.y));

    let intersections = 0;
    link.initialExternalLines.forEach((line) => {
      const intersectionPoint = infiniteLine.intersectsWith(line);
      const otherIntersectionPoint = infiniteLine.clone().reverse().intersectsWith(line);

      //Add two to the intersection count if intersectionPoint and otherIntersectionPoint are not equal
      if (intersectionPoint && otherIntersectionPoint) {
        if (!intersectionPoint.equals(otherIntersectionPoint)) {
          intersections += 2;
        } else {
          intersections += 1;
        }
      } else if (intersectionPoint || otherIntersectionPoint) {
        intersections += 1;
      }
    });

    //If the number of intersections is odd, then the point is inside the shape
    return intersections % 2 === 1;
  }

  getPointDistance(x1: number, y1: number, x2: number, y2: number): number {
    let x = x2 - x1;
    let y = y2 - y1;
    return Math.sqrt(x * x + y * y);
  }

  /**
   * Whether this joint reads as driven.
   *
   * Its own flag. A slider's drive lived on the prismatic half of a coincident
   * pair while every surface was pointed at the pin, so this existed to make
   * the hop; one joint carries both now, and the hop is the identity.
   */
  isVisuallyInput(selectedJoint: RealJoint) {
    return selectedJoint.input;
  }
}
