import { Injectable, inject } from '@angular/core';
import { angularScale } from '../../model/analysis-series';
import { RealJoint } from '../../model/joint';
import { Mechanism } from '../../model/mechanism/mechanism';
import { AnalysisSampleService } from '../analysis-sample.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ExportFlowService } from './export-flow.service';
import { ExportColumn, ExportPart } from './export-model';

/** One quantity of one part over a whole cycle: a graph, and a run of columns. */
export interface ExportPlot {
  /** `Position of Joint B` — what a graph would be titled. */
  title: string;
  /** `Position B` — what a column head opens with. */
  head: string;
  unit: string;
  columnKey: string;
  partKey: string;
  mechanismIndex: number;
  /** X, Y and Mag where there are three; one unnamed series where there is one. */
  series: { name: string; values: number[] }[];
}

/** A whole file or sheet: a time column, and every series beside it. */
export interface ExportTable {
  /** What this one is called as a sheet: always qualified by its machine. */
  name: string;
  /**
   * What is added to the file name to tell this one from the others.
   *
   * Empty when there is only one file, and free of the machine's id unless
   * there are several machines — the name the reader typed usually carries it
   * already, and `M1_kinematics_M1_JointA.csv` says it twice.
   */
  suffix: string;
  mechanismIndex: number;
  times: number[];
  heads: string[];
  /** Column-major, parallel to `heads` after the time column. */
  columns: number[][];
  plots: ExportPlot[];
}

/**
 * The numbers behind a chosen export, sampled once and shared by every format.
 *
 * A CSV, a workbook, a set of graph images and a report all say the same thing
 * about the same cycle; the only difference is how it is written down. Solving
 * it once here is what keeps them from disagreeing.
 */
@Injectable({ providedIn: 'root' })
export class ExportTableService {
  private flow = inject(ExportFlowService);
  private mechanism = inject(MechanismService);
  private samples = inject(AnalysisSampleService);
  private settings = inject(SettingsService);

  /**
   * The last answer, and what was asked to get it.
   *
   * Building these samples every solved position of every chosen series, and
   * the drawer's own footer asks how wide the file is on every change-detection
   * pass. Without this, moving the mouse over the drawer re-solves the cycle.
   */
  private cache?: { key: string; tables: ExportTable[] };

  /**
   * Every file the current selection asks for.
   *
   * One per machine at the very least: two mechanisms run on their own clocks,
   * so their rows cannot share a time column however much a reader would like
   * one file. Beyond that the reader chooses — a sheet per part, or the whole
   * machine in one.
   */
  tables(): ExportTable[] {
    const key = this.signature();
    if (this.cache?.key !== key) {
      this.cache = { key, tables: this.flow.mechanismIndexes().flatMap((i) => this.tablesFor(i)) };
    }
    return this.cache.tables;
  }

  /**
   * Everything the numbers depend on, as one string.
   *
   * Decimals are deliberately not in it: rounding happens as a file is written,
   * so changing it cannot change what was sampled.
   */
  private signature(): string {
    return [
      this.flow
        .selectedParts()
        .map((part) => part.key)
        .join(','),
      this.flow
        .selectedColumns()
        .map((column) => column.key)
        .join(','),
      this.flow.format,
      this.flow.splitPerPart,
      this.flow.withMagnitude,
      this.flow.forceMode(),
      this.settings.lengthUnit.value,
      this.settings.angleUnit.value,
      this.settings.forceUnit.value,
      this.mechanism.mechanisms.map((solved) => solved.timeNum.length).join(','),
      // Bumped by every mutation the mechanism service funnels, so a change
      // that leaves the shape of the selection alone still re-samples.
      this.mechanism.poseRevision,
    ].join('|');
  }

