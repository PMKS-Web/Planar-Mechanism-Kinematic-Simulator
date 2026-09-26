import { Injectable, inject } from '@angular/core';
import { RealLink } from '../model/link';
import { mechanismLabel, mechanismName } from '../model/mechanism/mechanism-name';
import { MechanismFact } from '../model/mechanism/readiness';
import { panelRole } from '../model/what-is-this/roles';
import { ExportCatalogService } from './export/export-catalog.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';
import { WhatIsThisService } from './what-is-this/what-is-this.service';

/** One line of the Links section: what a link is, and how long. */
export interface LinkRow {
  /** The link itself, which its name points at on the grid. */
  part: RealLink;
  name: string;
  role: string;
  length: string;
}

/**
 * What the two machine panels say about one machine, Edit's and the analysis
 * modes': its name, whether it runs, its facts and its links. The panels differ
 * in what they offer around these; the facts are the same facts.
 */
@Injectable({ providedIn: 'root' })
export class MechanismOverviewService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private exportCatalog = inject(ExportCatalogService);
  private whatIsThis = inject(WhatIsThisService);

  exists(index: number): boolean {
    return index >= 0 && index < this.mechanism.partitions.length;
  }

  /** "Pump jack", or "Mechanism M2" for a machine nobody named. */
  title(index: number): string {
    return mechanismLabel(this.mechanism.partitions[index], index);
  }

  /** The name its author gave it, if any. */
  name(index: number): string | undefined {
    return mechanismName(this.mechanism.partitions[index]);
  }

  /** "M2", which the playback rows use. */
  code(index: number): string {
    return this.mechanism.partitions[index]?.id ?? `M${index + 1}`;
  }

  /**
   * Every machine on the grid, for a switcher: its name, or its code.
   *
   * The same array for as long as the words are the same: `segmented-block`
   * measures its options whenever they change, and a new array on every check
   * is a change on every check, which never lets the page settle.
   */
  choices(): readonly string[] {
    const now = this.mechanism.partitions.map(
      (partition, index) => mechanismName(partition) ?? this.code(index)
    );
    if (now.join('\u0000') !== this.lastChoices.join('\u0000')) this.lastChoices = now;
    return this.lastChoices;
  }

  private lastChoices: readonly string[] = [];

  ready(index: number): boolean {
    return this.mechanism.mechanisms[index]?.isMechanismValid() ?? false;
  }

  blockers(index: number): number {
    return (
      this.mechanism
        .readinessOfEachMechanism()
        [index]?.checks.filter((check) => check.severity === 'blocker').length ?? 0
    );
  }

  status(index: number): string {
    if (this.ready(index)) return 'Ready';
    const count = this.blockers(index);
    return count === 1 ? '1 blocker' : `${count} blockers`;
  }

  facts(index: number): MechanismFact[] {
    const facts = this.mechanism.readinessOfEachMechanism()[index]?.facts ?? [];
    const count = this.exportCatalog.partGroups(false)[index]?.parts.length ?? 0;
    return facts.map((fact) =>
      fact.label === 'Links / joints' ? { label: 'Objects', value: String(count) } : fact
    );
  }

  /** What PMKS+ matched the machine as, most specific first, if anything. */
  family(index: number): string | undefined {
    const match = this.whatIsThis.sheetFor(index)?.family[0]?.family;
    return match ? match.charAt(0).toUpperCase() + match.slice(1) : undefined;
  }

  /**
   * Every link in the machine, with its job.
   *
   * The job is the one the fact sheet gives it (`model/what-is-this/roles.ts`),
   * read off the solved cycle: which body the input drives, which are pinned
   * to the ground, which turn all the way round. A machine that does not run
   * has no cycle to read, so its links are listed without one.
   */
  links(index: number): LinkRow[] {
    const partition = this.mechanism.partitions[index];
    if (!partition) return [];
    const jobs = this.whatIsThis.sheetFor(index)?.jobs ?? [];
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

  /** End to end, in the units the mechanism is drawn in. */
  private lengthOf(link: RealLink): string {
    const ends = link.joints;
    if (ends.length < 2) return '—';
    const span = Math.hypot(
      ends[ends.length - 1].x - ends[0].x,
      ends[ends.length - 1].y - ends[0].y
    );
    return this.nup.formatModelLength(span, this.settings.lengthUnit.value);
  }
}
