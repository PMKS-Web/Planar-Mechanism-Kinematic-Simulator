import { Injectable, inject } from '@angular/core';
import { RealJoint } from '../model/joint';
import { RealLink } from '../model/link';
import {
  FamilyReading,
  familyReading,
  MachineFacts,
  machineFacts,
} from '../model/machine-facts/machine-facts';
import { panelRole } from '../model/machine-facts/roles';
import { mechanismLabel, mechanismName } from '../model/mechanism/mechanism-name';
import { MechanismFact } from '../model/mechanism/readiness';
import { SetupIssue } from '../model/mechanism/setup-issue';
import { READINESS } from '../ui-text';
import { DragStateService } from './drag-state.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';

/** One line of the Links section: what a link is, and how long. */
export interface LinkRow {
  /** The link itself, which its name points at on the grid. */
  part: RealLink;
  name: string;
  role: string;
  /**
   * How big it is: a bar's length; a three-joint plate's three sides; for more
   * joints than that, how many, since one number cannot say a plate's shape.
   */
  length: string;
  /** Each span by the joints it runs between, for the tooltip. */
  spans: string;
}

/** Whether a machine runs, as the chip beside its name says it everywhere. */
export interface MachineChip {
  text: string;
  kind: 'blocker' | 'warning' | 'ok';
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
  private dragState = inject(DragStateService);

  count(): number {
    return this.mechanism.partitions.length;
  }

  exists(index: number): boolean {
    return index >= 0 && index < this.count();
  }

  /** "Pump jack", or "Mechanism 2" for a machine nobody named. */
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

  /** How many things stop it running. */
  blockers(index: number): number {
    return (this.mechanism.readinessOfEachMechanism()[index]?.checks ?? []).filter(
      (check) => check.severity === 'blocker'
    ).length;
  }

  /** The chip the setup drawer shows beside this machine, word for word. */
  chip(index: number): MachineChip {
    return chipOf(this.mechanism.readinessOfEachMechanism()[index]?.checks ?? []);
  }

  /**
   * What the Overview says of a machine, by what the reader is doing with it.
   * Building it, what matters is how free it is and what drives it -- the
   * count a deleted or added link changes. Analyzing it, how it moves too:
   * its speed, how long a cycle takes, whether it turns or rocks.
   */
  facts(index: number, building = false): MechanismFact[] {
    const facts = this.mechanism.readinessOfEachMechanism()[index]?.facts ?? [];
    if (building) return facts.filter((fact) => BUILDING_FACTS.has(fact.label));
    // A named family already says how the input moves -- a crank-rocker's
    // crank turns fully -- so Motion is said only where no family is.
    const named = this.family(index).kind === 'named';
    return facts.filter(
      (fact) => ANALYZING_FACTS.has(fact.label) || (fact.label === 'Motion' && !named)
    );
  }

  /** "1 degree of freedom", for a list row; nothing where the count is not a number. */
  freedoms(index: number): string | undefined {
    const value = this.facts(index).find((fact) => fact.label === 'Degrees of freedom')?.value;
    const count = Number(value);
    if (value === undefined || !Number.isFinite(count)) return undefined;
    return `${count} ${count === 1 ? 'degree' : 'degrees'} of freedom`;
  }

  /**
   * The Family row: what PMKS+ matched the machine as, or failing that its
   * body count, or that it could not say (`familyReading`). Never nothing, so
   * the panel keeps its shape from one machine to the next.
   */
  family(index: number): FamilyReading {
    return familyReading(
      this.mechanism.partitions[index],
      this.mechanism.mechanisms[index],
      this.factsOf(index)
    );
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
          ...this.sizeOf(link),
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

  /**
   * A link's size, in the units the mechanism is drawn in, over the joints a
   * reader can see on it. A bar has one length. A plate of three joints has
   * three sides, and quoting one of them -- end to end, whichever two the list
   * happened to hold first -- described a triangle by an arbitrary edge. Past
   * three, the spans are not sides and there are too many to list in a row,
   * so the row says how many joints and the tooltip has every span.
   */
  private sizeOf(link: RealLink): { length: string; spans: string } {
    const shown = new Set(this.mechanism.visibleJoints().map((joint) => joint.id));
    const joints = link.joints.filter((joint) => shown.has(joint.id));
    if (joints.length < 2) return { length: '—', spans: '' };
    const unit = this.settings.lengthUnit.value;
    const pairs = joints.flatMap((a, i) => joints.slice(i + 1).map((b) => [a, b] as const));
    const spans = pairs.map(([a, b]) => ({
      name: `${a.name || a.id}${b.name || b.id}`,
      value: Math.hypot(b.x - a.x, b.y - a.y),
    }));
    const said = spans.map(
      (span) => `${span.name} ${this.nup.formatModelLength(span.value, unit)}`
    );
    if (joints.length === 2) {
      return { length: this.nup.formatModelLength(spans[0].value, unit), spans: '' };
    }
    if (joints.length === 3) {
      // One unit for the three, after the last, as a row has room for.
      const numbers = spans.map((span) => this.nup.formatModelLength(span.value, unit));
      const suffix = numbers[0].replace(/^[-\d.,\s]+/, '');
      const bare = numbers.map((number) => number.slice(0, number.length - suffix.length).trim());
      return { length: `${bare.join(' · ')} ${suffix}`.trim(), spans: said.join(' · ') };
    }
    return { length: `${joints.length} joints`, spans: said.join(' · ') };
  }
}

/** The facts Edit shows: the count, what it is built from, and what drives it. */
const BUILDING_FACTS = new Set(['Degrees of freedom', 'Links', 'Joints', 'Input joint']);

/**
 * The facts the analysis modes show under the Family: the same, and the
 * input's speed beside the cycle time it sets (60 / rpm), so a student can
 * check one against the other.
 */
const ANALYZING_FACTS = new Set([...BUILDING_FACTS, 'Input speed', 'Cycle time']);

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
