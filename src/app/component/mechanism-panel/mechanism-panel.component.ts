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
import { RightPanelComponent } from '../right-panel/right-panel.component';

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
  imports: [MatIcon, ChipComponent, EditableTitleComponent, PartLinkComponent],
})
export class MechanismPanelComponent {
  protected overview = inject(MechanismOverviewService);
  protected mechanism = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private tabs = inject(SelectedTabService);
  protected viewport = inject(ViewportService);

  /** Edit offers to rename and delete; the analysis modes only report. */
  readonly editable = input(false);

  /**
   * Whether edits are refused just now -- the mechanism is playing. Only the
   * controls that edit go inert: rows, the way back and the part links are
   * selection, which playback never refuses.
   */
  readonly frozen = input(false);

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

  /**
   * Under a row's name, what the mode is about: in Edit how free it is, in an
   * analysis what PMKS+ recognized it as. No code: a machine is its name, and
   * "Mechanism 2" where it has none.
   */
  protected subtitle(index: number): string | undefined {
    if (this.editable()) return this.overview.freedoms(index);
    // A machine that cannot run has no cycle to recognize, and a blank line
    // left its row shorter than its neighbors: say why instead.
    return this.overview.ready(index) ? this.overview.family(index).name : 'Not running';
  }

  /** The list's lead: what picking a row shows in this mode. */
  protected get listLead(): string {
    const press = this.viewport.isTouch() ? 'Tap' : 'Select';
    return this.editable()
      ? `${press} one to see its details.`
      : `${press} one for its family and motion.`;
  }

  /**
   * The way to graphs, said whether or not a machine is picked: a joint or a
   * link on the grid opens its graphs straight from the list.
   */
  protected get graphsHint(): string {
    const press = this.viewport.isTouch() ? 'Tap' : 'Select';
    return this.tabs.getCurrentTab() === TabID.FORCE
      ? `${press} a joint or link on the grid for the reactions it carries, or the input for the effort that drives it.`
      : `${press} a joint or link on the grid for its position, velocity and acceleration graphs.`;
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

  /** "2 things to fix", for the banner over a machine that cannot run. */
  protected get fixesBeforeAnalysis(): string {
    const count = this.overview.blockers(this.index);
    return count === 1 ? '1 thing to fix' : `${count} things to fix`;
  }

  /** The drawer that lists what the machine needs, opened rather than toggled. */
  protected openSetup(): void {
    RightPanelComponent.insistOn(RightPanelComponent.KINEMATIC_SETUP_TAB);
  }

  /** What the analysis panel points a reader at under one machine. */
  protected get footerHint(): string {
    return this.overview.ready(this.index)
      ? this.graphsHint
      : 'This mechanism cannot run yet. Its chip above opens what it needs.';
  }
}
