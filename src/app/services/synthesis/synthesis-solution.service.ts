import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Coord } from 'src/app/model/coord';
import { RealLink } from 'src/app/model/link';
import { RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { ColorService } from '../color.service';
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
  /** Why the last driver could not be fitted, for the panel to show. */
  public driverRefusal: string | undefined;

  /** Where the preview stands, in crank degrees, and whether it is running. */
  public phase: number | null = null;
  public playing = false;
  public clockwise = true;

  /** Whether this design has been committed to the drawing. */
  public inserted = false;

  /** What the last insert put on the grid, so it can be taken back. */
  private insertedIds: { joints: string[]; links: string[] } = { joints: [], links: [] };

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
   * Throw away the answer because the question changed.
   *
   * Anything that moves a position, or changes what a solution has to satisfy,
   * lands here: the candidates on screen were computed for a design that no
   * longer exists, and showing them against the new one would be a lie the
   * reader has no way to spot.
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
    this.inserted = false;
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
    if (key !== this.cacheKey) {
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

  /** The driver dyad for the current solution, or why there is not one. */
  dyad(): DriverDyad | undefined {
    this.driverRefusal = undefined;
    const cand = this.driven();
    if (!cand || !this.driverWanted) return undefined;
    const result = driverDyadFor(cand.A, cand.ptsA);
    if ('refusal' in result) {
      this.driverRefusal = result.refusal;
      return undefined;
    }
    return result.dyad;
  }

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

  /**
   * Let go of the linkage a previous visit inserted, without removing it.
   *
   * Called on entering the tab. What was inserted is part of the drawing now,
   * like anything else drawn by hand -- offering to undo it a session later,
   * from a panel that has since been reset, would take away a machine the
   * reader has been working on.
   */
  forgetInsert(): void {
    this.insertedIds = { joints: [], links: [] };
    this.inserted = false;
  }

  /** Take back everything: the answer and the question both. */
  reset(): void {
    this.invalidate();
    this.driverWanted = false;
    this.driveOnFarPin = false;
    this.driverRefusal = undefined;
    this.showAll = false;
    this.inserted = false;
    this.insertedIds = { joints: [], links: [] };
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
   * Put the chosen solution on the grid, as a machine of its own.
   *
   * The one moment synthesis writes to the drawing. It builds the whole
   * linkage -- driver included -- before handing it over, so that one solve
   * sees the finished six-bar rather than a four-bar that grows a motor a
   * frame later.
   */
  insert(): boolean {
    const cand = this.driven();
    if (!cand || this.inserted) return false;
    const solution = solveFourBar(cand, cand.thetas[0], cand.sign);
    if (!solution) return false;

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
    this.insertedIds = {
      joints: joints.map((j) => j.id),
      links: links.map((l) => l.id),
    };
    this.inserted = true;
    this.playing = false;
    this.mechanismSrv.mechanismTimeStep = 0;
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
    return true;
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
    const { joints, links } = this.insertedIds;
    if (!joints.length && !links.length) {
      this.inserted = false;
      this.changed.next();
      return;
    }
    const goneLinks = new Set(links);
    const goneJoints = new Set(joints);
    this.mechanismSrv.forces = this.mechanismSrv.forces.filter(
      (force) => !goneLinks.has(force.link?.id ?? '')
    );
    this.mechanismSrv.links = this.mechanismSrv.links.filter((link) => !goneLinks.has(link.id));
    this.mechanismSrv.joints = this.mechanismSrv.joints.filter(
      (joint) => !goneJoints.has(joint.id)
    );
    this.insertedIds = { joints: [], links: [] };
    this.inserted = false;
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
  }
}
