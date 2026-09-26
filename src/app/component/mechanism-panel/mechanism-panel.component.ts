import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RealLink } from '../../model/link';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { RightPanelComponent } from '../right-panel/right-panel.component';
import { MechanismFact } from '../../model/mechanism/readiness';
import { MatIcon } from '@angular/material/icon';
import { ExportCatalogService } from '../../services/export/export-catalog.service';
import { panelRole } from '../../model/what-is-this/roles';
import { WhatIsThisService } from '../../services/what-is-this/what-is-this.service';
import { PartLinkComponent } from '../BLOCKS/part-link/part-link.component';
import { WhatIsThisNoteComponent } from '../what-is-this-note/what-is-this-note.component';

/** One line of the Links section: what a link is, and how long. */
interface LinkRow {
  /** The link itself, which its name points at on the grid. */
  part: RealLink;
  name: string;
  role: string;
  length: string;
}

/**
 * What a whole machine is, for when the selection is the machine rather than a
 * part of it.
 *
 * The same panel serves both modes because the facts do not change with the
 * question being asked — only the title above them and, in Edit, the two
 * buttons for acting on the thing as a whole.
 */
@Component({
  selector: 'app-mechanism-panel',
  templateUrl: './mechanism-panel.component.html',
  styleUrls: ['./mechanism-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, PartLinkComponent, WhatIsThisNoteComponent],
})
export class MechanismPanelComponent {
  mechanism = inject(MechanismService);
  activeObj = inject(ActiveObjService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private tabs = inject(SelectedTabService);
  private exportCatalog = inject(ExportCatalogService);
  private whatIsThis = inject(WhatIsThisService);

  /** Edit offers to rename and delete; analysis only reports. */
  readonly editable = input(false);

  overviewOpen = true;
  linksOpen = true;
  noteOpen = true;

  get index(): number {
    return this.activeObj.selectedMechanismIndex;
  }

  get id(): string {
    return this.mechanism.partitions[this.index]?.id ?? '';
  }

  get exists(): boolean {
    return this.index >= 0 && this.index < this.mechanism.partitions.length;
  }

  get ready(): boolean {
    return this.mechanism.mechanisms[this.index]?.isMechanismValid() ?? false;
  }

  get blockers(): number {
    return (
      this.mechanism
        .readinessOfEachMechanism()
        [this.index]?.checks.filter((check) => check.severity === 'blocker').length ?? 0
    );
  }

  get statusText(): string {
    if (this.ready) {
      return 'Ready';
    }
    const count = this.blockers;
    return count === 1 ? '1 blocker' : `${count} blockers`;
  }

  get facts(): MechanismFact[] {
    const facts = this.mechanism.readinessOfEachMechanism()[this.index]?.facts ?? [];
    const count = this.exportCatalog.partGroups(false)[this.index]?.parts.length ?? 0;
    return facts.map((fact) =>
      fact.label === 'Links / joints' ? { label: 'Objects', value: String(count) } : fact
    );
  }

  /**
   * Every link in the machine, with its job.
   *
   * The job is the one the fact sheet gives it (`model/what-is-this/roles.ts`),
   * read off the solved cycle: which body the input drives, which are pinned
   * to the ground, which turn all the way round. A machine that does not run
   * has no cycle to read, so its links are listed without one.
   */
  get links(): LinkRow[] {
    const partition = this.mechanism.partitions[this.index];
    if (!partition) {
      return [];
    }
    const jobs = this.whatIsThis.sheetFor(this.index)?.jobs ?? [];
    return partition.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .map((link) => {
        const job = jobs.find((candidate) => candidate.links.includes(link));
        return {
          part: link,
          // The name on the canvas, not the link's id: a body welded to a
          // barrel mount carries the buried inner end in its id (D14, S11), and
          // this list had it under `AA1D` while the tag beside it read `AD`.
          name: this.mechanism.visibleBodyName(link),
          role: job ? panelRole(job) : '',
          length: this.lengthOf(link),
        };
      });
  }

  /** What PMKS+ matched the machine as, most specific first, if anything. */
  get family(): string | undefined {
    const match = this.whatIsThis.sheetFor(this.index)?.family[0]?.family;
    return match ? match.charAt(0).toUpperCase() + match.slice(1) : undefined;
  }

  /** End to end, in the units the mechanism is drawn in. */
  private lengthOf(link: RealLink): string {
    const ends = link.joints;
    if (ends.length < 2) {
      return '—';
    }
    const span = Math.hypot(
      ends[ends.length - 1].x - ends[0].x,
      ends[ends.length - 1].y - ends[0].y
    );
    return this.nup.formatModelLength(span, this.settings.lengthUnit.value);
  }

  /** The drawer that answers the question this mode is asking. */
  openSetup(): void {
    RightPanelComponent.tabClicked(
      this.tabs.getCurrentTab() === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : RightPanelComponent.KINEMATIC_SETUP_TAB
    );
  }

  /** What the panel points a reader at next, which differs by analysis. */
  get footerHint(): string {
    if (this.editable()) {
      return 'Select one of its joints or links on the grid to edit that part.';
    }
    if (!this.ready) {
      const count = this.blockers;
      return count === 1
        ? 'This mechanism cannot run yet. Press the blocker above to see what it needs.'
        : 'This mechanism cannot run yet. Press the blockers above to see what it needs.';
    }
    return this.tabs.getCurrentTab() === TabID.FORCE
      ? 'Select a joint or link on the grid for the reactions it carries, or the input for the effort that drives this mechanism.'
      : 'Select a joint or link on the grid for its position, velocity and acceleration graphs.';
  }

  /** Select one of its parts instead, so the reader can edit that. */
  clearSelection(): void {
    this.activeObj.updateSelectedObj(null);
  }

  deleteMechanism(): void {
    this.mechanism.deleteMechanism(this.index);
  }
}
