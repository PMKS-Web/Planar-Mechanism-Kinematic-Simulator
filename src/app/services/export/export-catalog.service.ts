import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { AngleUnit, ForceUnit, LengthUnit } from '../../model/unit-enums';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import {
  ColumnTab,
  ExportColumn,
  ExportColumnGroup,
  ExportPart,
  ExportPartGroup,
  ExportSeries,
} from './export-model';

/**
 * What this drawing has to offer an export, listed the way the drawer asks for it.
 *
 * Derivation only: nothing here remembers what was ticked. The drawer's own
 * state lives in `ExportFlowService`, which asks this for the lists it draws and
 * for the columns a set of chosen parts turns out to have.
 */
@Injectable({ providedIn: 'root' })
export class ExportCatalogService {
  private mechanism = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private settings = inject(SettingsService);

  /**
   * Every part of every mechanism, grouped by machine.
   *
   * Grounded joints are listed in both modes and tickable in only one: a fixed
   * joint has no motion to report, but it does carry a reaction.
   */
  partGroups(withForces: boolean): ExportPartGroup[] {
    return this.mechanism.partitions.map((partition, index) => {
      const solved = this.mechanism.mechanisms[index];
      const valid = solved?.isMechanismValid() ?? false;
      const joints = partition.ownJoints
        .filter((joint): joint is RealJoint => joint instanceof RealJoint)
        .map((joint) => this.jointPart(joint, index, withForces));
      const links = partition.links
        .filter((link): link is RealLink => link instanceof RealLink)
        .map((link) => this.linkPart(link, index, valid));
      return {
        index,
        id: partition.id,
        note: this.noteFor(index),
        forcesReady: this.forcesSolve(index),
        parts: valid ? [...joints, ...links] : [...joints, ...links].map(this.unsolved),
      };
    });
  }

  /** Nothing solves for a mechanism that does not run, so nothing is on offer. */
  private unsolved = (part: ExportPart): ExportPart => ({ ...part, available: false });

  private jointPart(joint: RealJoint, index: number, withForces: boolean): ExportPart {
    const notes: string[] = [];
    if (joint.ground) notes.push('grounded');
    if (joint.input) notes.push('input');
    if (this.mechanism.sliderFor(joint)) notes.push('slider');
    if (joint.showCurve) notes.push('tracer point');
    if (this.activeObj.selectedJoint?.id === joint.id) notes.push('on the grid');
    return {
      key: `joint:${joint.id}`,
      kind: 'joint',
      id: joint.id,
      label: `Joint ${joint.name || joint.id}`,
      note: notes.join(', '),
      // A pinned joint stands still, so kinematics has nothing for it; the
      // reaction it carries is the whole reason force analysis wants it.
      available: withForces || !joint.ground,
      part: joint,
      mechanismIndex: index,
    };
  }

  private linkPart(link: RealLink, index: number, valid: boolean): ExportPart {
    const notes: string[] = [];
    if (link.joints.some((joint) => (joint as RealJoint).input)) notes.push('input crank');
    if (link.subset.length > 0) notes.push('compound');
    if (this.activeObj.selectedLink?.id === link.id) notes.push('on the grid');
    return {
      key: `link:${link.id}`,
      kind: 'link',
      id: link.id,
      label: this.mechanism.bodyLabel(link),
      note: notes.join(', '),
      available: valid,
      part: link,
      mechanismIndex: index,
    };
  }

  /** What a machine is, in the one line the section heading has room for. */
  private noteFor(index: number): string {
    const partition = this.mechanism.partitions[index];
    const facts = this.mechanism.readinessOfEachMechanism()[index]?.facts ?? [];
    const speed = facts.find((fact) => fact.label === 'Input speed')?.value;
    const bodies = partition.links.filter((link) => link instanceof RealLink).length;
    const count = `${bodies} ${bodies === 1 ? 'link' : 'links'}`;
    return speed ? `${count} · ${speed}` : `${count} · not running`;
  }

