import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { MechanismOverviewService } from '../../services/mechanism-overview.service';
import { PartLinkComponent } from '../BLOCKS/part-link/part-link.component';
import { WhatIsThisNoteComponent } from '../what-is-this-note/what-is-this-note.component';
import { MechanismStatusComponent } from './mechanism-status.component';
import { MechanismSwitcherComponent } from './mechanism-switcher.component';

/**
 * A machine as the analysis modes describe it: what it is, what it matched,
 * what each link does, and the note on what it is for.
 *
 * It is what the analysis panel shows whenever no part is selected, since that
 * is when a reader is asking about the machine as a whole. Edit has its own,
 * about changing the machine rather than understanding it
 * (`edit-mechanism-panel`).
 */
@Component({
  selector: 'app-mechanism-panel',
  templateUrl: './mechanism-panel.component.html',
  styleUrls: ['./mechanism-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIcon,
    PartLinkComponent,
    WhatIsThisNoteComponent,
    MechanismStatusComponent,
    MechanismSwitcherComponent,
  ],
})
export class MechanismPanelComponent {
  protected overview = inject(MechanismOverviewService);
  private tabs = inject(SelectedTabService);

  /** The machine, by its place in `MechanismService.partitions`. */
  readonly index = input.required<number>();

  protected overviewOpen = true;
  protected linksOpen = true;
  protected noteOpen = true;

  /** What the panel points a reader at next, which differs by analysis. */
  protected get footerHint(): string {
    if (!this.overview.ready(this.index())) {
      return this.overview.blockers(this.index()) === 1
        ? 'This mechanism cannot run yet. Press the blocker above to see what it needs.'
        : 'This mechanism cannot run yet. Press the blockers above to see what it needs.';
    }
    return this.tabs.getCurrentTab() === TabID.FORCE
      ? 'Select a joint or link on the grid for the reactions it carries, or the input for the effort that drives this mechanism.'
      : 'Select a joint or link on the grid for its position, velocity and acceleration graphs. Drag one to tune it.';
  }
}
