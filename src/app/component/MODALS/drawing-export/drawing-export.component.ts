import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { LengthUnit } from '../../../model/unit-enums';
import { centimetersIn } from '../../../services/export/dxf/semantic-dxf';
import {
  DEFAULT_DXF_EXPORT_OPTIONS,
  DxfDataFile,
  DxfExportChoices,
  DxfExportService,
  DxfJointCircles,
  DxfLinkBodies,
  DxfOrigin,
  DxfPresetName,
  DxfSummary,
  DXF_PRESETS,
  unitWord,
} from '../../../services/export/dxf/dxf-export.service';

/** A row in the Layers checklist: what it is called here, and in CAD. */
interface LayerRow {
  /** Absent for the two that are always written. */
  key?: keyof DxfExportChoices;
  name: string;
  cad: string;
  /** Shown ticked and unpressable, with this as the reason. */
  fixed?: string;
}

const LAYER_ROWS: LayerRow[] = [
  { key: 'perLinkLayers', name: 'One layer per link', cad: 'PMKS_LINK_*' },
  {
    name: 'Link centrelines',
    cad: 'PMKS_LINK_CENTERLINES',
    fixed: 'Always included — a drawing without centrelines is empty.',
  },
  { name: 'Joint centres', cad: 'PMKS_JOINT_CENTERS', fixed: 'Always included.' },
  { key: 'includeGroundPoints', name: 'Ground points', cad: 'PMKS_GROUND_POINTS' },
  {
    key: 'includeKinematicAnnotations',
    name: 'Kinematic annotations',
    cad: 'PMKS_KINEMATIC_ANNOTATIONS',
  },
  { key: 'includeLabels', name: 'Labels', cad: 'PMKS_LABELS' },
  { key: 'includeNotes', name: 'Notes', cad: 'PMKS_NOTES' },
];

/**
 * The CAD Export dialog.
 *
 * A destination first, the detail folded behind four summaries, and a live
 * count with a thumbnail above the button. The argument, which the brief in
 * `docs/cad-export-design.md` makes at length: this is not a DXF options panel.
 * A reader is trying to get a linkage into SolidWorks and build a part per
 * link, and eleven checkboxes with no recommended path would be a worse screen
 * than the four it replaced. So one question carries nine of the ten decisions,
 * and the detail is there for the reader who wants it.
 */
@Component({
  selector: 'app-drawing-export',
  templateUrl: './drawing-export.component.html',
  styleUrls: ['./drawing-export.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatIcon,
    MatIconButton,
    MatTooltip,
  ],
})
export class DrawingExportComponent {
  static openIn(dialog: MatDialog): MatDialogRef<DrawingExportComponent> {
    return dialog.open(DrawingExportComponent, {
      width: 'min(520px, calc(100vw - 24px))',
      maxHeight: 'calc(100vh - 24px)',
      autoFocus: 'dialog',
    });
  }

  private exportService = inject(DxfExportService);
  private dialogRef = inject<MatDialogRef<DrawingExportComponent> | null>(
    MatDialogRef<DrawingExportComponent>,
    { optional: true }
  );

  options: DxfExportChoices = { ...DEFAULT_DXF_EXPORT_OPTIONS };
  preset: DxfPresetName | 'custom' = 'build';

  open = { file: false, geometry: false, layers: false, data: false };

