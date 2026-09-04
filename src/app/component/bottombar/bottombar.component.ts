import { SvgGridService } from '../../services/svg-grid.service';
import { READINESS } from '../../ui-text';
import { ActiveObjService } from '../../services/active-obj.service';
import { holdOf } from '../../model/link-holds';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AngleUnit, GlobalUnit } from '../../model/utils';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { environment } from '../../../environments/environment';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ViewportService } from '../../services/viewport.service';
import { SynthesisBuilderService } from '../../services/synthesis/synthesis-builder.service';
import { SynthesisSolutionService } from '../../services/synthesis/synthesis-solution.service';
import { AnalysisCompareService } from '../../services/analysis-compare.service';

@Component({
  selector: 'app-bottombar',
  templateUrl: './bottombar.component.html',
  styleUrls: ['./bottombar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class BottombarComponent {
  settings = inject(SettingsService);
  readonly viewport = inject(ViewportService);
  mechanismSrv = inject(MechanismService);
  private tabs = inject(SelectedTabService);
  private svgGrid = inject(SvgGridService);
  private nup = inject(NumberUnitParserService);
  private activeObj = inject(ActiveObjService);
  private design = inject(SynthesisBuilderService);
  private solution = inject(SynthesisSolutionService);
  private comparison = inject(AnalysisCompareService);

  /**
   * Which mode the app is in, spelled the way the tabs spell it.
   *
   * The strip says it because the two modes now differ in what they will let
   * you do, and a rule that silently refuses is worse than one that is written
   * down somewhere.
   */
  get modeName(): string {
    switch (this.tabs.getCurrentTab()) {
      case TabID.SYNTHESIZE:
        return 'Synthesis';
      case TabID.EDIT:
        return 'Edit';
      case TabID.FORCE:
        return 'Force';
      default:
        return 'Kinematic';
    }
  }

  /**
   * What the mode means for the mechanism right now.
   *
   * Read-only, like the rest of this strip. It reports; the drawer is where
   * anything is done about it.
   */
  get status(): string {
    if (this.tabs.isAnalysisMode()) {
      // While a part is under the hand the strip names it, and after it says
      // what happened -- the same record the panel's head and the graphs'
      // earlier curves are drawn from, so the three cannot disagree.
      const tuned = this.comparison.record;
      if (tuned && this.comparison.live) return `Tuning ${tuned.label} \u2014 release to keep`;
      if (tuned) return `${tuned.label} moved`;
      // It used to say "Read-only here", which stopped being true when a drag
      // in an analysis mode became an edit. What is true is the narrower thing:
      // what exists can be tuned, and what the mechanism is made of is Edit's.
      return 'Drag to tune \u00b7 build in Edit';
    }
    if (this.tabs.getCurrentTab() === TabID.SYNTHESIZE) {
      return this.synthesisStatus();
    }
    // A selected bar that holds a value says so here: the hold is a rule the
    // canvas is playing by, and the strip is where the canvas states its rules.
    const selected = this.activeObj.objType === 'Link' ? this.activeObj.selectedLink : undefined;
    const held = holdOf(selected);
    if (selected && held && !this.mechanismSrv.isLockedTarget(selected)) {
      return `Link ${selected.name || selected.id}: fixed ${held}`;
    }
    const blockers = this.mechanismSrv.blockerCount();
    if (this.mechanismSrv.mechanisms.length === 0) {
      return 'Nothing to analyze yet';
    }
    if (blockers === 0) {
      return 'Ready to analyze';
    }
    return `${READINESS.fixes(blockers)} before analysis`;
  }

  /** The one status that is about the reader's hand, set in the accent ink. */
  get statusIsTuning(): boolean {
    return this.tabs.isAnalysisMode() && this.comparison.live && !!this.comparison.record;
  }

  /**
   * What Synthesis is waiting for, or what it has found.
   *
   * The rest of this strip reports on the drawing, and in Synthesis the drawing
   * is not what the reader is working on -- a design in progress is not on it
   * at all, so "Nothing to analyze yet" was true and useless. This says where
   * in the search they are, and after Insert it says what was left behind.
   */
  private synthesisStatus(): string {
    if (this.design.stage === 'chooser') return 'Pick a synthesis type to begin';
    if (this.design.regionDraw) {
      return 'Drag on the grid to draw the region the ground pins must sit in';
    }
    const placed = this.design.getAllPoses().length;
    const next = this.design.getFirstUndefinedPose();
    if (this.design.armed && next !== undefined) {
      return `Click the grid to place position ${next} of 3 · scroll to turn it`;
    }
    if (placed < 3) return `${placed} of 3 positions placed`;
    if (this.solution.generating) {
      return 'Searching for four-bars through these three positions…';
    }
    if (!this.solution.generated) {
      return 'Three positions placed · ready to generate solutions';
    }
    const kind = this.solution.dyad() ? 'six-bar' : 'four-bar';
    if (this.solution.inserted) {
      return `Inserted as a ${kind} · positions kept for reference`;
    }
    // As driven from the chosen pin, which is the linkage on the grid.
    const chosen = this.solution.driven();
    if (!chosen) return 'No solution meets the current requirements';
    const missed = 3 - chosen.onBranchCount;
    const how = chosen.defectFree
      ? 'walks all 3 on one assembly'
      : `branch defect at ${missed} position${missed === 1 ? '' : 's'}`;
    const count = this.solution.candidates().length;
    return `Solution ${chosen.name} of ${count} · ${how}`;
  }

  /**
   * The mobility, or a dash where there is no such number.
   *
   * `determineDegreesOfFreedom` answers NaN for a linkage with nothing pinned
   * down, which is right — mobility is counted against the world, and there is
   * no world yet — but it was going to the screen verbatim. That made "Degrees
   * of Freedom: NaN" the first thing anyone saw, because the first bar anybody
   * draws is not grounded yet. A dash says the same thing without asking the
   * reader to know what a floating-point value is; the Analyze panel is where
   * the reason belongs.
   */
  get degreesOfFreedom(): string {
    // One number per machine, because a drawing can hold several and their
    // mobilities are separate facts -- summing them would describe a mechanism
    // that is not on the screen.
    const each = this.mechanismSrv.mechanisms
      .map((mechanism) => mechanism.dof)
      .filter((dof) => typeof dof === 'number' && Number.isFinite(dof));
    return each.length > 0 ? each.join(', ') : '—';
  }

  /**
   * Where the cursor is, in the mechanism's own units.
   *
   * Absent until the pointer has been over the grid, because "0.00, 0.00" for a
   * cursor that has never been anywhere is a reading of nothing.
   */
  get cursor(): string {
    const at = this.svgGrid.cursorAt;
    if (!at) {
      return '';
    }
    // Through the one pair that knows the internal scale, like every other
    // length on screen -- see NumberUnitParserService.formatModelLength.
    const unit = this.settings.lengthUnit.value;
    return `${this.nup.formatModelLength(at.x, unit)}, ${this.nup.formatModelLength(at.y, unit)}`;
  }

  /**
   * The whole set of units in play, not just the length one.
   *
   * A mechanism is measured in four quantities and the strip has room to name
   * them, so naming one and leaving the reader to infer the rest is a saving
   * nobody asked for.
   */
  get unitSet(): string {
    // Length and mass go with the system; the force unit is a pick of its own
    // under metric and SI, so it is read rather than assumed -- the strip was
    // the one place still saying "N" over a drawing shown in kilograms-force.
    const lengths: Record<number, string> = {
      [GlobalUnit.ENGLISH]: 'in, lbm',
      [GlobalUnit.SI]: 'm, kg',
      [GlobalUnit.METRIC]: 'cm, g',
    };
    const base = lengths[this.settings.globalUnit.getValue()] ?? 'cm, g';
    const force = this.nup.unitLabel(this.settings.forceUnit.getValue());
    const angle = this.settings.angleUnit.getValue() === AngleUnit.RADIAN ? 'radians' : 'degrees';
    return `${base}, ${force}, ${angle}`;
  }

  humanReadableString(value: GlobalUnit) {
    switch (value) {
      case GlobalUnit.SI:
        return 'm (SI)';
      case GlobalUnit.ENGLISH:
        return 'in (english)';
      case GlobalUnit.METRIC:
        return 'cm (metric)';
      default:
        return 'Error';
    }
  }

  getVersion() {
    return environment.appVersion;
  }
}