  private tablesFor(index: number): ExportTable[] {
    const id = this.flow.partGroups()[index]?.id ?? `M${index + 1}`;
    const parts = this.flow.selectedParts().filter((part) => part.mechanismIndex === index);
    const columns = this.flow.selectedColumns();
    // Only where there is more than one machine to tell apart.
    const qualify = this.flow.mechanismIndexes().length > 1 ? `${id}_` : '';

    // Only where the format offers the choice. A report and a set of graph
    // images are per machine whatever the file step last had ticked, and a
    // report built from a split selection silently kept only the first part.
    if (this.flow.splitPerPart && (this.flow.format === 'csv' || this.flow.format === 'xlsx')) {
      return parts
        .map((part) => {
          const short = part.label.replace(/\s+/g, '');
          return this.table(index, `${id}_${short}`, `${qualify}${short}`, [part], columns);
        })
        .filter((table) => table.heads.length > 1);
    }
    if (this.flow.format === 'xlsx') {
      // "By analysis": kinematics and forces are different questions about the
      // same cycle, and a sheet each is what lets one be charted without the
      // other's axis running through it.
      return (['kinematics', 'forces'] as const)
        .map((tab) =>
          this.table(
            index,
            `${id}_${tab}`,
            `${qualify}${tab}`,
            parts,
            columns.filter((column) => column.tab === tab)
          )
        )
        .filter((table) => table.heads.length > 1);
    }
    return [this.table(index, id, qualify.replace(/_$/, ''), parts, columns)].filter(
      (table) => table.heads.length > 1
    );
  }

  private table(
    index: number,
    name: string,
    suffix: string,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): ExportTable {
    const solved = this.mechanism.mechanisms[index];
    const times = solved?.isMechanismValid() ? [...solved.timeNum] : [];
    const plots = solved ? this.plots(solved, index, parts, columns) : [];
    const heads = ['Time (s)'];
    const values: number[][] = [];
    plots.forEach((plot) => {
      plot.series.forEach((series) => {
        heads.push(`${plot.head}${series.name ? ' ' + series.name : ''} (${plot.unit})`);
        values.push(series.values);
      });
    });
    return { name, suffix, mechanismIndex: index, times, heads, columns: values, plots };
  }

  /** Every graph the selection asks for, in the order the columns are listed. */
  plots(
    solved: Mechanism,
    index: number,
    parts: ExportPart[],
    columns: ExportColumn[]
  ): ExportPlot[] {
    if (!solved.isMechanismValid()) return [];
    const mode = this.flow.forceMode();
    const plots: ExportPlot[] = [];
    columns.forEach((column) => {
      const targets = parts.filter((part) => column.appliesTo.includes(part.key));
      targets.forEach((part) => {
        column.series.forEach((series) => {
          const mechPart = series.mechPart || part.id;
          // The solver hands angles out in degrees and rates in radians, so
          // one or the other is converted on the way to whatever is labelled
          // with the reader's unit -- the same scale the graphs apply.
          const scale = angularScale(series.mechProp, this.settings.angleUnit.value);
          const rows = solved.timeNum.map((_, step) =>
            this.samples.sampleAt(
              solved,
              step,
              series.analysis,
              series.analysis === 'force' ? mode : 'loop',
              series.mechProp,
              mechPart,
              series.reactionLinkId
            )
          );
          const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
          if (width === 0) return;
          const kept = width === 3 && !this.flow.withMagnitude ? 2 : width;
          const names = this.seriesNames(width).slice(0, kept);
          plots.push({
            title: series.head || `${series.label} of ${part.label}`,
            head: series.head || `${series.label} ${this.shortName(part)}`,
            unit: series.unit,
            columnKey: column.key,
            partKey: part.key,
            mechanismIndex: index,
            series: names.map((name, at) => ({
              name,
              values: rows.map((row) => row[at] * scale),
            })),
          });
        });
      });
    });
    return plots;
  }

  /** The names the graphs plot these under, so the file agrees with the screen. */
  private seriesNames(count: number): string[] {
    if (count <= 1) return [''];
    if (count === 2) return ['X', 'Y'];
    return ['X', 'Y', 'Mag'];
  }

  private shortName(part: ExportPart): string {
    return part.kind === 'joint' ? (part.part as RealJoint).name || part.id : part.id;
  }
}
