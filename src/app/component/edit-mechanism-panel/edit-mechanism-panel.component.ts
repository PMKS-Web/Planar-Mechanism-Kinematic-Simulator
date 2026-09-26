import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MechanismOverviewService } from '../../services/mechanism-overview.service';
import { MechanismService } from '../../services/mechanism.service';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { PartLinkComponent } from '../BLOCKS/part-link/part-link.component';
import { MechanismStatusComponent } from '../mechanism-panel/mechanism-status.component';
import { MechanismSwitcherComponent } from '../mechanism-panel/mechanism-switcher.component';

/**
 * A machine as Edit shows it: its name to change, whether it runs, the links
 * it is built from, and Delete.
 *
 * It is what the Edit panel shows whenever no part is selected and the grid
 * holds a machine. The analysis modes have their own, about understanding the
 * machine rather than changing it (`mechanism-panel`), and the two share only
 * their facts (`MechanismOverviewService`).
 */
@Component({
  selector: 'app-edit-mechanism-panel',
  templateUrl: './edit-mechanism-panel.component.html',
  styleUrls: ['./edit-mechanism-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    EditableTitleComponent,
    PartLinkComponent,
    MechanismStatusComponent,
    MechanismSwitcherComponent,
  ],
})
export class EditMechanismPanelComponent {
  protected overview = inject(MechanismOverviewService);
  private mechanism = inject(MechanismService);

  /** The machine, by its place in `MechanismService.partitions`. */
  readonly index = input.required<number>();

  protected readonly rename = (name: string) => this.mechanism.renameMechanism(this.index(), name);

  protected readonly deleteMechanism = () => this.mechanism.deleteMechanism(this.index());

  /** The names the other machines have, which this one must not repeat. */
  protected get takenNames(): string[] {
    return this.mechanism.partitions
      .map((_, index) => this.overview.name(index))
      .filter((name, index): name is string => !!name && index !== this.index());
  }
}
