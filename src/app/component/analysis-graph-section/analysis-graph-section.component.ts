import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';
import {
  AnalysisGraphComponent,
  defaultSeriesSelection,
  SeriesSelection,
} from '../analysis-graph/analysis-graph.component';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { ForceUnit } from '../../model/unit-enums';
import { ForceAnalysisMode } from '../../model/mechanism/force-solver';
import { Mechanism } from '../../model/mechanism/mechanism';
import { ANALYSIS_SERIES_COLORS, angularScale, formatReading } from '../../model/analysis-series';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

/** One value of one series, at the pose on screen. */
export interface SeriesPreview {
  key: 'x' | 'y' | 'z';
  name: string;
  color: string;
  /** The number alone; the row says the unit once, after all of them. */
  text: string;
}

/**
 * Which of a plot's series the reader is looking at: the magnitude, or the two
 * components it is the magnitude of. Two lines or four, never six -- and never
 * a lone component, which is a picture of half a vector.
 */
export type SeriesMode = 'mag' | 'xy';

/** The series a mode draws, for a plot with this many of them. */
export function selectionFor(count: number, mode: SeriesMode): SeriesSelection {
  if (count === 1 || (count === 3 && mode === 'mag')) return { x: false, y: false, z: true };
  return { x: true, y: true, z: false };
}

