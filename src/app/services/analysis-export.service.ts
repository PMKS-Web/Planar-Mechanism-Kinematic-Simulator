import { Injectable, inject } from '@angular/core';
import { roundNumber } from '../model/utils';
import { Joint, PrisJoint, RealJoint } from '../model/joint';
import { Link } from '../model/link';
import { Mechanism } from '../model/mechanism/mechanism';
import { AngleUnit, ForceUnit, LengthUnit } from '../model/unit-enums';
import { ActiveObjService } from './active-obj.service';
import { AnalysisSampleService } from './analysis-sample.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { SelectedTabService, TabID } from '../selected-tab.service';

/** One graph's worth of numbers: what it is called, and how to sample it. */
interface Quantity {
  label: string;
  analysis: string;
  analysisType: string;
  mechProp: string;
  mechPart: string;
  reactionLinkId: string;
}

/**
 * Every graph the analysis panel is offering, as one CSV.
 *
 * There used to be a Download button under each plot, which meant a reader who
 * wanted a joint's position, velocity and acceleration got three files with
 * three time columns to line up by hand -- and only for the graphs they had
 * thought to open first. The panel already knows the whole list, so the export
 * is one file per selection with one time column and a column per series.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisExportService {
  private mechanismService = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private settings = inject(SettingsService);
  private samples = inject(AnalysisSampleService);
  private tabs = inject(SelectedTabService);

  /** Whether there is a selection with solved numbers behind it. */
  canExport(): boolean {
    return !!this.subject() && this.quantities().length > 0;
  }

  /** What the file will be about, for the button's own label and tooltip. */
  subjectName(): string {
    const part = this.subject();
    return part ? part.name || part.id : '';
  }

  download(): void {
    const part = this.subject();
    const mechanism = part && this.mechanismService.mechanismContaining(part);
    const quantities = this.quantities();
    if (!part || !mechanism || quantities.length === 0) return;

    const csv = this.build(mechanism, quantities);
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI('data:text/csv;charset=utf-8,' + csv));
    const mode = this.tabs.getCurrentTab() === TabID.FORCE ? 'force' : 'kinematics';
    link.setAttribute('download', `${part.name || part.id}_${mode}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  private build(mechanism: Mechanism, quantities: Quantity[]): string {
    const columns: { head: string; values: number[] }[] = [];
    quantities.forEach((quantity) => {
      const rows = mechanism.timeNum.map((_, index) =>
        this.samples.sampleAt(
          mechanism,
          index,
          quantity.analysis,
          quantity.analysisType,
          quantity.mechProp,
          quantity.mechPart,
          quantity.reactionLinkId
        )
      );
      const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
      const names = this.seriesNames(width);
      const unit = this.unitFor(quantity);
      for (let series = 0; series < width; series++) {
        columns.push({
          head: `${quantity.label}${names[series] ? ' ' + names[series] : ''}${
            unit ? ` (${unit})` : ''
          }`,
          values: rows.map((row) => row[series]),
        });
      }
    });

    const head = ['Time (seconds)', ...columns.map((column) => this.quote(column.head))].join(',');
    const body = mechanism.timeNum.map((time, index) =>
      [time, ...columns.map((column) => this.cell(column.values[index]))].join(',')
    );
    return [head, ...body].join('\n') + '\n';
  }

  private cell(value: number | undefined): string {
    // Rounded here rather than at the source: the graph wants every digit the
    // solver produced, and a spreadsheet wants a number a person can read
    // instead of 0.30000000000000004.
    return value === undefined || !Number.isFinite(value) ? '' : String(roundNumber(value, 6));
  }

  /** A column head carries commas and apostrophes; a CSV field has to take them. */
  private quote(text: string): string {
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  /** The joint or link the panel is showing graphs for. */
  private subject(): Joint | Link | undefined {
    if (!this.tabs.isAnalysisMode()) return undefined;
    if (this.activeObj.objType === 'Joint') return this.activeObj.selectedJoint;
    if (this.activeObj.objType === 'Link') return this.activeObj.selectedLink;
    return undefined;
  }

  /**
   * The same list the panel draws, in the same order.
   *
   * Kept beside the panel's template rather than derived from it: the template
   * is the readable statement of what a reader is offered, and a loop over a
   * table would make it neither shorter nor clearer.
   */
  private quantities(): Quantity[] {
    const part = this.subject();
    const mechanism = part && this.mechanismService.mechanismContaining(part);
    if (!part || !mechanism?.isMechanismValid()) return [];
    const force = this.tabs.getCurrentTab() === TabID.FORCE;
    const joint = this.activeObj.objType === 'Joint';

    if (!force) {
      const of = (label: string, mechProp: string): Quantity => ({
        label,
        analysis: 'kinematic',
        analysisType: 'loop',
        mechProp,
        mechPart: part.id,
        reactionLinkId: '',
      });
      return joint
        ? [
            of('Position', 'Linear Joint Pos'),
            of('Velocity', 'Linear Joint Vel'),
            of('Acceleration', 'Linear Joint Acc'),
          ]
        : [
            of('Angle', 'Angular Link Pos'),
            of('Angular Velocity', 'Angular Link Vel'),
            of('Angular Acceleration', 'Angular Link Acc'),
            of('CoM Position', "Linear Link's CoM Pos"),
            of('CoM Velocity', "Linear Link's CoM Vel"),
            of('CoM Acceleration', "Linear Link's CoM Acc"),
          ];
    }

    const mode = this.settings.forceAnalysisMode.value;
    const index = mechanism.getForceAnalysis(mode).reactionIndex;
    const reactions: Quantity[] = (
      joint
        ? (index.linksByJoint.get(part.id) ?? []).map((linkId) => ({
            label: `Force on ${this.bodyName(linkId)}`,
            mechPart: part.id,
            reactionLinkId: linkId,
          }))
        : (index.jointsByLink.get(part.id) ?? []).map((jointId) => ({
            label: `Force at Joint ${this.nameOf(jointId, 'joint')}`,
            mechPart: jointId,
            reactionLinkId: part.id,
          }))
    ).map((row) => ({
      ...row,
      analysis: 'force',
      analysisType: mode,
      mechProp: 'Joint Forces',
    }));

    if (joint && (part as RealJoint).input) {
      reactions.push({
        label: `Input ${part instanceof PrisJoint ? 'Force' : 'Torque'}`,
        analysis: 'force',
        analysisType: mode,
        mechProp: 'Input Effort',
        mechPart: part.id,
        reactionLinkId: '',
      });
    }
    return reactions;
  }

  /** The same words the panel puts on the graph, so the file agrees with it. */
  private bodyName(linkId: string): string {
    const body = this.mechanismService.links.find((link) => link.id === linkId);
    return body ? this.mechanismService.bodyLabel(body) : linkId;
  }

  private nameOf(id: string, kind: 'joint' | 'link'): string {
    const pool = kind === 'joint' ? this.mechanismService.joints : this.mechanismService.links;
    return (pool as { id: string; name: string }[]).find((part) => part.id === id)?.name ?? id;
  }

  /** The names the graph plots these under, so the file agrees with the screen. */
  private seriesNames(count: number): string[] {
    if (count <= 1) return [''];
    if (count === 2) return ['X', 'Y'];
    return ['X', 'Y', 'Mag'];
  }

  private unitFor(quantity: Quantity): string {
    const length = this.unitStr(this.settings.lengthUnit.value);
    const angle = this.unitStr(this.settings.angleUnit.value);
    if (quantity.mechProp.includes('Angular')) {
      if (quantity.mechProp.includes('Acc')) return `${angle}/s^2`;
      if (quantity.mechProp.includes('Vel')) return `${angle}/s`;
      return angle;
    }
    if (quantity.analysis === 'force') {
      const pounds = this.settings.forceUnit.value === ForceUnit.LBF;
      // An input torque is the one force column measured in a moment.
      if (quantity.mechProp === 'Input Effort' && !(this.subject() instanceof PrisJoint)) {
        return pounds ? 'lbf.in' : 'N.m';
      }
      return pounds ? 'lbf' : 'N';
    }
    if (quantity.mechProp.includes('Acc')) return `${length}/s^2`;
    if (quantity.mechProp.includes('Vel')) return `${length}/s`;
    return length;
  }

  private unitStr(unit: LengthUnit | AngleUnit): string {
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
}
