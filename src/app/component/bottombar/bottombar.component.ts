import { Component, ChangeDetectionStrategy } from '@angular/core';
import { GlobalUnit } from '../../model/utils';
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
    private tabs: SelectedTabService
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
