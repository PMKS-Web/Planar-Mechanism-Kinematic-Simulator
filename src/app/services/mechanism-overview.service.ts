import { Injectable, inject } from '@angular/core';
import { RealJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { FamilyMatch } from '../model/machine-facts/family-check';
import { MachineFacts, machineFacts } from '../model/machine-facts/machine-facts';
import { panelRole } from '../model/machine-facts/roles';
import { mechanismLabel, mechanismName } from '../model/mechanism/mechanism-name';
import { MechanismFact } from '../model/mechanism/readiness';
import { SetupIssue } from '../model/mechanism/setup-issue';
import { READINESS } from '../ui-text';
import { DragStateService } from './drag-state.service';
import { ExportCatalogService } from './export/export-catalog.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';

/** One line of the Links section: what a link is, and how long. */
export interface LinkRow {
  /** The link itself, which its name points at on the grid. */
  part: RealLink;
  name: string;
  role: string;
  length: string;
}

/** Whether a machine runs, as the chip beside its name says it everywhere. */
export interface MachineChip {
  text: string;
  kind: 'blocker' | 'warning' | 'ok';
}

/** The family PMKS+ matched, as the panel shows it: a name, and why. */
export interface FamilyRow {
  name: string;
  /** Why it matched, for a reader who asks: "AB turns fully; CD rocks". */
  basis: string;
}

/**
 * What the machine panels say about each machine: its name, whether it runs,
 * its family, its facts and its links. The same in Edit and in the analysis
 * modes, which differ only in what they offer around these.
 */
@Injectable({ providedIn: 'root' })
export class MechanismOverviewService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private exportCatalog = inject(ExportCatalogService);
  private dragState = inject(DragStateService);

  count(): number {
    return this.mechanism.partitions.length;
  }

  exists(index: number): boolean {
    return index >= 0 && index < this.count();
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

  /** Every other machine's name, which a new one must not repeat. */
  namesBesides(index: number): string[] {
    return this.mechanism.partitions
      .map((partition, at) => (at === index ? undefined : mechanismName(partition)))
      .filter((name): name is string => !!name);
  }

  ready(index: number): boolean {
    return this.mechanism.mechanisms[index]?.isMechanismValid() ?? false;
  }

  /** The chip the setup drawer shows beside this machine, word for word. */
  chip(index: number): MachineChip {
    return chipOf(this.mechanism.readinessOfEachMechanism()[index]?.checks ?? []);
  }

  facts(index: number): MechanismFact[] {
    const facts = this.mechanism.readinessOfEachMechanism()[index]?.facts ?? [];
    const count = this.exportCatalog.partGroups(false)[index]?.parts.length ?? 0;
    return facts.map((fact) =>
      fact.label === 'Links / joints' ? { label: 'Objects', value: String(count) } : fact
    );
  }

  /**
   * What PMKS+ matched the machine as, most specific first, or nothing: a
   * family is said only where its catalog recognizes one, and a machine that
   * does not run has no cycle to recognize.
   */
  family(index: number): FamilyRow | undefined {
    const match: FamilyMatch | undefined = this.factsOf(index)?.family[0];
    if (!match) return undefined;
    return {
      name: match.family.charAt(0).toUpperCase() + match.family.slice(1),
      basis: match.basis.charAt(0).toUpperCase() + match.basis.slice(1) + '.',
    };
  }

  /**
   * Every link in the machine, with its job.
   *
   * The job is the one PMKS+ recognizes off the solved cycle
   * (`model/machine-facts/roles.ts`): which body the input drives, which are
   * pinned to the ground, which turn all the way round. A machine that does
   * not run has no cycle, so its links are named by how they are held instead.
   */
  links(index: number): LinkRow[] {
    const partition = this.mechanism.partitions[index];
    if (!partition) return [];
    const jobs = this.factsOf(index)?.jobs;
    return partition.links
      .filter((link): link is RealLink => link instanceof RealLink)
      .map((link) => {
        const job = jobs?.find((candidate) => candidate.links.includes(link));
        return {
          part: link,
          // The name on the canvas, not the link's id: a body welded to a
          // barrel mount carries the buried inner end in its id (D14, S11).
          name: this.mechanism.visibleBodyName(link),
          role: job ? panelRole(job) : jobs ? '' : heldAs(link),
          length: this.lengthOf(link),
        };
      });
  }

  /**
   * A machine's recognized facts, worked out again only when its solve
   * changes, and not while a drag is under way: the family check reads every
   * sample of the cycle.
   */
  private factsOf(index: number): MachineFacts | undefined {
    const solved = this.mechanism.mechanisms[index];
    const partition = this.mechanism.partitions[index];
    if (!solved || !partition) return undefined;
    const kept = this.factsCache.get(solved);
    if (kept || (this.dragState.isDragging && this.factsCache.has(solved))) return kept?.facts;
    const facts = machineFacts(partition, solved);
    this.factsCache.set(solved, { facts });
    return facts;
  }

  /** Keyed on the solved machine, which a rebuild replaces whenever it changes. */
  private factsCache = new WeakMap<object, { facts: MachineFacts | undefined }>();

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

/** Red if anything stops it running, amber if it runs with something to check, green if not. */
export function chipOf(issues: readonly SetupIssue[]): MachineChip {
  const blockers = issues.filter((issue) => issue.severity === 'blocker').length;
  if (blockers > 0) return { text: READINESS.fixes(blockers), kind: 'blocker' };
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  if (warnings > 0) return { text: READINESS.toCheck(warnings), kind: 'warning' };
  return { text: 'Ready', kind: 'ok' };
}

/**
 * A link's job where there is no cycle to read it from: how it is held. One
 * pinned joint is a pivot, not a fixture, and whether it goes all the way
 * round is a fact about motion that a machine which does not run cannot give.
 */
function heldAs(link: RealLink): string {
  if (link.joints.some((joint) => (joint as RealJoint).input)) return 'Input';
  const grounded = link.joints.filter((joint) => (joint as RealJoint).ground).length;
  if (grounded === 0) return 'Coupler';
  return grounded > 1 || link.joints.length < 2 ? 'Grounded' : 'Grounded pivot';
}