  readonly layerRows = LAYER_ROWS;
  readonly unitChoices: { label: string; value: LengthUnit }[] = [
    { label: 'cm', value: LengthUnit.CM },
    { label: 'm', value: LengthUnit.METER },
    { label: 'in', value: LengthUnit.INCH },
  ];
  readonly originChoices: { label: string; value: DxfOrigin }[] = [
    { label: 'Keep model coordinates', value: 'model' },
    { label: 'First ground joint', value: 'ground' },
    { label: 'Centre of drawing', value: 'center' },
    { label: 'Choose a joint…', value: 'joint' },
  ];
  readonly bodyChoices: { label: string; note: string; value: DxfLinkBodies }[] = [
    {
      label: 'Closed outlines',
      note: 'The part shape, with its pin holes — a face CAD can extrude.',
      value: 'outlines',
    },
    {
      label: 'Centrelines',
      note: 'One line per link. A drawing to trace over, not a part.',
      value: 'centerlines',
    },
  ];
  readonly circleChoices: { label: string; value: DxfJointCircles }[] = [
    { label: 'None (points only)', value: 'none' },
    { label: 'Marks only', value: 'marks' },
    { label: 'Pin holes at Ø', value: 'holes' },
  ];
  readonly dataChoices: { label: string; note: string; value: DxfDataFile }[] = [
    { label: 'None', note: 'The DXF on its own.', value: 'none' },
    { label: 'CSV', note: 'Joint table and link table, two sheets.', value: 'csv' },
    { label: 'JSON', note: 'The same tables, one structured file.', value: 'json' },
  ];

  // --- what the drawing can offer -------------------------------------------

  get isEmpty(): boolean {
    return !this.exportService.hasGeometry();
  }

  get isCustom(): boolean {
    return this.preset === 'custom';
  }

  /**
   * The unit this export is in.
   *
   * `options.unit` is only set once a reader has chosen one; until then the
   * export follows the project. The segmented control compares against this
   * rather than against the word in the summary -- comparing a `LengthUnit` to
   * the string 'cm' is never true, which is why no unit looked selected.
   */
  get effectiveUnit(): LengthUnit {
    return this.options.unit ?? this.exportService.projectUnit();
  }

  /**
   * The hole this export will cut, chosen or derived.
   *
   * Same shape as `effectiveUnit` and for the same reason: the field shows what
   * will happen, whether or not anybody has typed into it. Derived means half
   * the width the link bodies are drawn at, so the hole fits the part.
   */
  get effectivePinDiameter(): number {
    return this.exportService.pinDiameter(this.options);
  }

  jointChoices(): { id: string; name: string }[] {
    return this.exportService.originJointChoices();
  }

  /** Why a row is greyed, or nothing. The rule the rest of the app follows. */
  reasonFor(key: keyof DxfExportChoices): string {
    if (this.isEmpty) return 'Nothing to export yet — draw a mechanism first.';
    if (key === 'includeTracedPaths' && !this.exportService.hasTracedJoint()) {
      return 'No joint is tracing a path. Turn one on from the Edit panel.';
    }
    return '';
  }

  blocked(key: keyof DxfExportChoices): boolean {
    return this.reasonFor(key) !== '';
  }

  // --- choosing -------------------------------------------------------------

  pick(name: DxfPresetName): void {
    this.options = { ...this.options, ...DXF_PRESETS[name] };
    this.preset = name;
  }

  /**
   * Any change to the detail below means the reader has left the preset.
   *
   * The values are kept rather than reset: Custom is a description of where
   * they are, not a mode they switched into.
   */
  touch(patch: Partial<DxfExportChoices>): void {
    this.options = { ...this.options, ...patch };
    this.preset = 'custom';
  }

  /**
   * A change no preset has an opinion about: the file's name, its units, its
   * DXF version. Neither preset sets any of them, so leaving the preset over
   * one would put a "Reset to Build parts" button on screen offering to undo
   * something it would not actually undo -- and the file name, in that same
   * section, never did.
   */
  set(patch: Partial<DxfExportChoices>): void {
    this.options = { ...this.options, ...patch };
  }

  /**
   * Change the unit the export is written in, keeping the pin the size it is.
   *
   * The pin diameter is a physical hole, typed in whatever unit the file is in.
   * Left alone, switching to metres turns the 0.6 cm default into a 0.6 m one
   * beside a field that still reads 0.6, which nobody would catch until the
   * part came back.
   */
  chooseUnit(unit: LengthUnit): void {
    // A pin nobody has chosen is derived from the drawing and already follows
    // the unit, so there is nothing to rescale -- and rescaling it would pin it
    // to a number, which is exactly what "unset" is avoiding.
    if (this.options.pinDiameter === undefined) {
      this.set({ unit });
      return;
    }
    const factor = centimetersIn(unit) / centimetersIn(this.effectiveUnit);
    this.set({
      unit,
      pinDiameter: Number((this.options.pinDiameter * factor).toPrecision(4)),
    });
  }

