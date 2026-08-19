import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../../model/joint';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ExportCatalogService } from './export-catalog.service';
import {
  ColumnTab,
  ExportColumn,
  ExportColumnGroup,
  ExportPart,
  ExportSeries,
} from './export-model';

/**
 * What a chosen set of parts turns out to have numbers for.
 *
 * Split from the catalogue of parts because the two questions have different
 * shapes: what a drawing contains is fixed the moment it is drawn, and what
 * that selection can be asked for changes with every tick.
 */
@Injectable({ providedIn: 'root' })
export class ExportColumnsService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private catalog = inject(ExportCatalogService);

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
    const length = this.catalog.unitStr(this.settings.lengthUnit.value);
    const angle = this.catalog.unitStr(this.settings.angleUnit.value);

    if (joints.length > 0) {
      groups.push({
        key: 'joints',
        title: this.titleOf('Joint', joints),
        tab: 'kinematics',
        columns: [
          this.kinematic(joints, 'j:pos', 'Position', length, [
            ['Position', 'Linear Joint Pos', length, 2],
          ]),
          this.kinematic(joints, 'j:vel', 'Velocity', `${length}/s`, [
            ['Velocity', 'Linear Joint Vel', `${length}/s`, 3],
          ]),
          this.kinematic(joints, 'j:acc', 'Acceleration', `${length}/s²`, [
            ['Acceleration', 'Linear Joint Acc', `${length}/s²`, 3],
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
          this.kinematic(links, 'l:ang', 'Angle', angle, [['Angle', 'Angular Link Pos', angle, 1]]),
          this.kinematic(links, 'l:angvel', 'Angular velocity', `${angle}/s`, [
            ['Angular velocity', 'Angular Link Vel', `${angle}/s`, 1],
          ]),
          this.kinematic(links, 'l:angacc', 'Angular acceleration', `${angle}/s²`, [
            ['Angular acceleration', 'Angular Link Acc', `${angle}/s²`, 1],
          ]),
          this.kinematic(links, 'l:com', 'Center of mass', 'pos, vel, acc', [
            ['Center of mass position', "Linear Link's CoM Pos", length, 2],
            ['Center of mass velocity', "Linear Link's CoM Vel", `${length}/s`, 3],
            ['Center of mass acceleration', "Linear Link's CoM Acc", `${length}/s²`, 3],
          ]),
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
    parts: ExportPart[],
    key: string,
    label: string,
    unit: string,
    series: [string, string, string, 1 | 2 | 3][]
  ): ExportColumn {
    return {
      key,
      label,
      unit,
      appliesTo: parts.map((part) => part.key),
      tab: 'kinematics',
      series: series.map(([seriesLabel, mechProp, seriesUnit, components]) => ({
        label: seriesLabel,
        head: '',
        unit: seriesUnit,
        components,
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
    // A reaction at a joint buried inside a sealed cylinder is a force between
    // two halves of one part, named after a pin the drawing never shows.
    const hidden = this.catalog.hiddenJointIds();
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
          : (index.jointsByLink.get(part.id) ?? [])
              .filter((jointId) => !hidden.has(jointId))
              .map((jointId) =>
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
    const unit = torque ? this.catalog.torqueUnit() : this.catalog.forceUnit();
    const series: ExportSeries = {
      label,
      head,
      unit,
      // A reaction is a vector; an input effort is one number.
      components: mechProp === 'Input Effort' ? 1 : 3,
      analysis: 'force',
      mechProp,
      mechPart,
      reactionLinkId,
    };
    return {
      // The joint is in the key as well as the link: a link's reactions are
      // named after the joints holding it, and two of them share every other
      // part of this — so without it, unticking one untick both.
      key: `f:${part.key}:${mechProp}:${mechPart}:${reactionLinkId}`,
      label,
      unit,
      appliesTo: [part.key],
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

  /** The same words the panels put on a graph, so the file agrees with them. */
  private bodyName(linkId: string): string {
    const body = this.mechanism.links.find((link) => link.id === linkId);
    return body ? this.catalog.labelFor(body) : linkId;
  }

  private jointName(jointId: string): string {
    const joint = this.mechanism.joints.find((candidate) => candidate.id === jointId) as
      RealJoint | undefined;
    return `Joint ${joint?.name || jointId}`;
  }
}