  /**
   * Whether force analysis is set up *and* solves for this machine.
   *
   * Both halves matter. A linkage with nothing loading it solves to a page of
   * zeroes, which is not an answer anyone asked for — so the drawing-wide
   * requirements decide whether forces are on offer at all, and this machine's
   * own frames decide whether it is one of the machines that has them.
   */
  forcesSolve(index: number): boolean {
    const solved = this.mechanism.mechanisms[index];
    if (!solved?.isMechanismValid() || !this.mechanism.forceAnalysisReady()) return false;
    const mode = this.settings.forceAnalysisMode.value;
    return solved.getForceAnalysis(mode).successfulFrames > 0;
  }

  /**
   * The quantities a chosen set of parts turns out to have.
   *
   * Kinematics groups by kind rather than by part: every chosen joint has the
   * same three quantities, and a list that repeated them per joint would be the
   * same three answers asked eleven times.
   */
  columnGroups(parts: ExportPart[], tab: ColumnTab): ExportColumnGroup[] {
    return tab === 'forces' ? this.forceGroups(parts) : this.kinematicGroups(parts);
  }

  private kinematicGroups(parts: ExportPart[]): ExportColumnGroup[] {
    const groups: ExportColumnGroup[] = [];
    const joints = parts.filter((part) => part.kind === 'joint');
    const links = parts.filter((part) => part.kind === 'link');
    const length = this.unitStr(this.settings.lengthUnit.value);
    const angle = this.unitStr(this.settings.angleUnit.value);

    if (joints.length > 0) {
      groups.push({
        key: 'joints',
        title: this.titleOf('Joint', joints),
        tab: 'kinematics',
        columns: [
          this.kinematic('j:pos', 'Position', length, [['Position', 'Linear Joint Pos', length]]),
          this.kinematic('j:vel', 'Velocity', `${length}/s`, [
            ['Velocity', 'Linear Joint Vel', `${length}/s`],
          ]),
          this.kinematic('j:acc', 'Acceleration', `${length}/s²`, [
            ['Acceleration', 'Linear Joint Acc', `${length}/s²`],
          ]),
        ],
      });
    }

    if (links.length > 0) {
      groups.push({
        key: 'links',
        title: this.titleOf('Link', links),
        tab: 'kinematics',
        columns: [
          this.kinematic('l:ang', 'Angle', angle, [['Angle', 'Angular Link Pos', angle]], 'link'),
          this.kinematic(
            'l:angvel',
            'Angular velocity',
            `${angle}/s`,
            [['Angular velocity', 'Angular Link Vel', `${angle}/s`]],
            'link'
          ),
          this.kinematic(
            'l:angacc',
            'Angular acceleration',
            `${angle}/s²`,
            [['Angular acceleration', 'Angular Link Acc', `${angle}/s²`]],
            'link'
          ),
          this.kinematic(
            'l:com',
            'Centre of mass',
            'pos, vel, acc',
            [
              ['CoM position', "Linear Link's CoM Pos", length],
              ['CoM velocity', "Linear Link's CoM Vel", `${length}/s`],
              ['CoM acceleration', "Linear Link's CoM Acc", `${length}/s²`],
            ],
            'link'
          ),
        ],
      });
    }
    return groups;
  }

  /** `Joints B, C` for several, `Joint B` for one — the heading names them. */
  private titleOf(kind: string, parts: ExportPart[]): string {
    const names = parts.map((part) => part.label.replace(/^(Joint|Link) /, ''));
    return `${kind}${names.length === 1 ? '' : 's'} ${names.join(', ')}`;
  }

  private kinematic(
    key: string,
    label: string,
    unit: string,
    series: [string, string, string][],
    spans: 'joint' | 'link' = 'joint'
  ): ExportColumn {
    return {
      key,
      label,
      unit,
      spans,
      owner: '',
      tab: 'kinematics',
      series: series.map(([seriesLabel, mechProp, seriesUnit]) => ({
        label: seriesLabel,
        head: '',
        unit: seriesUnit,
        analysis: 'kinematic' as const,
        mechProp,
        mechPart: '',
        reactionLinkId: '',
      })),
    };
  }

