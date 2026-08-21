import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Coord } from 'src/app/model/coord';
import { RealLink } from 'src/app/model/link';
import { RealJoint, RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { ColorService } from '../color.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { driverDyadFor, DriverDyad } from './driver-dyad';
import {
  CandidateRejections,
  FourBarCandidate,
  drivenFromFarPin,
  enumerateCandidates,
  meet,
  rankCandidates,
  solveFourBar,
} from './synthesis-candidates';

/**
 * The answers, as opposed to the question.
 *
 * SynthesisBuilderService owns what the reader asked for -- three positions of
 * an end-effector link, and what a solution has to satisfy. This owns what
 * comes back: the candidate four-bars, which one is being looked at, how it is
 * being driven, where the preview has been scrubbed to, and the single moment
 * the answer stops being a preview and becomes part of the drawing.
 *
 * Nothing here touches the grid until `insert()` is called. That is the whole
 * point of the redesign: synthesis used to rebuild the mechanism on every
 * nudge of a coordinate, which made comparing two solutions impossible --
 * looking at the second one destroyed the first.
 */
/**
 * How long the search reports itself for, at the least.
 *
 * Not a delay on the work -- the work starts at once -- but a floor under how
 * briefly the progress state may flash past. Under about a second the reader
 * sees a button flicker rather than a search happen.
 */
const MIN_SEARCH_VISIBLE_MS = 1100;

/**
 * How far a joint has to have moved to count as moved by hand.
 *
 * A tenth of a user unit. Solving is deterministic, so an untouched linkage
 * comes back at exactly the coordinates it was written at; this is only here so
 * that floating-point drift through a rebuild cannot read as an edit.
 */
const MOVED_BY_HAND = 0.1 * MODEL_SCALE;

@Injectable({ providedIn: 'root' })
export class SynthesisSolutionService {
  private design = inject(SynthesisBuilderService);
  private mechanismSrv = inject(MechanismService);
  private colors = inject(ColorService);

  /** Fires when the answer changes, for the grid and the panel to redraw. */
  public changed = new Subject<void>();

  /** Whether a search has been run against the design as it now stands. */
  public generated = false;
  /** Whether one is running: the panel shows it as work, once. */
  public generating = false;

  /** Which candidate the reader has picked, and which they are hovering. */
  public candidateKey: string | null = null;
  public hoverKey: string | null = null;
  public showAll = false;
  public dimensionsOpen = false;

  /** Drive from the far ground pin, and put a driver dyad on the input. */
  public driveOnFarPin = false;
  public driverWanted = false;
  /** Where the preview stands, in crank degrees, and whether it is running. */
  public phase: number | null = null;
  public playing = false;
  public clockwise = true;

  /**
   * Where each joint stood when synthesis last wrote it.
   *
   * The one thing that cannot be derived from the drawing: whether the linkage
   * on the grid is still the one synthesis produced, or one the reader has
   * since moved by hand. Held in memory only -- after a reload there is nothing
   * to compare against, and the honest default there is to assume nothing has
   * been touched rather than to nag about an edit that may never have happened.
   */
  private writtenAt = new Map<string, { x: number; y: number }>();

  private cacheKey = '';
  private cached: FourBarCandidate[] = [];
  private cachedRejections: CandidateRejections = {
    tried: 0,
    degenerate: 0,
    tooBig: 0,
    alike: 0,
    outsideRegion: 0,
  };
  /** How many of the candidates found work on a single assembly. */
  public strictCount = 0;

  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Whether a gesture is in flight, so the search should hold still.
   *
   * Set by the canvas while a position is being dragged. The enumeration walks
   * a full crank revolution for every candidate; running it on each pointermove
   * would make the drag stutter for an answer nobody can read mid-gesture. The
   * positions themselves still follow the pointer -- they are drawn from the
   * design, not from the search -- and the answer catches up on release.
   */
  public interactive = false;

  /**
   * Throw away the answer because the *question* changed.
   *
   * Only for changes that alter what is being searched for: a position added
   * or removed, or a requirement switched. Those change which linkages are
   * even candidates, so the reader is sent back to Generate.
   *
   * Moving a position does not land here. It changes the answer, not the
   * question, and the search keeps up with it by itself: `candidates()` is
   * keyed on the design, so a nudge simply recomputes, and the chosen
   * candidate -- identified by where its pins sit on the link -- survives.
   */
  invalidate(): void {
    this.generated = false;
    this.generating = false;
    this.candidateKey = null;
    this.hoverKey = null;
    this.phase = null;
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.changed.next();
  }

  /** A change that leaves the candidates standing -- a different pick, say. */
  private touch(): void {
    this.phase = null;
    this.changed.next();
  }

  /**
   * Run the search.
   *
   * The enumeration is real work -- it constructs a circle centre for every
   * pair of pin positions and then walks a full crank revolution for each
   * candidate -- but on a small design it finishes in well under a tenth of a
   * second, and a button labelled "Generate solutions" that produces its answer
   * in one frame reads as though nothing happened. So the progress state has a
   * floor rather than a fake delay: the search starts immediately, and the bar
   * stays up until it has been visible long enough to be read. A slower search
   * simply takes longer, and the bar tells the truth about it.
   */
  generate(): void {
    if (this.generating || !this.design.isFullyDefined()) return;
    this.generating = true;
    this.changed.next();
    if (this.timer) clearTimeout(this.timer);
    const started = Date.now();
    // Off the frame the click landed on, so the bar is painted before the
    // enumeration blocks the thread.
    this.timer = setTimeout(() => {
      this.warmCandidates();
      const remaining = Math.max(0, MIN_SEARCH_VISIBLE_MS - (Date.now() - started));
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.generating = false;
        this.generated = true;
        this.candidateKey = null;
        this.changed.next();
      }, remaining);
    }, 30);
  }

  /** Do the search now, so the wait is spent on it rather than after it. */
  private warmCandidates(): void {
    const key = this.design.searchKey();
    if (key === this.cacheKey) return;
    const result = enumerateCandidates(this.design.search());
    this.cacheKey = key;
    this.cached = result.candidates;
    this.cachedRejections = result.rejections;
  }

  /** Every candidate the current design admits, best first, at most eight. */
  candidates(): FourBarCandidate[] {
    if (!this.generated || !this.design.isFullyDefined()) return [];
    const key = this.design.searchKey();
    // Held still through a drag: the last answer stays on screen while the
    // position moves under it, and the search runs once when the hand lets go.
    if (key !== this.cacheKey && !this.interactive) {
      const result = enumerateCandidates(this.design.search());
      this.cacheKey = key;
      this.cached = result.candidates;
      this.cachedRejections = result.rejections;
    }
    let list = this.cached;
    this.strictCount = list.filter((c) => c.defectFree).length;
    if (!this.design.allowDefect) list = list.filter((c) => c.defectFree);
    return rankCandidates(list);
  }

  rejections(): CandidateRejections {
    return this.cachedRejections;
  }

  /** The candidate on screen: what is hovered wins over what is picked. */
  chosen(): FourBarCandidate | null {
    const list = this.candidates();
    if (!list.length) return null;
    const hovered = this.hoverKey ? list.find((c) => c.key === this.hoverKey) : undefined;
    if (hovered) return hovered;
    return list.find((c) => c.key === this.candidateKey) ?? list[0];
  }

  /** The candidate that was picked, ignoring the hover, for the ghost to show. */
  picked(): FourBarCandidate | null {
    const list = this.candidates();
    if (!list.length) return null;
    return list.find((c) => c.key === this.candidateKey) ?? list[0];
  }

  /** The chosen candidate as it is actually driven -- from A, or from D. */
  driven(cand: FourBarCandidate | null = this.chosen()): FourBarCandidate | null {
    if (!cand) return null;
    if (!this.driveOnFarPin) return cand;
    const swapped = drivenFromFarPin(cand);
    swapped.name = cand.name;
    swapped.branch = cand.branch;
    swapped.key = cand.key;
    swapped.pair = cand.pair;
    return swapped;
  }

  /**
   * Why a driver cannot be fitted to the current solution, or nothing.
   *
   * Asked independently of whether one is wanted: the panel needs to know
   * before the switch is pressed, not after.
   */
  driverAvailability(): string | undefined {
    const cand = this.driven();
    if (!cand) return undefined;
    const result = driverDyadFor(cand.A, cand.ptsA);
    return 'refusal' in result ? result.refusal : undefined;
  }

  /** The driver dyad for the current solution, if one is wanted and fits. */
  dyad(): DriverDyad | undefined {
    const cand = this.driven();
    if (!cand || !this.driverWanted) return undefined;
    const result = driverDyadFor(cand.A, cand.ptsA);
    return 'refusal' in result ? undefined : result.dyad;
  }

  /**
   * How far the preview may actually be driven.
   *
   * Without a driver this is the four-bar's own travel. With one it is less,
   * and has to be: the dyad is sized to carry the input across the span the
   * three positions occupy, not across a whole revolution, so beyond that span
   * its crank and coupler no longer reach the pin they drive. The elbow simply
   * has no solution there -- and the preview, solving it per frame, dropped the
   * driver's two links for those frames and flickered.
   *
   * Walked outward from position 1, so what is offered is one continuous run
   * the machine could really make.
   */
  drivenRange(): { from: number; to: number; full: boolean } {
    const cand = this.driven();
    if (!cand) return { from: 0, to: 360, full: false };
    const dyad = this.dyad();
    if (!dyad) return cand.range;

    const key = cand.key + ':' + this.driveOnFarPin + ':' + this.design.searchKey();
    if (this.driverRangeKey === key) return this.driverRange;

    const closes = (deg: number): boolean => {
      const solved = solveFourBar(cand, deg, cand.sign);
      if (!solved) return false;
      return meet(dyad.ground, dyad.crankLength, solved.B, dyad.couplerLength) !== null;
    };
    const start = cand.thetas[0];
    let from = start;
    let to = start;
    const STEP = 0.5;
    for (let deg = start + STEP; deg <= cand.range.to; deg += STEP) {
      if (!closes(deg)) break;
      to = deg;
    }
    for (let deg = start - STEP; deg >= cand.range.from; deg -= STEP) {
      if (!closes(deg)) break;
      from = deg;
    }
    this.driverRangeKey = key;
    this.driverRange = { from, to, full: cand.range.full && to - from >= 359 };
    return this.driverRange;
  }

  private driverRangeKey = '';
  private driverRange = { from: 0, to: 360, full: false };

  /** Where the preview stands now, in crank degrees. */
  currentPhase(): number {
    const cand = this.driven();
    if (!cand) return 0;
    return this.phase === null ? cand.thetas[0] : this.phase;
  }

  /** The four pin positions of the preview at the current phase. */
  previewPose(): { A: Coord; B: Coord; C: Coord; D: Coord } | null {
    const cand = this.driven();
    if (!cand) return null;
    return solveFourBar(cand, this.currentPhase(), cand.sign);
  }

  pick(key: string): void {
    this.candidateKey = key;
    this.hoverKey = null;
    this.touch();
  }

  setHover(key: string | null): void {
    this.hoverKey = key;
    this.changed.next();
  }

  setDriveOnFarPin(far: boolean): void {
    this.driveOnFarPin = far;
    this.touch();
  }

  toggleDriver(): void {
    this.driverWanted = !this.driverWanted;
    this.touch();
  }

  setPhase(phase: number): void {
    this.phase = phase;
    this.playing = false;
    this.changed.next();
  }

  /** Take back everything: the answer and the question both. */
  reset(): void {
    this.invalidate();
    this.driverWanted = false;
    this.driveOnFarPin = false;
    this.showAll = false;
    this.releaseOwnership();
  }

  // --- committing to the drawing -----------------------------------------

  /** As many ids as asked for, none of which anything on the grid is using. */
  private nextLetters(count: number): string[] {
    const taken: string[] = [];
    for (let i = 0; i < count; i++) {
      taken.push(this.mechanismSrv.determineNextLetter(taken));
    }
    return taken;
  }

  /**
   * What the design owns on the grid right now.
   *
   * Three states worth telling apart, because each calls for something
   * different:
   *
   *   'none'        nothing of ours is there -- the first insert, or the
   *                 reader deleted it, or Undo stepped back past it.
   *   'ours'        exactly what we wrote, untouched. Insert may replace it
   *                 without asking: it is our own previous answer.
   *   'edited'      still ours, still separable, but moved by hand. Replacing
   *                 it would throw that work away, so the reader chooses.
   *   'entangled'   joined to something else in the drawing, or half deleted.
   *                 We can no longer take it back cleanly, so we stop claiming
   *                 it and the next insert makes a new machine.
   */
  ownership(): 'none' | 'ours' | 'edited' | 'entangled' {
    const ids = new Set(this.design.ownedJointIds);
    if (ids.size === 0) return 'none';
    const owned = this.mechanismSrv.joints.filter((joint) => ids.has(joint.id));
    if (owned.length === 0) return 'none';
    if (owned.length !== ids.size) return 'entangled';
    // A joint of ours pinned to a joint that is not ours means the two machines
    // have been joined. Taking ours back would either leave a link hanging off
    // nothing or cut into a machine that was never ours to touch.
    const joinedOutward = owned.some((joint) =>
      (joint as RealJoint).connectedJoints?.some((other) => !ids.has(other.id))
    );
    if (joinedOutward) return 'entangled';
    if (this.writtenAt.size === 0) return 'ours';
    const moved = owned.some((joint) => {
      const was = this.writtenAt.get(joint.id);
      return !was || Math.hypot(joint.x - was.x, joint.y - was.y) > MOVED_BY_HAND;
    });
    return moved ? 'edited' : 'ours';
  }

  /** Whether the design's own linkage is on the grid, in any condition. */
  get inserted(): boolean {
    const state = this.ownership();
    return state === 'ours' || state === 'edited';
  }

  /**
   * Whether the linkage on the grid is a different solution from the one on
   * screen -- so Insert would change the drawing rather than confirm it.
   */
  needsReinsert(): boolean {
    const cand = this.driven();
    if (!cand || this.ownership() === 'none') return true;
    const solved = solveFourBar(cand, cand.thetas[0], cand.sign);
    if (!solved) return true;
    const owned = new Map(
      this.mechanismSrv.joints
        .filter((joint) => this.design.ownedJointIds.includes(joint.id))
        .map((joint) => [joint.id, joint])
    );
    // The four pins the four-bar would be built from, in the order insert
    // writes them. Anything else on the grid under our ids means a different
    // answer is standing there.
    const wanted = [solved.A, solved.B, solved.C, solved.D];
    const ids = this.design.ownedJointIds;
    if (owned.size < wanted.length) return true;
    return wanted.some((point, i) => {
      const joint = owned.get(ids[i]);
      return !joint || Math.hypot(joint.x - point.x, joint.y - point.y) > MOVED_BY_HAND;
    });
  }

  /** Stop claiming the linkage on the grid, without removing it. */
  releaseOwnership(): void {
    this.design.ownedJointIds = [];
    this.writtenAt.clear();
    this.changed.next();
  }

  /**
   * Put the chosen solution on the grid, replacing the one this design put
   * there last time.
   *
   * The one moment synthesis writes to the drawing. It builds the whole
   * linkage -- driver included -- before handing it over, so that one solve
   * sees the finished six-bar rather than a four-bar that grows a motor a
   * frame later.
   *
   * Returns 'edited' without writing anything when replacing would throw away
   * work done by hand; the caller asks, and calls again with `force` if the
   * answer is yes.
   */
  insert(force = false): 'done' | 'edited' | 'nothing' {
    const cand = this.driven();
    if (!cand) return 'nothing';
    const solution = solveFourBar(cand, cand.thetas[0], cand.sign);
    if (!solution) return 'nothing';

    const held = this.ownership();
    if (held === 'edited' && !force) return 'edited';
    if (held === 'entangled') this.releaseOwnership();
    else if (held !== 'none') this.removeOwned();

    const dyad = this.dyad();
    const [idA, idB, idC, idD, idE, idF] = this.nextLetters(6);
    // With a driver on the linkage neither ground pin is the input at all; the
    // motor sits on the driver's own ground and turns the whole train.
    const drivenDirectly = !dyad;

    const jointA = new RevJoint(idA, solution.A.x, solution.A.y, drivenDirectly, true);
    const jointB = new RevJoint(idB, solution.B.x, solution.B.y, false, false);
    const jointC = new RevJoint(idC, solution.C.x, solution.C.y, false, false);
    const jointD = new RevJoint(idD, solution.D.x, solution.D.y, false, true);

    jointA.connectedJoints.push(jointB);
    jointB.connectedJoints.push(jointA, jointC);
    jointC.connectedJoints.push(jointB, jointD);
    jointD.connectedJoints.push(jointC);

    const crank = new RealLink(idA + idB, [jointA, jointB]);
    crank.fill = this.colors.getLinkColorFromIndex(0);
    const coupler = new RealLink(idB + idC, [jointB, jointC]);
    coupler.fill = this.colors.getLinkColorFromIndex(1);
    const rocker = new RealLink(idC + idD, [jointC, jointD]);
    rocker.fill = this.colors.getLinkColorFromIndex(0);

    jointA.links.push(crank);
    jointB.links.push(crank, coupler);
    jointC.links.push(coupler, rocker);
    jointD.links.push(rocker);

    const joints = [jointA, jointB, jointC, jointD];
    const links = [crank, coupler, rocker];

    if (dyad) {
      // The two lengths the sizing solved for are the distances between these
      // three points, so placing the pins is all it takes to realise them.
      const elbow = meet(dyad.ground, dyad.crankLength, solution.B, dyad.couplerLength);
      if (elbow) {
        const motor = new RevJoint(idE, dyad.ground.x, dyad.ground.y, true, true);
        const knee = new RevJoint(idF, elbow[0].x, elbow[0].y, false, false);
        motor.connectedJoints.push(knee);
        knee.connectedJoints.push(motor, jointB);
        jointB.connectedJoints.push(knee);

        const driverCrank = new RealLink(idE + idF, [motor, knee]);
        driverCrank.fill = this.colors.getLinkColorFromIndex(2);
        const driverCoupler = new RealLink(idF + idB, [knee, jointB]);
        driverCoupler.fill = this.colors.getLinkColorFromIndex(3);

        motor.links.push(driverCrank);
        knee.links.push(driverCrank, driverCoupler);
        jointB.links.push(driverCoupler);

        joints.push(motor, knee);
        links.push(driverCrank, driverCoupler);
      } else {
        // Sized but not assemblable in the position the linkage is drawn in.
        // The four-bar still stands and still passes through the positions, so
        // it is left drivable by hand rather than made useless by the refusal.
        jointA.input = true;
      }
    }

    this.mechanismSrv.mergeToJoints(joints);
    this.mechanismSrv.mergeToLinks(links);
    this.design.ownedJointIds = joints.map((joint) => joint.id);
    this.writtenAt = new Map(joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
    this.playing = false;
    this.mechanismSrv.mechanismTimeStep = 0;
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
    return 'done';
  }

  /**
   * Take the design's own linkage off the grid.
   *
   * By id, and only links every one of whose joints is ours -- a link that
   * reaches outward belongs half to something else, and `ownership()` has
   * already refused to call that ours. Forces on a removed link go with it: a
   * force on a link that no longer exists belongs to no mechanism.
   */
  private removeOwned(): void {
    const ids = new Set(this.design.ownedJointIds);
    const goneLinks = new Set(
      this.mechanismSrv.links
        .filter((link) => link.joints.every((joint) => ids.has(joint.id)))
        .map((link) => link.id)
    );
    this.mechanismSrv.forces = this.mechanismSrv.forces.filter(
      (force) => !goneLinks.has(force.link?.id ?? '')
    );
    this.mechanismSrv.links = this.mechanismSrv.links.filter((link) => !goneLinks.has(link.id));
    this.mechanismSrv.joints = this.mechanismSrv.joints.filter((joint) => !ids.has(joint.id));
    this.design.ownedJointIds = [];
    this.writtenAt.clear();
  }

  /**
   * Take back the linkage the last insert put on the grid.
   *
   * By id, and only the ids that insert recorded: anything else on the grid
   * was drawn by hand or left by an earlier insert and is not this one's to
   * remove. Forces on a removed link go with it -- a force on a link that no
   * longer exists belongs to no mechanism.
   */
  undoInsert(): void {
    if (this.ownership() === 'none') {
      this.releaseOwnership();
      return;
    }
    this.removeOwned();
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
  }
}
