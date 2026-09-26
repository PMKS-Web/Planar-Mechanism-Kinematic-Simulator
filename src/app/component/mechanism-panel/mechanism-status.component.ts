import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismOverviewService } from '../../services/mechanism-overview.service';
import { ChipComponent } from '../BLOCKS/chip/chip.component';
import { RightPanelComponent } from '../right-panel/right-panel.component';

/**
 * Whether a machine runs, as a chip that opens the setup drawer behind it, and
 * its code beside a name so the name can be matched to its playback row, which
 * has room only for the code.
 */
@Component({
  selector: 'app-mechanism-status',
  template: `<button type="button" class="mechStatus" (click)="openSetup()">
      <chip-block [kind]="overview.ready(index()) ? 'ok' : 'blocker'">{{
        overview.status(index())
      }}</chip-block>
    </button>
    @if (overview.name(index())) {
      <span class="mechCode">{{ overview.code(index()) }}</span>
    }`,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mechStatus {
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
    .mechCode {
      font-size: 12px;
      color: var(--text-tertiary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ChipComponent],
})
export class MechanismStatusComponent {
  protected overview = inject(MechanismOverviewService);
  private tabs = inject(SelectedTabService);

  readonly index = input.required<number>();

  /** The drawer that answers the question this mode is asking. */
  protected openSetup(): void {
    RightPanelComponent.tabClicked(
      this.tabs.getCurrentTab() === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }
}
