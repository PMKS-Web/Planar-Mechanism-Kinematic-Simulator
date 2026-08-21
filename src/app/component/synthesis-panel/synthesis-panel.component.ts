import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MechanismService } from '../../services/mechanism.service';
import { NotificationService } from '../../services/notification.service';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { SynthesisSolutionService } from 'src/app/services/synthesis/synthesis-solution.service';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from 'src/app/services/settings.service';
import { COR } from 'src/app/services/synthesis/synthesis-util';
import {
  FourBarCandidate,
  describeCouplerPins,
  solveFourBar,
} from 'src/app/services/synthesis/synthesis-candidates';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { SvgGridService } from '../../services/svg-grid.service';

/** One requirement row: what it costs, and what switching it off buys. */
interface Requirement {
  key: string;
  on: boolean;
  label: string;
  detail: string;
  toggle: () => void;
  hasRegion?: boolean;
}

/** What one candidate looks like on its card in the gallery. */
interface CandidateCard {
  key: string;
  name: string;
  kind: string;
  thumb: string;
  thumbCoupler: string;
  selected: boolean;
  reachText: string;
  defectFree: boolean;
  metric: string;
}

const HELP = {
  length:
    'The length of the end-effector link — the part whose three positions you are designing for. ' +
    "The four-bar's coupler is pinned to this link, but not necessarily at its ends.",
  ref:
    'Which point on the end-effector link the coordinates describe, and the point it turns about: ' +
    'its back end, its middle, or its front end.',
  duplicate:
    'Copy the last position and offset it slightly — a quick start for three similar positions.',
  branch:
    'A four-bar can be closed two ways through the same pivots. Which way it is closed decides ' +
    'which of the three positions it can pass through without coming apart.',
  pin:
    'Which ground pin carries the input. A four-bar that will not turn from one ground pin often ' +
    'turns freely from the other.',
  driver:
    'Adds a crank and coupler sized so one full turn walks the linkage through all three ' +
    'positions, making it a six-bar a motor can run.',
  requirements:
    'What a solution has to satisfy to be listed. Every one you switch on narrows the search; ' +
    'switching one off widens it.',
};

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, ReactiveFormsModule, MatIcon, MatTooltip],
})
export class SynthesisPanelComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  mechanismSrv = inject(MechanismService);
  private notify = inject(NotificationService);
  design = inject(SynthesisBuilderService);
  solution = inject(SynthesisSolutionService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);
  svgGrid = inject(SvgGridService);

  readonly help = HELP;
  readonly rows = [1, 2, 3];

  private subs: Subscription[] = [];
  private syncing = false;
  private frame: number | undefined;

  poseForm = this.fb.group(
    {
      length: [''],
      p1x: [''],
      p1y: [''],
      p1theta: [''],
      p2x: [''],
      p2y: [''],
      p2theta: [''],
      p3x: [''],
      p3y: [''],
      p3theta: [''],
    },
    { updateOn: 'blur' }
  );

  regionForm = this.fb.group({ rx: [''], ry: [''], rw: [''], rh: [''] }, { updateOn: 'blur' });

  ngOnInit(): void {
    this.readFromModel();

    this.subs.push(
      this.design.valueChanges.subscribe((structural) => {
        this.readFromModel();
        this.claimWheel();
        // A moved position, a different reference point, a new requirement: the
        // candidates on screen were computed for a design that no longer
        // exists. Only a re-run may put them back.
        if (structural) this.solution.invalidate();
      })
    );

    this.subs.push(
      this.poseForm.valueChanges.subscribe((value) => {
        if (this.syncing) return;
        this.syncing = true;
        this.design.updatePosesFromForm({ ...value, cor: this.corIndex() });
        this.readFromModel();
        this.syncing = false;
        this.solution.invalidate();
        this.record();
      })
    );

    this.subs.push(
      this.regionForm.valueChanges.subscribe(() => {
        if (this.syncing) return;
        this.readRegionFromForm();
      })
    );

    this.subs.push(
      SettingsService._objectScale.subscribe(() => {
        this.design.getAllPoses().forEach((pose) => pose.recompute());
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.frame) cancelAnimationFrame(this.frame);
    // Leaving the tab hands the wheel back whatever state placing was left in.
    this.svgGrid.setWheelZoomEnabled(true);
  }

  /**
   * While a position is waiting to be dropped the wheel turns it, so the canvas
   * zoom has to stand down. Reconciled from one place -- every path that arms
   * or disarms placing reports through `valueChanges` -- rather than paired by
   * hand at each of them, because the failure of a missed pairing is a canvas
   * whose wheel is dead until the tab is left.
   */
  private claimWheel(): void {
    this.svgGrid.setWheelZoomEnabled(!this.design.armed);
  }

  // --- units ---------------------------------------------------------------

  private lengthText(model: number): string {
    return this.nup.formatModelLength(model, this.settings.lengthUnit.getValue());
  }

  private angleText(degrees: number): string {
    return this.nup.formatValueAndUnit(degrees, this.settings.angleUnit.getValue());
  }

  /** A model length in the reader's own unit, to two places, without a unit. */
  private plain(model: number): string {
    return (model / MODEL_SCALE).toFixed(2);
  }

  get lengthUnit(): string {
    return this.nup.unitLabel(this.settings.lengthUnit.getValue());
  }

  private corIndex(): string {
    return this.design.COR === COR.BACK ? '0' : this.design.COR === COR.CENTER ? '1' : '2';
  }

  // --- form <-> model ------------------------------------------------------

  private readFromModel(): void {
    this.syncing = true;
    const controls = this.poseForm.controls as unknown as Record<
      string,
      { setValue(value: string, options?: { emitEvent: boolean }): void }
    >;
    controls['length'].setValue(this.lengthText(this.design.length), { emitEvent: false });
    for (const i of this.rows) {
      const pose = this.design.isPoseDefined(i) ? this.design.getPose(i) : undefined;
      controls[`p${i}x`].setValue(pose ? this.lengthText(pose.position.x) : '', {
        emitEvent: false,
      });
      controls[`p${i}y`].setValue(pose ? this.lengthText(pose.position.y) : '', {
        emitEvent: false,
      });
      controls[`p${i}theta`].setValue(pose ? this.angleText(pose.thetaDegrees) : '', {
        emitEvent: false,
      });
      // Through the control rather than the element: a reactive form owns its
      // input's disabled state and writes it on every render, so a `disabled`
      // attribute set beside `formControlName` is removed again the moment
      // Angular looks at it.
      [`p${i}x`, `p${i}y`, `p${i}theta`].forEach((name) => {
        const control = this.poseForm.get(name)!;
        if (pose && control.disabled) control.enable({ emitEvent: false });
        if (!pose && control.enabled) control.disable({ emitEvent: false });
      });
    }
    const r = this.design.region;
    this.regionForm.setValue(
      {
        rx: this.lengthText(r.x),
        ry: this.lengthText(r.y),
        rw: this.lengthText(r.w),
        rh: this.lengthText(r.h),
      },
      { emitEvent: false }
    );
    this.syncing = false;
  }

  private readRegionFromForm(): void {
    const unit = this.settings.lengthUnit.getValue();
    const parsed = (['rx', 'ry', 'rw', 'rh'] as const).map((key) =>
      this.nup.parseModelLengthString(this.regionForm.get(key)!.value ?? '', unit)
    );
    if (parsed.some(([ok]) => !ok)) {
      this.readFromModel();
      return;
    }
    this.design.region = {
      x: parsed[0][1],
      y: parsed[1][1],
      w: Math.max(MODEL_SCALE, parsed[2][1]),
      h: Math.max(MODEL_SCALE, parsed[3][1]),
    };
    this.readFromModel();
    this.solution.invalidate();
    this.record();
  }

  /**
   * One entry in the history for one change to the design.
   *
   * The design rides in the same URL undo and redo are made of, so a step of it
   * has to be written the same way an edit to the drawing is -- once per
   * completed change, never per pointer-move. Dragging a position on the grid
   * records on release, for the same reason.
   */
  private record(): void {
    this.mechanismSrv.save();
  }

  // --- stage ---------------------------------------------------------------

  get isChooser(): boolean {
    return this.design.stage === 'chooser';
  }

  startMotionSynthesis(): void {
    this.design.stage = 'working';
    this.design.setArmed(false);
  }

  backToChooser(): void {
    this.design.stage = 'chooser';
    this.design.regionDraw = false;
    this.design.setArmed(false);
    this.solution.playing = false;
  }

  headerNote(): string {
    if (!this.design.isFullyDefined()) {
      return this.design.getAllPoses().length + ' of 3 positions placed';
    }
    if (!this.solution.generated) return '3 positions · no solutions yet';
    const count = this.solution.candidates().length;
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    return `${kind} · ${count} ${count === 1 ? 'candidate' : 'candidates'}`;
  }

  // --- the coupler ---------------------------------------------------------

  setReference(cor: COR): void {
    if (this.design.COR === cor) return;
    this.design.updatePosesFromForm({
      ...this.poseForm.value,
      cor: cor === COR.BACK ? '0' : cor === COR.CENTER ? '1' : '2',
    });
    this.design.valueChanges.next(true);
    this.record();
  }

  referenceOptions(): { label: string; value: COR; active: boolean }[] {
    return [
      { label: 'Back', value: COR.BACK, active: this.design.COR === COR.BACK },
      { label: 'Center', value: COR.CENTER, active: this.design.COR === COR.CENTER },
      { label: 'Front', value: COR.FRONT, active: this.design.COR === COR.FRONT },
    ];
  }

  // --- positions -----------------------------------------------------------

  get nextPositionNumber(): number {
    return this.design.getAllPoses().length + 1;
  }

  get showAddButton(): boolean {
    return !this.design.isFullyDefined();
  }

  get addLabel(): string {
    return this.design.armed ? 'Cancel' : 'Add position ' + this.nextPositionNumber;
  }

  toggleArmed(): void {
    this.design.setArmed(!this.design.armed);
  }

  get canDuplicate(): boolean {
    const placed = this.design.getAllPoses().length;
    return placed > 0 && placed < 3;
  }

  isPlaced(i: number): boolean {
    return this.design.isPoseDefined(i);
  }

  isSelectedRow(i: number): boolean {
    return this.design.selectedPose === i;
  }

  /** Whether this row is the one the pointer is currently about to fill. */
  isPreviewingRow(i: number): boolean {
    return !this.isPlaced(i) && this.design.armed && this.nextPositionNumber === i;
  }

  selectRow(i: number): void {
    if (this.isPlaced(i)) {
      this.design.selectedPose = i;
      this.design.setArmed(false);
    } else {
      // An empty row is the one place a reader looks to fill it in.
      this.design.setArmed(true);
    }
  }

  removeRow(event: Event, i: number): void {
    event.stopPropagation();
    if (!this.isPlaced(i)) return;
    this.design.removePose(i);
    this.solution.invalidate();
    this.record();
  }

  duplicateLast(): void {
    this.design.duplicateLastPose();
    this.record();
  }

  /**
   * Whether the chosen linkage reaches this position on the assembly it is
   * drawn in. Undefined when there is nothing to check it against.
   */
  reached(i: number): boolean | undefined {
    const cand = this.solution.chosen();
    if (!cand || !this.isPlaced(i)) return undefined;
    return cand.onBranch[i - 1];
  }

  rowStatusIcon(i: number): string {
    if (!this.isPlaced(i)) {
      return this.isPreviewingRow(i) ? 'ads_click' : 'radio_button_unchecked';
    }
    const ok = this.reached(i);
    if (ok === undefined) return 'help_outline';
    return ok ? 'check_circle' : 'link_off';
  }

  rowStatusTip(i: number): string {
    if (!this.isPlaced(i)) {
      return this.isPreviewingRow(i) ? 'Click the grid to drop this position' : 'Not placed yet';
    }
    const ok = this.reached(i);
    if (ok === undefined) {
      if (!this.design.isFullyDefined()) return 'Waiting for all three positions';
      return this.solution.generated
        ? 'No candidate linkage to check this position against yet'
        : 'Generate solutions to check this position';
    }
    return ok
      ? 'The chosen linkage passes through this position on its own assembly'
      : 'The chosen linkage reaches this position only on its other assembly — a branch defect';
  }

  // --- requirements --------------------------------------------------------

  requirements(): Requirement[] {
    const length = this.plain(this.design.length);
    return [
      {
        key: 'coupler',
        on: this.design.endsOnly,
        label: `Coupler is exactly ${length} ${this.lengthUnit}`,
        detail: this.design.endsOnly
          ? 'Both pins sit on the ends of the link'
          : 'Pins may slide along the link, so the coupler can be any length',
        toggle: () => this.toggleRequirement('endsOnly'),
      },
      {
        key: 'defect',
        on: !this.design.allowDefect,
        label: 'Reaches all 3 positions on one assembly',
        detail: this.design.allowDefect
          ? 'Linkages with a branch defect are listed too'
          : 'No taking the linkage apart between positions',
        toggle: () => this.toggleRequirement('allowDefect'),
      },
      {
        key: 'region',
        on: this.design.constrain,
        label: 'Ground pivots inside a region',
        detail: this.design.constrain
          ? 'Both pivots must land in the box on the grid'
          : 'Pivots may land anywhere',
        toggle: () => this.toggleRequirement('constrain'),
        hasRegion: this.design.constrain,
      },
    ];
  }

  private toggleRequirement(which: 'endsOnly' | 'allowDefect' | 'constrain'): void {
    if (which === 'endsOnly') this.design.endsOnly = !this.design.endsOnly;
    if (which === 'allowDefect') this.design.allowDefect = !this.design.allowDefect;
    if (which === 'constrain') {
      this.design.constrain = !this.design.constrain;
      this.design.regionDraw = false;
      this.design.setArmed(false);
      if (this.design.constrain) this.frameRegionOnCurrentAnswer();
    }
    // Only the defect filter leaves the enumeration standing: it hides members
    // of a list rather than changing which list it is.
    if (which === 'allowDefect') this.solution.changed.next();
    else this.solution.invalidate();
    this.record();
  }

  /** Open the region around what is already on screen, not around nothing. */
  private frameRegionOnCurrentAnswer(): void {
    const cand = this.solution.chosen();
    const points = cand ? [cand.A, cand.D] : this.design.getAllPoses().map((pose) => pose.position);
    if (!points.length) return;
    const pad = 3 * MODEL_SCALE;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    this.design.region = {
      x,
      y,
      w: Math.max(8 * MODEL_SCALE, Math.max(...xs) - x + pad),
      h: Math.max(8 * MODEL_SCALE, Math.max(...ys) - y + pad),
    };
    this.readFromModel();
  }

  /**
   * How strict the search currently is.
   *
   * It used to read "2 of 3 required", which names an obligation the reader
   * does not have: it looked like two of the three had to be switched on before
   * anything would happen. What the number reports is how much is being asked
   * of a solution, so it says that instead.
   */
  requirementCount(): string {
    const n =
      (this.design.endsOnly ? 1 : 0) +
      (this.design.allowDefect ? 0 : 1) +
      (this.design.constrain ? 1 : 0);
    return n === 0 ? 'nothing narrowing the search' : `${n} of 3 narrowing the search`;
  }

  regionSummary(): string {
    const r = this.design.region;
    return (
      `${this.plain(r.w)} × ${this.plain(r.h)} ${this.lengthUnit} at ` +
      `(${this.plain(r.x)}, ${this.plain(r.y)}) — drag the box or its corners`
    );
  }

  toggleRegionDraw(): void {
    this.design.regionDraw = !this.design.regionDraw;
    this.design.setArmed(false);
  }

  /** Named only when the requirements are what stands between reader and answer. */
  get requirementsBlocking(): boolean {
    return this.showResults && this.solution.candidates().length === 0;
  }

  requirementsBlockingNote(): string {
    if (this.design.constrain) {
      return (
        'Nothing satisfies all of these. The region is usually the first to give: widen it, ' +
        'move it, or switch it off.'
      );
    }
    if (this.design.endsOnly && !this.design.allowDefect) {
      return (
        'Nothing satisfies both. Letting the pins slide along the link is the usual first ' +
        'relaxation — it keeps the motion and changes only where the coupler is pinned.'
      );
    }
    if (this.design.endsOnly) {
      return (
        `No four-bar with a ${this.plain(this.design.length)} ${this.lengthUnit} coupler passes ` +
        'through these three positions. Let the pins slide, or move a position.'
      );
    }
    if (!this.design.allowDefect) {
      return (
        'Every construction through these three positions needs to be taken apart between them. ' +
        'Accept a branch defect to see them, or turn the middle position further.'
      );
    }
    return (
      'Nothing was found even with every requirement relaxed — the three positions are too close ' +
      'to a straight line.'
    );
  }

  // --- generating ----------------------------------------------------------

  get showGenerate(): boolean {
    return this.design.isFullyDefined() && !this.solution.generated;
  }

  generateNote(): string {
    const parts: string[] = [];
    if (this.design.endsOnly) {
      parts.push(`a ${this.plain(this.design.length)} ${this.lengthUnit} coupler`);
    }
    if (!this.design.allowDefect) parts.push('all three positions on one assembly');
    if (this.design.constrain) parts.push('both ground pivots in the region');
    return parts.length
      ? 'Search for four-bars with ' + parts.join(', ') + '.'
      : 'Search for any four-bar through these three positions.';
  }

  generate(): void {
    this.solution.generate();
  }

  // --- results -------------------------------------------------------------

  get showResults(): boolean {
    return this.design.isFullyDefined() && this.solution.generated;
  }

  candidateHeading(): string {
    const list = this.solution.candidates();
    if (!list.length) return 'No linkage meets the criteria';
    const strict = this.solution.strictCount;
    if (strict) {
      return `${strict} ${strict === 1 ? 'linkage works' : 'linkages work'} on one assembly`;
    }
    return `${list.length} candidate${list.length === 1 ? '' : 's'}, all with a branch defect`;
  }

  /**
   * The geometric explanation, for when no requirement is standing in the way.
   * With one switched on, the Requirements note is the better answer.
   */
  get showNoCandidateReason(): boolean {
    return (
      this.showResults &&
      this.solution.candidates().length === 0 &&
      !this.design.endsOnly &&
      this.design.allowDefect &&
      !this.design.constrain
    );
  }

  noCandidateReason(): string {
    const why = this.solution.rejections();
    if (why.degenerate && !why.tooBig) {
      return (
        'The three positions lie on one line, so no circle passes through the three positions of ' +
        'a coupler point. Turn the middle position, or move it off the line between the other two.'
      );
    }
    if (why.tooBig) {
      return (
        `${why.tooBig} of ${why.tried} constructions put a ground pivot further from the ` +
        'positions than the machine could sensibly reach — the three positions are close to a ' +
        'straight line. Turn the middle position further, or move it off the line between the ' +
        'other two.'
      );
    }
    return 'No four-bar of a buildable size passes through these three positions.';
  }

  visibleCandidates(): CandidateCard[] {
    const list = this.solution.candidates();
    const shown = this.solution.showAll ? list : list.slice(0, 3);
    const picked = this.solution.chosen();
    return shown.map((c) => this.toCard(c, picked));
  }

  private toCard(c: FourBarCandidate, picked: FourBarCandidate | null): CandidateCard {
    const pts = [c.A, c.B, c.C, c.D];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const k = Math.min(102 / Math.max(1e-6, maxX - minX), 32 / Math.max(1e-6, maxY - minY));
    const tx = (p: { x: number }) => (9 + (p.x - minX) * k).toFixed(1);
    const ty = (p: { y: number }) => (40 - (p.y - minY) * k).toFixed(1);
    return {
      key: c.key,
      name: c.name,
      kind: c.kind + ' · ' + c.branch.toLowerCase(),
      thumb:
        `M ${tx(c.A)} ${ty(c.A)} L ${tx(c.B)} ${ty(c.B)} ` +
        `M ${tx(c.C)} ${ty(c.C)} L ${tx(c.D)} ${ty(c.D)}`,
      thumbCoupler: `M ${tx(c.B)} ${ty(c.B)} L ${tx(c.C)} ${ty(c.C)}`,
      selected: !!picked && picked.key === c.key,
      defectFree: c.defectFree,
      reachText: c.defectFree ? 'all 3, one assembly' : `branch defect · ${c.onBranchCount} of 3`,
      metric:
        `min angle ${c.minTransmission}° · ` +
        (c.range.full ? 'full turn' : `${Math.round(c.range.to - c.range.from)}° swing`),
    };
  }

  get hasMoreCandidates(): boolean {
    return this.solution.candidates().length > 3;
  }

  moreLabel(): string {
    return this.solution.showAll ? 'Show fewer' : 'Show all ' + this.solution.candidates().length;
  }

  toggleAllCandidates(): void {
    this.solution.showAll = !this.solution.showAll;
  }

  pickCandidate(key: string): void {
    this.solution.pick(key);
  }

  hoverCandidate(key: string | null): void {
    this.solution.setHover(key);
  }

  // --- the chosen solution -------------------------------------------------

  get hasSolution(): boolean {
    return this.showResults && this.solution.chosen() !== null;
  }

  get solutionName(): string {
    return this.solution.chosen()?.name ?? '—';
  }

  branchOptions(): { label: string; active: boolean; available: boolean; key: string }[] {
    const cand = this.solution.chosen();
    const list = this.solution.candidates();
    return (['Open', 'Crossed'] as const).map((label) => {
      const sibling = cand
        ? list.find((c) => c.pair === cand.pair && c.branch === label)
        : undefined;
      return {
        label,
        active: !!cand && cand.branch === label,
        available: !!sibling,
        key: sibling?.key ?? '',
      };
    });
  }

  pickBranch(key: string): void {
    if (key) this.solution.pick(key);
  }

  pinOptions(): { label: string; far: boolean; active: boolean }[] {
    return [
      { label: 'Pin A', far: false, active: !this.solution.driveOnFarPin },
      { label: 'Pin D', far: true, active: this.solution.driveOnFarPin },
    ];
  }

  setPin(far: boolean): void {
    this.solution.setDriveOnFarPin(far);
  }

  toggleDriver(): void {
    this.solution.toggleDriver();
  }

  toggleDimensions(): void {
    this.solution.dimensionsOpen = !this.solution.dimensionsOpen;
  }

  dimensionsSummary(): string {
    const c = this.solution.driven();
    if (!c) return '';
    return [c.r1, c.d, c.r2, c.g].map((v) => this.plain(v)).join(' · ') + ' ' + this.lengthUnit;
  }

  dimensionRows(): { label: string; value: string }[] {
    const c = this.solution.driven();
    if (!c) return [];
    const rows = [
      { label: 'Ground link A–D', value: this.lengthText(c.g) },
      { label: 'Input crank', value: this.lengthText(c.r1) },
      { label: 'Coupler B–C', value: this.lengthText(c.d) },
      { label: 'Output rocker', value: this.lengthText(c.r2) },
      {
        label: 'Coupler pins',
        value: describeCouplerPins(c, this.design.length) + ' ' + this.lengthUnit,
      },
    ];
    const dyad = this.solution.dyad();
    if (dyad) {
      rows.push({ label: 'Driver crank', value: this.lengthText(dyad.crankLength) });
      rows.push({ label: 'Driver coupler', value: this.lengthText(dyad.couplerLength) });
    }
    return rows;
  }

  // --- previewing the motion -----------------------------------------------

  private direction = 1;

  togglePlay(): void {
    this.solution.playing = !this.solution.playing;
    if (this.solution.playing) this.step();
  }

  flipDirection(): void {
    this.solution.clockwise = !this.solution.clockwise;
  }

  /**
   * Walk the preview forward one frame.
   *
   * A linkage that turns fully wraps around; one that rocks reverses at the
   * ends of its travel, which is what the machine itself would do.
   */
  private step = (): void => {
    this.frame = undefined;
    if (!this.solution.playing) return;
    const cand = this.solution.driven();
    if (!cand) return;
    const range = cand.range;
    const stride = 1.4 * (this.solution.clockwise ? 1 : -1);
    let phase = this.solution.currentPhase() + this.direction * stride;
    if (range.full) {
      if (phase > range.to) phase -= 360;
      if (phase < range.from) phase += 360;
    } else if (phase > range.to || phase < range.from) {
      this.direction = -this.direction;
      phase = Math.max(range.from, Math.min(range.to, phase));
    }
    this.solution.phase = phase;
    this.solution.changed.next();
    this.frame = requestAnimationFrame(this.step);
  };

  scrubMin(): number {
    return Math.round(this.solution.driven()?.range.from ?? 0);
  }

  scrubMax(): number {
    return Math.round(this.solution.driven()?.range.to ?? 360);
  }

  scrubValue(): number {
    return Math.round(this.solution.currentPhase());
  }

  setScrub(event: Event): void {
    this.solution.setPhase(Number((event.target as HTMLInputElement).value));
  }

  alongPercent(): string {
    const cand = this.solution.driven();
    if (!cand) return '0%';
    const span = Math.max(1e-6, cand.range.to - cand.range.from);
    return (((this.solution.currentPhase() - cand.range.from) / span) * 100).toFixed(1) + '%';
  }

  /** Where each position falls along the crank's travel, for the track marks. */
  poseTicks(): { percent: string; reached: boolean }[] {
    const cand = this.solution.driven();
    if (!cand) return [];
    const range = cand.range;
    const span = Math.max(1e-6, range.to - range.from);
    return cand.thetas.map((theta, i) => {
      let a = theta;
      while (a < range.from) a += 360;
      while (a > range.to) a -= 360;
      const percent = Math.max(0, Math.min(100, ((a - range.from) / span) * 100));
      return { percent: percent.toFixed(1), reached: cand.onBranch[i] };
    });
  }

  angleLabel(): string {
    const phase = this.solution.currentPhase();
    return Math.round(((phase % 360) + 360) % 360) + '°';
  }

  previewNote(): string {
    const cand = this.solution.driven();
    if (!cand) return '';
    return cand.range.full
      ? 'full crank rotation'
      : `rocks through ${Math.round(cand.range.to - cand.range.from)}°`;
  }

  // --- committing ----------------------------------------------------------

  /**
   * Insert is offered whenever there is a solution to insert.
   *
   * It used to switch off once something had been inserted, which made the
   * mode a one-shot: the whole point of comparing seven linkages is to try one,
   * look at it, and try the next. Inserting again revises the machine this
   * design already put on the grid rather than adding another.
   */
  get canInsert(): boolean {
    return this.hasSolution;
  }

  get insertLabel(): string {
    if (!this.solution.inserted) return 'Insert into grid';
    return this.solutionIsOnGrid ? 'Inserted into grid' : 'Replace on grid';
  }

  /** Whether what is on the grid is the solution now being looked at. */
  get solutionIsOnGrid(): boolean {
    return this.solution.inserted && !this.solution.needsReinsert();
  }

  insert(force = false): void {
    const outcome = this.solution.insert(force);
    if (outcome === 'edited') {
      // Not a refusal and not a silent overwrite. The reader moved those joints
      // by hand, and only they know whether that work still matters -- so the
      // two things they could mean are on the message.
      this.notify.warning(
        'synthesis.replace-edited',
        `${this.solutionName} would replace the linkage on the grid, and it has been moved by ` +
          `hand since Synthesis put it there. Those changes would be lost.`,
        {
          actions: [
            { label: 'Replace it', run: () => this.insert(true) },
            {
              label: 'Keep it, insert a new one',
              run: () => {
                this.solution.releaseOwnership();
                this.insert();
              },
            },
          ],
        }
      );
      return;
    }
    if (outcome === 'done') this.record();
  }

  undoInsert(): void {
    this.solution.undoInsert();
  }

  insertedNote(): string {
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    return `Left on the grid as a ${kind}. Change a position and insert again to revise it.`;
  }

  deleteAll(): void {
    this.design.deleteAllPoses();
    this.design.regionDraw = false;
    this.design.setArmed(false);
    this.solution.reset();
    this.record();
  }

  /** Whether the preview would show anything, for the grid to ask as well. */
  hasPreview(): boolean {
    const cand = this.solution.driven();
    return !!cand && solveFourBar(cand, this.solution.currentPhase(), cand.sign) !== null;
  }
}
