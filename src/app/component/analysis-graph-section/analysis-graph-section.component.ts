import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';
import {
  AnalysisGraphComponent,
  defaultSeriesSelection,
  SeriesSelection,
} from '../analysis-graph/analysis-graph.component';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { AngleUnit, LengthUnit } from '../../model/unit-enums';
import { ANALYSIS_SERIES_COLORS } from '../../model/analysis-series';
import { roundNumber } from '../../model/utils';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/** One value of one series, as the collapsed header shows it. */
export interface SeriesPreview {
  key: 'x' | 'y' | 'z';
  name: string;
  color: string;
  text: string;
}

/**
 * One analysable quantity: its name, its value right now, and its graph.
 *
 * The value is the point of the header. A reader looking for "where is joint B"
 * had to open a graph to find out, and the ten graphs a joint and a link offer
 * between them are ten things to open. The number is there before the graph is,
 * and the graph is what you open when the number is not enough.
 */
@Component({
  selector: 'app-analysis-graph-section',
  // The same open and close every other section in the app uses.
  animations: [
    trigger('openClose', [
      state('open', style({ visibility: AUTO_STYLE, height: AUTO_STYLE, opacity: '1' })),
      state('closed', style({ opacity: '0', height: '0px', padding: '0px' })),
      transition(':enter', []),
      transition('* => *', [animate('0.15s ease-in-out')]),
    ]),
  ],
  templateUrl: './analysis-graph-section.component.html',
  styleUrls: ['./analysis-graph-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, AnalysisGraphComponent],
})
export class AnalysisGraphSectionComponent {
  private mechanismService = inject(MechanismService);
  private settings = inject(SettingsService);
  private samples = inject(AnalysisSampleService);

  @Input() label = '';
  @Input() help = '';
  @Input() analysis = '';
  @Input() analysisType = '';
  @Input() mechProp = '';
  @Input() mechPart = '';
  @Input() reactionLinkId = '';
  @Input() expanded = false;
  @Output() expandedChange = new EventEmitter<boolean>();
  @ViewChild('graph') graph?: AnalysisGraphComponent;

  /**
   * What this quantity reads at the pose on screen.
   *
   * One sample, not the cycle: the header is answering "what is it now", and
   * solving every sample of every collapsed graph to answer that would cost
   * more than the graphs themselves.
   */
  /**
   * The last answer, and what it was an answer to.
   *
   * Reading one sample means solving the mechanism at that pose, and the
   * template asks this three times per pass -- to decide whether to draw the
   * row, to draw it, and to size the legend. Once per pose is enough.
   */
  private previewCache?: { key: string; mechanism: unknown; series: SeriesPreview[] };

  get preview(): SeriesPreview[] {
    const mechanism = this.mechanismFor();
    if (!mechanism) return [];
    // This machine's own sample, not the shared clock's: while the machines
    // are unsynced they are each somewhere different, and the header has to
    // agree with the pose actually on screen.
    const at = this.mechanismService.mechanisms.indexOf(mechanism);
    const step = Math.min(
      at === -1
        ? this.mechanismService.mechanismTimeStep
        : this.mechanismService.currentSampleOf(at),
      mechanism.joints.length - 1
    );
    const key = [
      step,
      this.settings.lengthUnit.value,
      this.settings.angleUnit.value,
      this.settings.forceUnit.value,
      this.analysis,
      this.analysisType,
      this.mechProp,
      this.mechPart,
      this.reactionLinkId,
    ].join('|');
    if (this.previewCache?.key === key && this.previewCache.mechanism === mechanism) {
      return this.previewCache.series;
    }
    const values = this.samples.sampleAt(
      mechanism,
      Math.max(step, 0),
      this.analysis,
      this.analysisType,
      this.mechProp,
      this.mechPart,
      this.reactionLinkId
    );
    const names = this.seriesNames(values.length);
    const keys: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    const unit = this.unitFor();
    const series = values.map((value, index) => ({
      key: keys[index],
      name: names[index],
      color: this.colorFor(names[index]),
      text: Number.isFinite(value) ? `${roundNumber(value, 2).toFixed(2)} ${unit}`.trim() : '—',
    }));
    this.previewCache = { key, mechanism, series };
    return series;
  }

  /**
   * Which series the legend is showing, held here rather than asked of the
   * graph.
   *
   * The graph only exists while the section is open, so asking it during the
   * template's own evaluation gave a different answer before and after the
   * child was created in that same pass -- which Angular reports as NG0100
   * against the legend's own class. Held here, it also survives the card being
   * closed and opened again, which is what a reader who turned a line off
   * expects.
   *
   * Undefined until the reader has an opinion, which is when the graph's own
   * default stands: the same default, computed from the same two facts, so the
   * legend and the plot agree on the very first frame rather than the legend
   * lighting everything up over a plot drawing one line.
   */
  private chosen?: SeriesSelection;

  /**
   * The default, held rather than made fresh each time it is asked for.
   *
   * It is handed to the graph as an input, and a new object every pass would
   * read as a new value -- which rebuilds the chart, which asks again.
   */
  private fallback = defaultSeriesSelection(0, '');
  private fallbackFor = -1;

  get shownSeries(): SeriesSelection {
    if (this.chosen) return this.chosen;
    const count = this.preview.length;
    if (count !== this.fallbackFor) {
      this.fallbackFor = count;
      this.fallback = defaultSeriesSelection(count, this.analysis);
    }
    return this.fallback;
  }

  isShown(key: 'x' | 'y' | 'z'): boolean {
    return this.shownSeries[key];
  }

  /**
   * The graph reporting what it is drawing, which is the legend's own state.
   *
   * By value, not by object: the graph reports after every rebuild, and taking
   * a fresh object each time would change an input it is bound to, which
   * rebuilds it, which reports again.
   */
  adoptSeries(selection: SeriesSelection): void {
    const shown = this.shownSeries;
    const same = shown.x === selection.x && shown.y === selection.y && shown.z === selection.z;
    this.chosen = same ? shown : selection;
  }

  toggleSeries(key: 'x' | 'y' | 'z'): void {
    const next = { ...this.shownSeries, [key]: !this.isShown(key) };
    this.chosen = next;
    this.graph?.toggleSeries(key);
  }

  /**
   * Ask the panel to open or close this section; do not decide it here.
   *
   * Every use of this component binds `expanded` both ways, so writing the
   * field as well as emitting gave the flag two owners: the view was checked
   * against the old value from the parent and then changed by the local write
   * in the same pass, which is what NG0100 was reporting against the card's
   * own open/closed class.
   */
  toggle(): void {
    this.expandedChange.emit(!this.expanded);
  }

  private mechanismFor() {
    const part =
      this.mechanismService.joints.find((joint) => joint.id === this.mechPart) ??
      this.mechanismService.links.find((link) => link.id === this.mechPart);
    return part ? this.mechanismService.mechanismContaining(part) : undefined;
  }

  /**
   * The names the graph plots these under.
   *
   * A third series is the magnitude of the first two everywhere except force
   * analysis, where it is a component in its own right.
   */
  private seriesNames(count: number): string[] {
    if (count === 1) return [''];
    if (count === 2) return ['X', 'Y'];
    return this.analysis === 'force' ? ['X', 'Y', 'Z'] : ['X', 'Y', 'Mag'];
  }

  private colorFor(name: string): string {
    if (name === 'Y') return ANALYSIS_SERIES_COLORS.Y;
    if (name === 'Z' || name === 'Mag') return ANALYSIS_SERIES_COLORS.Z;
    return ANALYSIS_SERIES_COLORS.X;
  }

  /** Spelled the way the graph's own axis spells it. */
  private unitFor(): string {
    const length = this.unitStr(this.settings.lengthUnit.value);
    const angle = this.unitStr(this.settings.angleUnit.value);
    if (this.mechProp.includes('Angular')) {
      if (this.mechProp.includes('Acc')) return `${angle}/s²`;
      if (this.mechProp.includes('Vel')) return `${angle}/s`;
      return angle;
    }
    if (this.analysis === 'force') return 'N';
    if (this.mechProp.includes('Acc')) return `${length}/s²`;
    if (this.mechProp.includes('Vel')) return `${length}/s`;
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