  toggle(key: keyof DxfExportChoices): void {
    if (this.blocked(key)) return;
    this.touch({ [key]: !this.options[key] } as Partial<DxfExportChoices>);
  }

  isOn(key: keyof DxfExportChoices): boolean {
    return this.options[key] === true;
  }

  // --- what each folded section says ----------------------------------------

  /** What kind of drawing this will be, said under the title. */
  get subtitleShape(): string {
    return this.options.linkBodies === 'outlines' ? 'part outlines' : 'centreline sketch';
  }

  /** How this export's unit is spelled wherever the dialog names one. */
  get unitWord(): string {
    return unitWord(this.effectiveUnit);
  }

  get fileSummary(): string {
    return this.exportService.fileNames(this.options)[0];
  }

  get geometrySummary(): string {
    const bodies = this.options.linkBodies === 'outlines' ? 'outlines' : 'centrelines';
    const origin =
      this.options.origin === 'model'
        ? 'model coordinates'
        : this.options.origin === 'center'
          ? 'origin at centre'
          : `origin at ${this.originJointLabel}`;
    const circles =
      this.options.jointCircles === 'none'
        ? 'points only'
        : this.options.jointCircles === 'marks'
          ? 'joint marks'
          : `Ø${this.effectivePinDiameter} ${this.summary.unit} holes`;
    return `${bodies} · ${origin} · ${circles}`;
  }

  get originJointLabel(): string {
    if (this.options.origin === 'joint') {
      return this.options.originJointId ?? this.jointChoices()[0]?.id ?? 'A';
    }
    return this.exportService.firstGroundJointName() ?? 'ground';
  }

  get layersSummary(): string {
    const on = LAYER_ROWS.filter(
      (row) => row.fixed || (row.key !== undefined && this.isOn(row.key) && !this.blocked(row.key))
    ).length;
    return `${on} of ${LAYER_ROWS.length} included`;
  }

  /** Whether a layer row shows a tick. */
  layerOn(row: LayerRow): boolean {
    return row.fixed !== undefined || (row.key !== undefined && this.isOn(row.key));
  }

  layerBlocked(row: LayerRow): boolean {
    return row.fixed !== undefined || (row.key !== undefined && this.blocked(row.key));
  }

  layerReason(row: LayerRow): string {
    return row.fixed ?? (row.key ? this.reasonFor(row.key) : '');
  }

  toggleLayer(row: LayerRow): void {
    if (row.key && !row.fixed) this.toggle(row.key);
  }

  get dataSummary(): string {
    return this.options.dataFile === 'none'
      ? 'DXF only'
      : `DXF + ${this.options.dataFile.toUpperCase()} (zip)`;
  }

  // --- the footer -----------------------------------------------------------

  get summary(): DxfSummary {
    return this.exportService.summarize(this.options);
  }

  get liveSummary(): string {
    if (this.isEmpty) return 'Nothing to export yet — draw a mechanism first.';
    const { entities, layers, width, height, unit } = this.summary;
    return `${entities} entities · ${layers} layers · ${width.toFixed(0)} × ${height.toFixed(0)} ${unit}`;
  }

  /** A hole wider than the part it is cut in, said where the reader is looking. */
  get warning(): string {
    return this.isEmpty ? '' : this.exportService.pinWarning(this.options);
  }

  get deliveryLine(): string {
    if (this.isEmpty) return 'The grid is empty.';
    const names = this.exportService.fileNames(this.options);
    const download = this.exportService.downloadName(this.options);
    if (names.length === 1) return `Downloads as ${download}`;
    return `Downloads as ${download} — ${names.join(', ')}`;
  }

  get exportLabel(): string {
    return this.options.dataFile === 'none'
      ? 'Export DXF'
      : `Export DXF + ${this.options.dataFile.toUpperCase()}`;
  }

  download(): void {
    if (this.isEmpty) return;
    const file = this.exportService.create(this.options);
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
    this.dialogRef?.close();
  }
}
