import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MOST_MACHINES } from '../../model/mechanism/mechanism-partition';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismOverviewService } from '../../services/mechanism-overview.service';
import { MechanismService } from '../../services/mechanism.service';
import { ViewportService } from '../../services/viewport.service';
import { ChipComponent } from '../BLOCKS/chip/chip.component';
import { EditableTitleComponent } from '../BLOCKS/editable-title/editable-title.component';
import { PartLinkComponent } from '../BLOCKS/part-link/part-link.component';
import { MechanismStatusComponent } from './mechanism-status.component';

/**
 * The machines on the grid, for when no part is selected: every one of them in
 * a list, or one of them in detail.
 *
 * A background click shows the list, and a row -- or the machine's title in
 * the setup drawer, or its row in the transport -- picks one: its family, its
 * facts and its links, with the other machines faded on the grid. "All
 * mechanisms" goes back. A drawing with one machine has nothing to choose
 * between and shows it in detail straight away.
 *
 * The same panel in Edit and in the analysis modes, because what a machine is
 * does not change with the question being asked; Edit adds Rename and Delete.
 */
@Component({
  selector: 'app-mechanism-panel',
  templateUrl: './mechanism-panel.component.html',
  styleUrls: ['./mechanism-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatIcon,
    ChipComponent,
    EditableTitleComponent,
    PartLinkComponent,
    MechanismStatusComponent,
  ],
})
export class MechanismPanelComponent {
  protected overview = inject(MechanismOverviewService);
  protected mechanism = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private tabs = inject(SelectedTabService);
  protected viewport = inject(ViewportService);

  /** Edit offers to rename and delete; the analysis modes only report. */
  readonly editable = input(false);

  protected readonly mostMachines = MOST_MACHINES;

  overviewOpen = true;
  linksOpen = true;

  /** Whether the panel lists every machine rather than showing one. */
  protected get showsList(): boolean {
    return this.overview.count() > 1 && !this.picked;
  }

  /** The machine shown in detail: the one picked, or the only one there is. */
  protected get index(): number {
    return this.picked ? this.activeObj.selectedMechanismIndex : 0;
  }

  private get picked(): boolean {
    return (
      this.activeObj.objType === 'Mechanism' &&
      this.overview.exists(this.activeObj.selectedMechanismIndex)
    );
  }

  /** Every machine, in the order the transport lists them. */
  protected get machines(): number[] {
    return this.mechanism.partitions.map((_, index) => index);
  }

  /** Under a row's name: its code, where a name hides it, and what PMKS+ recognized. */
  protected subtitle(index: number): string {
    const family = this.overview.family(index)?.name;
    const code = this.overview.name(index) ? this.overview.code(index) : undefined;
    return [code, family].filter(Boolean).join(' · ');
  }

  protected pick(index: number): void {
    this.mechanism.hoveredMechanismIndex = -1;
    this.activeObj.selectMechanism(index);
  }

  /** Back to every machine: nothing picked, as a click on the empty grid leaves it. */
  protected showAll(): void {
    this.activeObj.updateSelectedObj(null);
  }

  /** Pointing at a row lights its machine on the grid before it is picked. */
  protected point(index: number): void {
    this.mechanism.hoveredMechanismIndex = index;
  }

  protected readonly rename = (name: string) => this.mechanism.renameMechanism(this.index, name);

  protected readonly deleteMechanism = () => this.mechanism.deleteMechanism(this.index);

  /** What the analysis panel points a reader at next, which differs by mode. */
  protected get footerHint(): string {
    const press = this.viewport.isTouch() ? 'Tap' : 'Select';
    if (!this.overview.ready(this.index)) {
      return 'This mechanism cannot run yet. Its chip above opens what it needs.';
    }
    return this.tabs.getCurrentTab() === TabID.FORCE
      ? `${press} a joint or link on the grid for the reactions it carries, or the input for the effort that drives this mechanism.`
      : `${press} a joint or link on the grid for its position, velocity and acceleration graphs.`;
  }
}