/**
 * One analysable quantity: its name, its value right now, and its graph.
 *
 * The value is the point of the row. A reader looking for "where is joint B"
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
  imports: [MatIcon, MatTooltip, AnalysisGraphComponent, SegmentedComponent],
})
export class AnalysisGraphSectionComponent {
  private mechanismService = inject(MechanismService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private samples = inject(AnalysisSampleService);

  readonly label = input('');
  @Input() help = '';
  readonly analysis = input('');
  readonly analysisType = input('');
  readonly mechProp = input('');
  readonly mechPart = input('');
  readonly reactionLinkId = input('');
  readonly expanded = input(false);
  readonly expandedChange = output<boolean>();
  readonly graph = viewChild<AnalysisGraphComponent>('graph');

  /**
   * The last answer, and what it was an answer to.
   *
   * Reading one sample means solving the mechanism at that pose, and the
   * template asks this three times per pass -- to decide whether to draw the
   * row, to draw it, and to size the legend. Once per pose is enough.
   */
  private previewCache?: {
    key: string;
    mechanism: unknown;
    series: SeriesPreview[];
    unit: string;
  };

  /**
   * What this quantity reads at the pose on screen.
   *
   * One sample, not the cycle: the header is answering "what is it now", and
   * solving every sample of every collapsed graph to answer that would cost
   * more than the graphs themselves.
   */
  get preview(): SeriesPreview[] {
    const mechanism = this.mechanismService.mechanismForId(this.mechPart());
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
      // The pose, not just the sample. A drag changes the geometry without
      // moving the playhead, so keyed on the sample alone this header went on
      // quoting the number it read before the drag started.
      this.mechanismService.poseRevision,
      this.settings.lengthUnit.value,
      this.settings.angleUnit.value,
      this.settings.forceUnit.value,
      this.analysis(),
      this.analysisType(),
      this.mechProp(),
      this.mechPart(),
      this.reactionLinkId(),
    ].join('|');
    if (this.previewCache?.key === key && this.previewCache.mechanism === mechanism) {
      return this.previewCache.series;
    }
    const values = this.samples.sampleAt(
      mechanism,
      Math.max(step, 0),
      this.analysis(),
      this.analysisType(),
      this.mechProp(),
      this.mechPart(),
      this.reactionLinkId()
    );
    const names = this.seriesNames(values.length);
    const keys: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    const unit = this.unitFor(mechanism);
    // The same conversion the plot below applies. Without it the header quoted
    // a link's angular velocity in radians per second under a "deg/s" label,
    // directly above a curve reading the same instant in degrees.
    const scale = angularScale(this.mechProp(), this.settings.angleUnit.value);
    const series = values.map((value, index) => ({
      key: keys[index],
      name: names[index],
      color: this.colorFor(names[index]),
      text: Number.isFinite(value) ? formatReading(value * scale) : '—',
    }));
    this.previewCache = { key, mechanism, series, unit };
    return series;
  }

  /** What every number in this row is in. */
  get unit(): string {
    // The preview computes it; asking for the preview first keeps the cache warm.
    this.preview;
    return this.previewCache?.unit ?? '';
  }

  /**
   * The row's number: what the plot's chosen series read right now.
   *
   * The pair as "x, y" and a magnitude on its own, so the closed row already
   * says what the open one would draw.
   */
  get readout(): string {
    const preview = this.preview;
    if (!preview.length) return '';
    if (preview.length === 1) return preview[0].text;
    if (preview.length === 3 && this.mode === 'mag') return preview[2].text;
    return `${preview[0].text}, ${preview[1].text}`;
  }

  /** The two halves of the split, held so the pill is not handed a new array each pass. */
  readonly splitOptions = ['Magnitude', 'X & Y components'];

  /** Whether this plot has a magnitude and its components to choose between. */
  get hasSplit(): boolean {
    return this.preview.length === 3;
  }

  /**
   * Which half of the split the reader chose, held here rather than asked of
   * the graph.
   *
   * The graph only exists while the row is open, so asking it during the
   * template's own evaluation gave a different answer before and after the
   * child was created in that same pass -- which Angular reports as NG0100.
   * Held here, it also survives the row being closed and opened again, which
   * is what a reader who switched to the components expects.
   *
   * Undefined until the reader has an opinion, which is when the graph's own
   * default stands: force plots open on the components, since the direction
   * of a reaction is what is being read; kinematic ones lead with the
   * magnitude.
   */
  private chosen?: SeriesMode;

  get mode(): SeriesMode {
    if (this.chosen) return this.chosen;
    const fallback = defaultSeriesSelection(this.preview.length, this.analysis());
    return fallback.z && !fallback.x ? 'mag' : 'xy';
  }

  /**
   * The selection, held rather than made fresh each time it is asked for.
   *
   * It is handed to the graph as an input, and a new object every pass would
   * read as a new value -- which rebuilds the chart, which asks again.
   */
  private selection = selectionFor(0, 'xy');
  private selectionKey = '';

  get shownSeries(): SeriesSelection {
    const key = `${this.preview.length}|${this.mode}`;
    if (key !== this.selectionKey) {
      this.selectionKey = key;
      this.selection = selectionFor(this.preview.length, this.mode);
    }
    return this.selection;
  }

  setMode(mode: SeriesMode): void {
    if (this.mode === mode) return;
    this.chosen = mode;
    this.graph()?.showSeries(this.shownSeries);
  }

  /**
   * The graph reporting what it is drawing, which is the switch's own state.
   *
   * By value: the graph reports after every rebuild, and an answer that
   * agrees with the switch must not move it.
   */
  adoptSeries(selection: SeriesSelection): void {
    const mode: SeriesMode = selection.z && !selection.x && !selection.y ? 'mag' : 'xy';
    if (mode !== this.mode) this.chosen = mode;
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
    this.expandedChange.emit(!this.expanded());
  }

  /**
   * The names the graph plots these under.
   *
   * A third series is the magnitude of the first two, force analysis included:
   * a planar reaction has no out-of-plane component, and the solver returns
   * hypot(x, y) there like everywhere else.
   */
  private seriesNames(count: number): string[] {
    if (count === 1) return [''];
    if (count === 2) return ['X', 'Y'];
    return ['X', 'Y', 'Mag'];
  }

  private colorFor(name: string): string {
    if (name === 'Y') return ANALYSIS_SERIES_COLORS.Y;
    if (name === 'Mag') return ANALYSIS_SERIES_COLORS.Z;
    return ANALYSIS_SERIES_COLORS.X;
  }

  /** Spelled the way the graph's own axis spells it. */
  private unitFor(mechanism: Mechanism | undefined): string {
    const angle = this.nup.unitLabel(this.settings.angleUnit.value);
    const mechProp = this.mechProp();
    if (mechProp.includes('Angular')) {
      if (mechProp.includes('Acc')) return `${angle}/s²`;
      if (mechProp.includes('Vel')) return `${angle}/s`;
      return angle;
    }
    if (this.analysis() === 'force') return this.forceUnitFor(mechanism);
    const length = this.nup.unitLabel(this.settings.lengthUnit.value);
    if (mechProp.includes('Acc')) return `${length}/s²`;
    if (mechProp.includes('Vel')) return `${length}/s`;
    return length;
  }

  /**
   * What a force card's number is in — the same two facts the plot's own axis
   * title is built from.
   *
   * The sample arrives already converted (lbf under English units, and an
   * input torque in lbf·in or N·m), so a fixed "N" mislabeled every English
   * reading and every torque. Whether the input is driven by a force or a
   * torque is a property of the drive, not of the units, so it is read off the
   * solved frames rather than guessed from the joint.
   */
  private forceUnitFor(mechanism: Mechanism | undefined): string {
    const force = this.nup.unitLabel(this.settings.forceUnit.value);
    const mechProp = this.mechProp();
    if (mechProp !== 'Input Torque' && mechProp !== 'Input Effort') return force;
    const mode: ForceAnalysisMode = this.analysisType() === 'dynamic' ? 'dynamic' : 'static';
    const kind = mechanism
      ?.getForceAnalysis(mode)
      .frames.find((frame) => frame.status === 'ok' && frame.inputEffort)?.inputEffort?.kind;
    if (kind === 'force') return force;
    return this.settings.forceUnit.value === ForceUnit.LBF ? 'lbf·in' : 'N·m';
  }
}
