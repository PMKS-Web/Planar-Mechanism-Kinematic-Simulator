import { SvgGridService } from '../../services/svg-grid.service';
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
  private design = inject(SynthesisBuilderService);
  private solution = inject(SynthesisSolutionService);

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
      // Not "locked": that word belongs to the per-part Lock, and a student
      // who has locked nothing would go hunting for an unlock that isn't there.
      return 'Read-only here';
    }
    if (this.tabs.getCurrentTab() === TabID.SYNTHESIZE) {
      return this.synthesisStatus();
    }
    const blockers = this.mechanismSrv.blockerCount();
    if (this.mechanismSrv.mechanisms.length === 0) {
      return 'Nothing to analyze yet';
    }
    if (blockers === 0) {
      return 'Ready to analyze';
    }
    return `${blockers} ${blockers === 1 ? 'fix' : 'fixes'} before analysis`;
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
    const chosen = this.solution.chosen();
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
    const lengths: Record<number, string> = {
      [GlobalUnit.ENGLISH]: 'in, lbm, lbf',
      [GlobalUnit.SI]: 'm, kg, N',
      [GlobalUnit.METRIC]: 'cm, g, N',
    };
    const base = lengths[this.settings.globalUnit.getValue()] ?? 'cm, g, N';
    const angle = this.settings.angleUnit.getValue() === AngleUnit.RADIAN ? 'radians' : 'degrees';
    return `${base}, ${angle}`;
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