  /**
   * Every reaction the chosen parts carry, one group per part.
   *
   * Per part rather than per kind, unlike kinematics: a joint's reactions are
   * named after the links it holds, so no two joints have the same list.
   */
  private forceGroups(parts: ExportPart[]): ExportColumnGroup[] {
    const mode = this.settings.forceAnalysisMode.value;
    const groups: ExportColumnGroup[] = [];
    parts.forEach((part) => {
      const solved = this.mechanism.mechanisms[part.mechanismIndex];
      if (!solved?.isMechanismValid()) return;
      const index = solved.getForceAnalysis(mode).reactionIndex;
      const columns: ExportColumn[] =
        part.kind === 'joint'
          ? (index.linksByJoint.get(part.id) ?? []).map((linkId) =>
              this.force(
                part,
                `Force on ${this.bodyName(linkId)}`,
                `${this.modeWord()} force at ${part.label} on ${this.bodyName(linkId)}`,
                part.id,
                linkId,
                'Joint Forces'
              )
            )
          : (index.jointsByLink.get(part.id) ?? []).map((jointId) =>
              this.force(
                part,
                `Force at ${this.jointName(jointId)}`,
                `${this.modeWord()} force on ${part.label} at ${this.jointName(jointId)}`,
                jointId,
                part.id,
                'Joint Forces'
              )
            );
      if (part.kind === 'joint' && (part.part as RealJoint).input) {
        const effort = part.part instanceof PrisJoint ? 'Input force' : 'Input torque';
        columns.push(
          this.force(
            part,
            effort,
            `${this.modeWord()} ${effort.toLowerCase()} at ${part.label}`,
            part.id,
            '',
            'Input Effort'
          )
        );
      }
      if (columns.length > 0) {
        groups.push({ key: `force:${part.key}`, title: part.label, tab: 'forces', columns });
      }
    });
    return groups;
  }

  private force(
    part: ExportPart,
    label: string,
    head: string,
    mechPart: string,
    reactionLinkId: string,
    mechProp: string
  ): ExportColumn {
    const torque = mechProp === 'Input Effort' && !(part.part instanceof PrisJoint);
    const unit = torque ? this.torqueUnit() : this.forceUnit();
    const series: ExportSeries = {
      label,
      head,
      unit,
      analysis: 'force',
      mechProp,
      mechPart,
      reactionLinkId,
    };
    return {
      key: `f:${part.key}:${mechProp}:${reactionLinkId}`,
      label,
      unit,
      spans: 'own',
      owner: part.key,
      tab: 'forces',
      series: [series],
    };
  }

  /**
   * Which force analysis a column came from, written into its own head.
   *
   * A static reaction and an in-motion one are different numbers for the same
   * joint, and a file that does not say which it holds is a file nobody can
   * check. Carried by the head rather than by a note at the top, so it survives
   * being pasted into a sheet, plotted, or read by a script.
   */
  private modeWord(): string {
    return this.settings.forceAnalysisMode.value === 'dynamic' ? 'In-motion' : 'Static';
  }

  private bodyName(linkId: string): string {
    const body = this.mechanism.links.find((link) => link.id === linkId);
    return body ? this.mechanism.bodyLabel(body) : linkId;
  }

  private jointName(jointId: string): string {
    const joint = this.mechanism.joints.find((candidate) => candidate.id === jointId) as
      RealJoint | undefined;
    return `Joint ${joint?.name || jointId}`;
  }

  forceUnit(): string {
    return this.settings.forceUnit.value === ForceUnit.LBF ? 'lbf' : 'N';
  }

  torqueUnit(): string {
    return this.settings.forceUnit.value === ForceUnit.LBF ? 'lbf·in' : 'N·m';
  }

  /** The same words the panels put on an axis, so the file agrees with them. */
  unitStr(unit: LengthUnit | AngleUnit): string {
    switch (unit) {
      case AngleUnit.RADIAN:
        return 'rad';
      case AngleUnit.DEGREE:
        return 'deg';
      case LengthUnit.INCH:
        return 'in';
      case LengthUnit.METER:
        return 'm';
      default:
        return 'cm';
    }
  }

  /** Parts of one mechanism, in the order the drawer lists them. */
  partsOf(groups: ExportPartGroup[], keys: Set<string>): ExportPart[] {
    return groups.flatMap((group) => group.parts.filter((part) => keys.has(part.key)));
  }
}
