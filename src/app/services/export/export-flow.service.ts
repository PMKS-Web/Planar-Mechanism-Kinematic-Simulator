import { Injectable, inject } from '@angular/core';
import { ForceAnalysisMode } from '../../model/mechanism/force-solver';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { SettingsService } from '../settings.service';
import { ExportCatalogService } from './export-catalog.service';
import {
  ColumnTab,
  Decimals,
  ExportColumn,
  ExportColumnGroup,
  ExportFormat,
  ExportPart,
  ExportPartGroup,
} from './export-model';

/** Which of the three questions the drawer is asking. */
export type ExportStep = 1 | 2 | 3;

/**
 * What the export drawer has been told so far.
 *
 * Three steps, each asking one question: which parts, which numbers, and how
 * the file should be written. Nothing here writes anything — `ExportWriter`
 * turns this state into files — and nothing here touches the mechanism, so
 * opening the drawer and changing every answer in it leaves the drawing alone.
 */
@Injectable({ providedIn: 'root' })
export class ExportFlowService {
  private catalog = inject(ExportCatalogService);
  private settings = inject(SettingsService);
  private tabs = inject(SelectedTabService);

  step: ExportStep = 1;
  tab: ColumnTab = 'kinematics';
  format: ExportFormat = 'csv';
  decimals: Decimals = 6;
  /** One file for everything that can share a time column, or one per part. */
  splitPerPart = false;
  /** Whether a two-component series also writes its magnitude. */
  withMagnitude = true;
  /** Which kind of picture the Graph images format writes. */
  imageFormat: 'png' | 'svg' = 'png';
  /** Empty until the reader types: the name shown is derived while it is. */
  typedName = '';

  private pickedParts = new Set<string>();
  private pickedColumns = new Set<string>();
  private touchedColumns = false;

  /**
   * What this drawing has to offer, held still while the drawer is open.
   *
   * Rebuilt on `refresh()` rather than per change-detection pass: the lists
   * come from the readiness report and the force solver, and a template that
   * asks for them a dozen times a frame would solve the whole drawing for every
   * mouse move. Nothing in analysis mode edits the mechanism, so holding them
   * is safe as well as cheap.
   */
  private cached?: { groups: ExportPartGroup[]; forces: boolean };

  private build(): { groups: ExportPartGroup[]; forces: boolean } {
    const withForces = this.catalog.partGroups(true);
    const forces = withForces.some((group) => group.forcesReady && group.parts.length > 0);
    return { groups: forces ? withForces : this.catalog.partGroups(false), forces };
  }

  /** Forget the lists, so the next question rebuilds them. */
  refresh(): void {
    this.cached = undefined;
  }

  /** Start again from step 1, ticking whatever is selected on the grid. */
  reset(): void {
    this.refresh();
    this.step = 1;
    this.tab =
      this.forcesAvailable() && this.tabs.getCurrentTab() === TabID.FORCE ? 'forces' : 'kinematics';
    this.typedName = '';
    this.touchedColumns = false;
    this.pickedColumns.clear();
    this.pickedParts = new Set(
      this.partGroups()
        .flatMap((group) => group.parts)
        .filter((part) => part.available && part.note.includes('on the grid'))
        .map((part) => part.key)
    );
  }

  // --- step 1: parts --------------------------------------------------------

  partGroups(): ExportPartGroup[] {
    return (this.cached ??= this.build()).groups;
  }

  isPicked(part: ExportPart): boolean {
    return this.pickedParts.has(part.key);
  }

  togglePart(part: ExportPart): void {
    if (!part.available) return;
    if (!this.pickedParts.delete(part.key)) this.pickedParts.add(part.key);
    this.touchedColumns = false;
  }

  setParts(parts: ExportPart[], picked: boolean): void {
    parts
      .filter((part) => part.available)
      .forEach((part) => {
        if (picked) this.pickedParts.add(part.key);
        else this.pickedParts.delete(part.key);
      });
    this.touchedColumns = false;
  }

  selectedParts(): ExportPart[] {
    return this.catalog.partsOf(this.partGroups(), this.pickedParts);
  }

  offeredParts(): ExportPart[] {
    return this.partGroups()
      .flatMap((group) => group.parts)
      .filter((part) => part.available);
  }

  // --- step 2: columns ------------------------------------------------------

  /** Force columns are only worth a tab where a force analysis actually solves. */
  forcesAvailable(): boolean {
    return (this.cached ??= this.build()).forces;
  }

  columnGroups(tab: ColumnTab = this.tab): ExportColumnGroup[] {
    return this.catalog.columnGroups(this.selectedParts(), tab);
  }

  allColumns(): ExportColumn[] {
    const kinematic = this.columnGroups('kinematics').flatMap((group) => group.columns);
    const force = this.forcesAvailable()
      ? this.columnGroups('forces').flatMap((group) => group.columns)
      : [];
    return [...kinematic, ...force];
  }

  /**
   * What is ticked, defaulting to everything a reader usually wants.
   *
   * Centre of mass is the one thing left off: it is three more series per link
   * about a point most drawings never move, and a file is easier to widen than
   * to explain.
   */
  private defaults(): Set<string> {
    return new Set(
      this.allColumns()
        .filter((column) => column.key !== 'l:com')
        .map((column) => column.key)
    );
  }

  private current(): Set<string> {
    if (!this.touchedColumns) {
      this.pickedColumns = this.defaults();
      this.touchedColumns = true;
    }
    return this.pickedColumns;
  }

  isColumnPicked(column: ExportColumn): boolean {
    return this.current().has(column.key);
  }

  toggleColumn(column: ExportColumn): void {
    const picked = this.current();
    if (!picked.delete(column.key)) picked.add(column.key);
  }

  setColumns(columns: ExportColumn[], picked: boolean): void {
    const current = this.current();
    columns.forEach((column) => (picked ? current.add(column.key) : current.delete(column.key)));
  }

  selectedColumns(tab?: ColumnTab): ExportColumn[] {
    const picked = this.current();
    return this.allColumns().filter(
      (column) => picked.has(column.key) && (!tab || column.tab === tab)
    );
  }

  columnCount(tab: ColumnTab): number {
    return this.selectedColumns(tab).length;
  }

  forceMode(): ForceAnalysisMode {
    return this.settings.forceAnalysisMode.value;
  }

  setForceMode(mode: ForceAnalysisMode): void {
    this.settings.forceAnalysisMode.next(mode);
    this.refresh();
    this.touchedColumns = false;
  }

  // --- step 3: the file -----------------------------------------------------

  /** Which machines the chosen parts come from, in drawing order. */
  mechanismIndexes(): number[] {
    return [...new Set(this.selectedParts().map((part) => part.mechanismIndex))].sort(
      (a, b) => a - b
    );
  }

  /** The stem the files are named from, until the reader types their own. */
  defaultName(): string {
    const groups = this.partGroups();
    const first = this.mechanismIndexes()[0];
    const id = first === undefined ? 'mechanism' : (groups[first]?.id ?? 'mechanism');
    const forces = this.selectedColumns('forces').length > 0;
    return `${id}_${forces ? 'analysis' : 'kinematics'}`;
  }

  name(): string {
    return this.typedName.trim() || this.defaultName();
  }

  extension(): string {
    switch (this.format) {
      case 'xlsx':
        return '.xlsx';
      case 'images':
        return `.${this.imageFormat}`;
      case 'report':
        return '.pdf';
      default:
        return '.csv';
    }
  }

  canExport(): boolean {
    return this.selectedParts().length > 0 && this.selectedColumns().length > 0;
  }
}
