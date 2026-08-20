import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ScrollShadowDirective } from '../../scroll-shadow.directive';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { NotificationService } from '../../services/notification.service';
import { AnalyticsService } from '../../services/analytics.service';
import { ExportFlowService, ExportStep } from '../../services/export/export-flow.service';
import { ExportWriterService } from '../../services/export/export-writer.service';
import {
  ColumnTab,
  Decimals,
  ExportColumn,
  ExportFormat,
  ExportPart,
  ExportPartGroup,
} from '../../services/export/export-model';
import { RightPanelComponent } from '../right-panel/right-panel.component';

/** One of the three questions, as the rule across the top draws it. */
interface StepMark {
  number: ExportStep;
  name: string;
}

/**
 * Export Data, asked one question at a time.
 *
 * The old command wrote whatever the analysis panel happened to be showing for
 * whatever was selected: one part, every graph of it, always a CSV. Everything
 * else in the drawing — the other joints, the second mechanism, the forces —
 * was unreachable. This asks the three questions that were never asked: which
 * parts, which numbers, and how the file should be written.
 */
@Component({
  selector: 'app-export-panel',
  templateUrl: './export-panel.component.html',
  styleUrls: ['./export-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, ScrollShadowDirective],
})
export class ExportPanelComponent implements OnInit, OnDestroy {
  flow = inject(ExportFlowService);
  private writer = inject(ExportWriterService);
  private mechanism = inject(MechanismService);
  private activeObj = inject(ActiveObjService);
  private notify = inject(NotificationService);
  private analytics = inject(AnalyticsService);

  readonly steps: StepMark[] = [
    { number: 1, name: 'Parts' },
    { number: 2, name: 'Columns' },
    { number: 3, name: 'File' },
  ];

  readonly formats: { key: ExportFormat; name: string; note: string; about: string }[] = [
    {
      key: 'csv',
      name: 'CSV',
      note: 'One time column, one per series.',
      about:
        'A plain text table: the first row names the columns, and every row after it is one solved position. Opens in any spreadsheet and reads into any script. One file per machine, or one per part; more than two arrive as a zip.',
    },
    {
      key: 'xlsx',
      name: 'Excel workbook',
      note: 'Sheets by analysis or by part, for charting.',
      about:
        'One .xlsx holding the same numbers on separate sheets — kinematics and forces apart, or a sheet per part — so several series can be charted together without pasting between files. Written here rather than exported through Excel, so no add-in is needed.',
    },
    {
      key: 'images',
      name: 'Graph images',
      note: 'PNG or SVG per graph.',
      about:
        'A picture of every graph the selection asks for, drawn at the size it is plotted, with the PMKS+ mark on it. SVG stays sharp at any size and can be edited; PNG drops into a document that will not take a vector. More than two arrive as a zip.',
    },
    {
      key: 'report',
      name: 'Report',
      note: 'PDF: mechanism, graphs and table.',
      about:
        'A printable document: the mechanism as drawn, what it was solved under, its graphs, and every row the CSV would have held. Opens the print dialog, where “Save as PDF” writes the file. The share link is on every page, so a report leads back to the mechanism that made it.',
    },
  ];

  readonly decimalChoices: Decimals[] = [2, 4, 6, 'full'];

  /** Set while the browser is drawing pictures, which is not instant. */
  working = false;

  private updates?: Subscription;

  ngOnInit(): void {
    this.flow.reset();
    this.updates = this.mechanism.onMechUpdateState.subscribe(() => this.flow.refresh());
  }

  ngOnDestroy(): void {
    this.updates?.unsubscribe();
    // Nothing on the canvas should stay lit once the list that lit it is gone.
    this.mechanism.hoveredPart = undefined;
  }

  // --- what the head says ---------------------------------------------------

  get lead(): string {
    if (this.flow.step === 1) return 'Which parts do you want numbers for?';
    if (this.flow.step === 3) return 'How should the file be written?';
    const names = this.flow.selectedParts().map((part) => part.label.replace(/^(Joint|Link) /, ''));
    return names.length === 0 ? 'Nothing is selected yet.' : `Which numbers for ${list(names)}?`;
  }

  get countText(): string {
    if (this.flow.step === 1) {
      return `${this.flow.selectedParts().length} of ${this.flow.offeredParts().length} parts`;
    }
    const tab = this.flow.tab;
    const of = this.flow.columnGroups(tab).flatMap((group) => group.columns).length;
    const picked = this.flow.columnCount(tab);
    return tab === 'forces' ? `${picked} of ${of} force columns` : `${picked} of ${of} columns`;
  }

  get footNote(): string {
    if (this.flow.step === 1) {
      const parts = this.flow.selectedParts().length;
      const machines = this.flow
        .mechanismIndexes()
        .map((index) => this.flow.partGroups()[index]?.id)
        .filter(Boolean)
        .join(', ');
      return parts === 0
        ? 'Nothing chosen yet'
        : `${parts} ${parts === 1 ? 'part' : 'parts'}${machines ? ' · ' + machines : ''}`;
    }
    if (this.flow.step === 2) {
      const summary = this.writer.summary();
      return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows`;
    }
    return '';
  }

  // --- step 1 ---------------------------------------------------------------

  groups(): ExportPartGroup[] {
    return this.flow.partGroups().filter((group) => group.parts.length > 0);
  }

  pickedIn(group: ExportPartGroup): number {
    return group.parts.filter((part) => this.flow.isPicked(part)).length;
  }

  groupNote(group: ExportPartGroup): string {
    const picked = this.pickedIn(group);
    return picked > 0 ? `${group.note} · ${picked} selected` : group.note;
  }

  /**
   * Point at the part this row is about, on the canvas.
   *
   * A name is not a place: `Joint F` on a Jansen leg is one of eleven pins and
   * the list says nothing about which. The grid defers to whatever is already
   * selected there, so this can never take a reader's own mark away.
   */
  pointAt(part: ExportPart | undefined): void {
    this.mechanism.hoveredPart = part?.part;
  }

  /** Whether this row is the thing the reader picked on the canvas. */
  isOnGrid(part: ExportPart): boolean {
    if (part.kind === 'joint') return this.activeObj.selectedJoint?.id === part.id;
    return this.activeObj.selectedLink?.id === part.id;
  }

  everything(picked: boolean): void {
    this.flow.setParts(this.flow.offeredParts(), picked);
  }

  // --- step 2 ---------------------------------------------------------------

  setTab(tab: ColumnTab): void {
    this.flow.tab = tab;
  }

  allColumnsOnTab(): ExportColumn[] {
    return this.flow.columnGroups(this.flow.tab).flatMap((group) => group.columns);
  }

  everyColumn(picked: boolean): void {
    this.flow.setColumns(this.allColumnsOnTab(), picked);
  }

  /**
   * What one ticked row will actually write, said on the row itself.
   *
   * The components control underneath used to be the only statement of it,
   * which left a reader to work out for themselves that it governs a rate and a
   * reaction but has nothing to add to an angle or a position.
   */
  componentsOf(column: ExportColumn): string {
    const widest = column.series.reduce((most, series) => Math.max(most, series.components), 1);
    if (widest < 2) return '';
    return widest === 2 || !this.flow.withMagnitude ? 'X, Y' : 'X, Y, Mag';
  }

  /** Whether anything on offer has a magnitude, and so anything to choose. */
  hasMagnitude(): boolean {
    return this.allColumnsOnTab().some((column) =>
      column.series.some((series) => series.components === 3)
    );
  }

  // --- step 3 ---------------------------------------------------------------

  get summaryLine(): string {
    const summary = this.writer.summary();
    if (this.flow.format === 'images') {
      const pictures = this.pictureCount();
      return `${pictures} ${pictures === 1 ? 'image' : 'images'} · ${this.flow.imageFormat.toUpperCase()}`;
    }
    if (this.flow.format === 'report') {
      return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows · ${
        summary.pages
      } printed ${summary.pages === 1 ? 'page' : 'pages'}`;
    }
    const files = summary.files;
    return `${Math.max(summary.columns - 1, 0)} columns · ${summary.rows} rows · ${files} ${
      files === 1
        ? this.flow.format === 'xlsx'
          ? 'workbook'
          : 'file'
        : this.flow.format === 'xlsx'
          ? 'sheets'
          : 'files'
    }`;
  }

  private pictureCount(): number {
    return this.flow
      .selectedColumns()
      .reduce((total, column) => total + column.appliesTo.length * column.series.length, 0);
  }

  get fileName(): string {
    return this.flow.name();
  }

  onName(event: Event): void {
    this.flow.typedName = (event.target as HTMLInputElement).value;
  }

  decimalLabel(choice: Decimals): string {
    return choice === 'full' ? 'Full' : String(choice);
  }

  // --- moving between the steps --------------------------------------------

  canGoOn(): boolean {
    if (this.flow.step === 1) return this.flow.selectedParts().length > 0;
    if (this.flow.step === 2) return this.flow.selectedColumns().length > 0;
    return this.flow.canExport();
  }

  next(): void {
    if (!this.canGoOn()) return;
    if (this.flow.step === 3) {
      void this.exportNow();
      return;
    }
    this.flow.step = (this.flow.step + 1) as ExportStep;
    if (this.flow.step === 2 && this.flow.tab === 'forces' && !this.flow.forcesAvailable()) {
      this.flow.tab = 'kinematics';
    }
  }

  back(): void {
    if (this.flow.step > 1) this.flow.step = (this.flow.step - 1) as ExportStep;
  }

  goTo(step: ExportStep): void {
    if (step < this.flow.step) this.flow.step = step;
  }

  async exportNow(): Promise<void> {
    if (!this.flow.canExport() || this.working) return;
    this.working = true;
    // Let the button paint its spinner before the work starts. Sampling a
    // cycle for eighty series holds the main thread, and a press that showed
    // nothing until it finished read as a press that had not registered.
    await new Promise((resolve) => setTimeout(resolve, 32));
    this.analytics.logEvent(`export_data_${this.flow.format}`);
    try {
      const written = await this.writer.run();
      if (!written) {
        this.notify.refusal(
          'export.empty',
          'Nothing was written: the parts that were ticked no longer have numbers to give.'
        );
        return;
      }
      this.notify.success(
        'export.done',
        this.flow.format === 'report'
          ? 'The report is ready to print or save as PDF.'
          : `${this.fileName}${this.flow.extension()} is on its way.`
      );
    } catch {
      this.notify.failure('export.failed', 'The export could not be written.');
    } finally {
      this.working = false;
    }
  }

  close(): void {
    RightPanelComponent.isOpen = false;
  }

  isPicked = (part: ExportPart): boolean => this.flow.isPicked(part);
}

/** `B`, `B and C`, `B, C and AB` — a list read the way it is spoken. */
function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
