import { SvgGridService } from '../../services/svg-grid.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { MODEL_SCALE } from '../../model/render-scale';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AngleUnit, GlobalUnit } from '../../model/utils';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { environment } from '../../../environments/environment';
import { SelectedTabService, TabID } from '../../selected-tab.service';

@Component({
  selector: 'app-bottombar',
  templateUrl: './bottombar.component.html',
  styleUrls: ['./bottombar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class BottombarComponent {
  constructor(
    public settings: SettingsService,
    public mechanismSrv: MechanismService,
    private tabs: SelectedTabService,
    private svgGrid: SvgGridService,
    private nup: NumberUnitParserService
  ) {}

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
      return 'Geometry locked';
    }
    const blockers = this.mechanismSrv.blockerCount();
    if (this.mechanismSrv.mechanisms.length === 0) {
      return 'Nothing to analyse yet';
    }
    if (blockers === 0) {
      return 'Ready to analyse';
    }
    return `${blockers} ${blockers === 1 ? 'fix' : 'fixes'} before analysis`;
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
    const unit = this.nup.unitLabel(this.settings.lengthUnit.value);
    const show = (value: number) => (value / MODEL_SCALE).toFixed(2);
    return `${show(at.x)} ${unit}, ${show(at.y)} ${unit}`;
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
