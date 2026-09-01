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
import {
  ANALYSIS_SERIES_COLORS,
  angularScale,
  formatAnalysisValue,
} from '../../model/analysis-series';
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
  private previewCache?: { key: string; mechanism: unknown; series: SeriesPreview[] };

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
      text: Number.isFinite(value) ? `${formatAnalysisValue(value * scale)} ${unit}`.trim() : '—',
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
      this.fallback = defaultSeriesSelection(count, this.analysis());
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
    this.graph()?.toggleSeries(key);
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
