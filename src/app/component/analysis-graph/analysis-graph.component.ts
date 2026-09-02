import { MatIcon } from '@angular/material/icon';
import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  DoCheck,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
  inject,
  output,
} from '@angular/core';
import {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexGrid,
  ApexDataLabels,
  ApexFill,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTitleSubtitle,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';
import { KinematicsSolver } from 'src/app/model/mechanism/kinematic-solver';
import {
  ANALYSIS_SERIES_COLORS,
  angularScale,
  formatReading,
} from 'src/app/model/analysis-series';
export { ANALYSIS_SERIES_COLORS };
import { ForceAnalysisMode } from 'src/app/model/mechanism/force-solver';
import { ForceUnit } from '../../model/utils';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { FormBuilder } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import {
  AnalysisCompareService,
  ComparisonHolder,
} from '../../services/analysis-compare.service';
import { skip, Subscription } from 'rxjs';
import { AnalysisApexChartComponent } from './analysis-apex-chart.component';

export type ChartOptions = {
  annotations: ApexAnnotations;
  series: ApexAxisChartSeries;
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  title: ApexTitleSubtitle;
  fill: ApexFill;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  grid: ApexGrid;
  colors: string[];
  legend: ApexLegend;
};

/**
 * Time axis labels: a typical cycle runs 0-3 s, where "3.000" is noise. Cap at
 * three decimals and drop the ones that carry no information.
 */
export function formatTimeLabel(value: number): string {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) return '';
  return Number(rounded.toFixed(3)).toString();
}

/**
 * The two ends of the time axis, to one decimal.
 *
 * They read beside the y axis, which is also one decimal, and "0" against
 * "6.0" looks like two different kinds of number.
 */
export function formatAxisEnd(value: number): string {
  const rounded = Number(value);
  if (!Number.isFinite(rounded)) return '';
  return rounded.toFixed(1);
}

/** Apex's own fallback, kept by name so the axis can be handed back to it. */
export const FLOOR_OF = (min: number) => Math.floor(min);
export const CEIL_OF = (max: number) => Math.ceil(max);

/**
 * A y axis whose gridlines land on round numbers -- zero among them.
 *
 * Both limits are whole multiples of one step, so every line between them is
 * too.
 *
 * A series that never changes gets the range from zero to its own value. It has
 * no range of its own to divide, and what little it has is floating-point
 * noise: the speed of a four-bar's crank pin is constant, and fitting the axis
 * to it gave a window 1.5e-6 wide, in which every label read "6.2" and the line
 * wandered across the full height of the plot as rounding error. Against zero
 * it reads as what it is -- a constant, at a height the axis can be read off --
 * and zero is the comparison a reader wants of a constant anyway.
 */
export function niceAxisScale(
  low: number,
  high: number
): { min: number; max: number; tickAmount: number } | undefined {
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) return undefined;
  if (high - low <= 1e-6 * Math.max(Math.abs(low), Math.abs(high))) {
    // Nothing to plot against but zero, and a series at zero has not even that.
    if (low === 0 && high === 0) return { min: -1, max: 1, tickAmount: 2 };
    return niceAxisScale(Math.min(0, low), Math.max(0, high));
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10((high - low) / 4)));
  const step =
    [1, 2, 2.5, 5, 10]
      .map((factor) => factor * magnitude)
      .find((size) => size >= (high - low) / 4) ?? 10 * magnitude;
  // Away from binary noise: 0.1 + 0.2 arithmetic leaves limits like -1.0000000000000002,
  // which Apex prints in full.
  const round = (value: number) => Number(value.toPrecision(12));
  const min = round(Math.floor(low / step) * step);
  const max = round(Math.ceil(high / step) * step);
  return { min, max, tickAmount: Math.max(1, Math.round((max - min) / step)) };
}

/** Which of a graph's three series it draws. */
export interface SeriesSelection {
  x: boolean;
  y: boolean;
  z: boolean;
}

/**
 * Which series a graph opens on.
 *
 * Force graphs open on the X and Y components, since the direction of a
 * reaction is what is being read; kinematic graphs lead with the magnitude. A
 * single-series graph only ever has the magnitude to show.
 *
 * Exported because the legend above the plot has to say the same thing on the
 * very first frame. It used to ask the graph, and the graph did not exist yet,
 * so the legend showed everything lit while the plot drew one line.
 */
/**
 * How a baseline series is named and told apart.
 *
 * A suffix rather than a parallel structure: Apex identifies a series by its
 * name, the tooltip reads it out, and the visibility toggles work on the live
 * name with the suffix stripped -- so hiding Y hides both Ys without the legend
 * growing a second set of chips.
 */
const BEFORE_SUFFIX = ' before';
const BEFORE = / before$/;

/**
 * The range an axis should show, ignoring the sample or two a toggle position
 * throws towards infinity.
 *
 * Acceleration near a toggle is a singularity: a drag that takes a four-bar
 * through one produces two samples out of 360 reading twenty thousand against a
 * curve whose real range is nought to twelve. Fitted to the true maximum, the
 * axis is right and the plot is useless -- every real feature collapses onto the
 * zero line and the reader is told their curve is flat, which is false.
 *
 * So the tails are trimmed, but only when they are *outliers*: unless the full
 * spread is several times the inner one, the true range is the honest range and
 * clipping it would hide a real peak, which is the thing this whole overlay
 * exists to show moving.
 */
export function readableRange(values: number[]): { low: number; high: number } {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (values.length < 20) return { low, high };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.round(q * (sorted.length - 1))];
  const inner = { low: at(0.01), high: at(0.99) };
  const spread = inner.high - inner.low;
  return spread > 0 && high - low > spread * 4 ? inner : { low, high };
}

/**
 * The same ink, ghosted: "the same thing, earlier", as the start-pose ghost
 * says it.
 *
 * Not one alpha for all three. Amber at the indigo's alpha all but vanished
 * against white, so the magnitude's earlier curve was a rumor while the
 * components' were legible; it is given a little more.
 */
export function ghostOf(color: string): string {
  const hex = color.replace('#', '');
  const to = (at: number) => parseInt(hex.slice(at, at + 2), 16);
  const alpha = color.toLowerCase() === ANALYSIS_SERIES_COLORS.Z.toLowerCase() ? 0.42 : 0.34;
  return hex.length === 6 ? `rgba(${to(0)}, ${to(2)}, ${to(4)}, ${alpha})` : color;
}

/** One series' reach, as the table under the plot states it. */
export interface SeriesStat {
  /** "X", "Y", "Magnitude" -- or nothing on a plot with one series, where the swatch is the legend. */
  label: string;
  color: string;
  ghost: string;
  max: string;
  min: string;
  /** The same two numbers from before the drag, while a comparison is shown. */
  before?: { max: string; min: string };
}

export function defaultSeriesSelection(count: number, analysis: string): SeriesSelection {
  const showComponents = count === 2 || (count === 3 && analysis === 'force');
  return showComponents ? { x: true, y: true, z: false } : { x: false, y: false, z: true };
}

@Component({
  selector: 'app-analysis-graph',
  templateUrl: './analysis-graph.component.html',
  styleUrls: ['./analysis-graph.component.scss'],
  animations: [
    trigger('showHide', [
      // ...
      state(
        'graphShown',
        style({
          opacity: 0,
        })
      ),
      state(
        'graphHidden',
        style({
          opacity: 1,
        })
      ),
      transition('* => *', [animate('0.1s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AnalysisApexChartComponent, MatIcon],
})
export class AnalysisGraphComponent
  implements OnInit, AfterViewInit, OnDestroy, OnChanges, DoCheck, ComparisonHolder
{
  private fb = inject(FormBuilder);
  private mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private samples = inject(AnalysisSampleService);
  private comparison = inject(AnalysisCompareService);

  public chartOptions: Partial<ChartOptions> = {
    annotations: {
      xaxis: [],
      points: [],
    },
    chart: {
      width: '100%',
      height: '190px',
      // Off, both the first draw and the tween between one dataset and the
      // next. A chart that morphs is drawing values the mechanism never had:
      // reverse a four-bar and the speed of its crank pin, which is constant,
      // swelled into a hump and settled back while Apex interpolated its way
      // from the old series to the new one. These graphs are also redrawn as
      // the playhead moves, so the tween is between the reader and the answer
      // rather more often than it is decoration.
      animations: {
        enabled: false,
      },
      type: 'line',
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: false, //Change this
        // offsetX: -30,
        // offsetY: -3,
      },
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: 'straight',
      width: 2.6,
    },
    colors: [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y, ANALYSIS_SERIES_COLORS.Z],
    tooltip: {
      // followCursor: false,
      // theme: 'dark',
      x: {
        formatter: function (val) {
          return 'T = ' + formatTimeLabel(Number(val)) + 's';
        },
      },
      marker: {
        // show: false,
      },
      y: {
        title: {
          // formatter: function () {
          //   return 'T = ';
          // },
        },
      },
    },
    grid: {
      position: 'back',
      show: true,
      // Faint, as the mock rules its plot: the lines are there to be read
      // against, not to be seen.
      borderColor: '#eceef5',
      strokeDashArray: 0,
      padding: {
        top: -14,
        bottom: -8,
      },
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    xaxis: {
      type: 'numeric',
      // Under the plot, where a time axis reads. It sat on top because the
      // legend used to want the room below it, and the legend has gone.
      position: 'bottom',
      offsetY: 0,
      // floating: true,
      // categories: categories,
      labels: {
        rotate: 0,
        rotateAlways: true,
        // Apex trims a label to its own tick slot, which is far narrower than
        // the space actually free at the two ends of this axis.
        trim: false,
        hideOverlappingLabels: false,
        // Clear of the plot's own frame, which they used to sit against.
        offsetY: 4,
        style: {
          fontSize: '11px',
          fontWeight: 400,
          colors: ['#5f6368', '#5f6368'],
        },
        formatter: function (val) {
          return formatAxisEnd(Number(val));
        },
      },
      tickAmount: 1,
      title: {
        text: 'Time (s)',
        style: {
          fontSize: '11px',
          fontWeight: 400,
          color: '#5f6368',
        },
        // Up beside the two ends rather than on a line of its own below them,
        // and centered between them: Apex centers it on the whole canvas, which
        // the y axis's own labels make eight pixels wider on the left.
        offsetY: -20,
        offsetX: -8,
      },
      // The plot's own frame is one line, up its left edge; the time axis
      // reads from its two end labels.
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      tooltip: {
        enabled: false,
      },
    },
    yaxis: {
      showForNullSeries: false,
      forceNiceScale: true,
      // The same size and weight as the time axis. Apex defaults the two axes
      // to 11px and the x axis was set to 12px on its own, so the two ends of
      // one plot were lettered differently.
      labels: {
        style: {
          fontSize: '11px',
          fontWeight: 400,
          colors: ['#5f6368'],
        },
        // One decimal, the minus the readings use.
        formatter: (value: number) => formatAxisEnd(value).replace('-', '\u2212'),
      },
      axisBorder: {
        show: true,
        color: '#c8ccd8',
      },
      min: FLOOR_OF,
      max: CEIL_OF,
      // No title. The quantity and its unit are the row this plot sits in,
      // and the table under it says the unit beside every number; a title up
      // the side spent forty pixels of a 400px panel saying it a third time.
      title: {
        text: '',
      },
      decimalsInFloat: 1,
    },
    legend: {
      show: false,
      position: 'top',
      floating: true,
      offsetY: -3,
      // customLegendItems: ['X', 'Y', 'Magnitude'],
      markers: {
        // customHTML: function () {
        //   return '<input type="checkbox" checked="true"> </input>';
        // },
      },
    },
  };

  @Input() analysis: string = '';
  @Input() analysisType: string = '';
  @Input() mechProp: string = '';
  @Input() mechPart: string = '';
  @Input() reactionLinkId: string = '';
  /** What the numbers are in, as the row above already spells it. */
  @Input() unit: string = '';

  /**
   * Which series to open on, when the card above already has an opinion.
   *
   * The legend is outside this component and survives the card being closed and
   * opened again, so it is the legend that remembers what the reader last chose
   * and hands it back here.
   */
  @Input() initialSeries?: SeriesSelection;

  /** What this graph is actually drawing, whenever that changes. */
  readonly shownSeriesChange = output<SeriesSelection>();

  //Get the child element in the template with "#chart"
  @ViewChild('chart', { static: false }) chart!: AnalysisApexChartComponent;

  animationTimestep: number = 0;
  numberOfSeries: number = 0;
  displayedSeries: ApexAxisChartSeries = [];
  displayedColors: string[] = [];

  get compactSingleSeries(): boolean {
    return this.numberOfSeries === 1;
  }

  /**
   * What this graph plots, in words.
   *
   * Its own controls are labeled "X" and "Y", which say nothing on their own:
   * a panel showing six graphs offers a dozen checkboxes all called the same
   * two things. The graph itself is a canvas with no text in it at all.
   */
  get graphLabel(): string {
    const part = this.mechPart ? ` of ${this.mechPart}` : '';
    return `${this.mechProp}${part}`;
  }

  /** The label, plus what a reader who cannot see the plot would ask next. */
  get graphSummary(): string {
    const names = this.displayedSeries
      .map((series) => series.name)
      // The internal names stay X/Y/Z so visibility and color keep working;
      // read out, "Z" promises an out-of-plane component a planar mechanism
      // does not have. A reader who cannot see the legend hears this instead
      // of it, so it has to say what the legend says.
      .map((name) => (name === 'Z' ? this.seriesLabel('z') : name))
      .filter((name): name is string => !!name);
    const plotted = names.length ? `, plotting ${names.join(', ')}` : '';
    const what = this.axisTitle ? `${this.axisTitle}, ` : '';
    return `Graph of ${what}${this.graphLabel} over one cycle${plotted}. The same numbers are available from Export Data in the top strip.`;
  }

  /** The quantity and its unit, as the axis used to be titled; the summary still says it. */
  axisTitle = '';

  /** The stroke the plot is drawn with, which the comparison overlay changes. */
  displayedStroke: ApexStroke = {};

  /**
   * The curves as they were when this gesture began, and the axis they were
   * read against.
   *
   * The whole point of unlocking a drag in an analysis mode: one series from
   * before the hand moved, one that follows it, and the difference between them
   * is the answer to "did that help". Taken once, at the moment a gesture is
   * confirmed as a drag, and dropped when the next one begins -- each drag
   * compares against the pose it started from.
   */
  private baseline?: { series: ApexAxisChartSeries; low: number; high: number };

  /** The baseline as the reader wants it shown: nothing while the switch is off. */
  private get comparedBaseline():
    | { series: ApexAxisChartSeries; low: number; high: number }
    | undefined {
    return this.comparison.compare ? this.baseline : undefined;
  }

  /** Whether the comparison switch was on when the plot was last drawn. */
  private compareShown = true;

  /** Whether a gesture is in flight right now, as this component last saw it. */
  private gestureLive = false;

  /** The same, for the template: what is hushed while the hand is down. */
  get gestureIsLive(): boolean {
    return this.gestureLive;
  }
  /** The solve this graph has already drawn, so a redraw happens once per solve. */
  private drawnSolve = -1;
  private liveRedraw?: number;

  /**
   * A drag turns the comparison on, and letting go turns it off.
   *
   * Read from the drag state and the solve counter rather than from a signal
   * the canvas emits: the canvas already knows what a gesture is, and a second
   * channel saying the same thing is a second channel that can disagree. This
   * is the idiom the tutorial card uses for the same reason -- every edit ends
   * in `updateMechanism`, which publishes on nothing that could be subscribed
   * to.
   */
  ngDoCheck(): void {
    const live = this.comparison.live;
    if (live && !this.gestureLive) {
      this.gestureLive = true;
    }
    // The switch in the panel's head. Off, the earlier curves and their numbers
    // leave the plot; on again, they come back as they were.
    if (this.comparison.compare !== this.compareShown) {
      this.compareShown = this.comparison.compare;
      this.applySeriesVisibility();
    }
    if (live && this.mechanismService.solveRevision !== this.drawnSolve) {
      this.drawnSolve = this.mechanismService.solveRevision;
      this.scheduleLiveRedraw();
    }
    if (!live && this.gestureLive) {
      this.gestureLive = false;
      this.settleAfterGesture();
    }
  }

  /**
   * Snapshot what is on the plot right now. Called by the comparison service
   * on the first travel of a drag, from the app shell's own check.
   *
   * Only where there is something to compare: a graph with no curve yet has no
   * honest "before" to show, and one opened mid-gesture never had one.
   */
  takeBaseline(): void {
    const series = this.chartOptions.series ?? [];
    if (!series.length) return;
    const values: number[] = [];
    series.forEach((one) =>
      one.data.forEach((point) => {
        const value = this.pointValue(point);
        if (value !== null) values.push(value);
      })
    );
    // The range the axis was *actually showing*, raw. Trimmed here, the plot
    // changed the moment a drag began: a force curve peaking at 180 N was
    // rescaled to a 60 N ceiling and its own spike clipped, so the "before"
    // curve was not what the reader had been looking at a moment earlier --
    // which is the one thing this overlay promises. Nothing needs trimming
    // here anyway: this is a plot the reader was already reading happily.
    const span = values.length
      ? { low: Math.min(...values), high: Math.max(...values) }
      : { low: 0, high: 0 };
    this.baseline = {
      series: series.map((one) => ({
        ...one,
        name: `${one.name}${BEFORE_SUFFIX}`,
        // Copied, not referenced: the live series is rebuilt in place on every
        // pointer move, and a baseline pointing at it would follow the hand.
        data: (one.data as unknown[]).slice(),
      })) as ApexAxisChartSeries,
      low: span.low,
      high: span.high,
    };
  }

  /**
   * Forget the earlier curves. Called on undo and redo: a history step is not
   * a drag, and the curve it restores may be the very one the baseline was
   * taken from -- two identical lines is confusion rather than comparison.
   */
  dropBaseline(): void {
    if (!this.baseline) return;
    this.baseline = undefined;
    this.applySeriesVisibility();
    this.updateYAxis();
  }

  /**
   * One redraw per animation frame, trailing edge.
   *
   * A pointer can emit moves faster than a chart can be rebuilt, and every one
   * of them has already cost a full cycle solve. The last move always lands,
   * which is the one that matters.
   */
  private scheduleLiveRedraw(): void {
    if (this.liveRedraw !== undefined) return;
    this.liveRedraw = requestAnimationFrame(() => {
      this.liveRedraw = undefined;
      if (this.destroyed) return;
      this.updateChartData();
    });
  }

  /** The gesture is over: the curve that was provisional is now what is. */
  private settleAfterGesture(): void {
    if (this.liveRedraw !== undefined) {
      cancelAnimationFrame(this.liveRedraw);
      this.liveRedraw = undefined;
    }
    this.updateChartData();
  }

  /** Whether there is a curve from before the drag on this plot. */
  get hasBaseline(): boolean {
    return !!this.baseline;
  }

  private statsCache?: {
    series: ApexAxisChartSeries;
    held: unknown;
    stats: SeriesStat[];
  };

  /**
   * What each plotted series reaches, and what it reached before the drag.
   *
   * The workflow this whole overlay exists for is "move the acceleration
   * peak", so the peak is the number to say -- and the trough, because a peak
   * a reader wants smaller may be the negative one. The true reach of each
   * curve, not the range the axis is drawn to: the axis is the thing that is
   * allowed to trim, and a curve leaving the top of the plot is how it says so.
   *
   * Cached on the series the plot is showing: the template asks on every pass,
   * and the answer changes only when the plot does.
   */
  get stats(): SeriesStat[] {
    const held = this.comparedBaseline;
    if (this.statsCache?.series === this.displayedSeries && this.statsCache.held === held) {
      return this.statsCache.stats;
    }
    const live = this.displayedSeries.filter((one) => !BEFORE.test(one.name ?? ''));
    const reach = (values: number[]) =>
      values.length
        ? { max: formatReading(Math.max(...values)), min: formatReading(Math.min(...values)) }
        : undefined;
    const stats = live.map((one) => {
      const key = (one.name === 'Z' ? 'z' : one.name === 'Y' ? 'y' : 'x') as 'x' | 'y' | 'z';
      const earlier = held?.series.find((was) => was.name === `${one.name}${BEFORE_SUFFIX}`);
      const now = reach(this.valuesOf([one]));
      return {
        // One series needs no name: the swatch is the whole legend.
        label: live.length > 1 ? this.seriesLabel(key) : '',
        color: this.colorForSeries(one.name),
        ghost: ghostOf(this.colorForSeries(one.name)),
        max: now?.max ?? '\u2014',
        min: now?.min ?? '\u2014',
        before: earlier ? reach(this.valuesOf([earlier])) : undefined,
      };
    });
    this.statsCache = { series: this.displayedSeries, held, stats };
    return stats;
  }

  noDataSelected: boolean = false;
  analysisDiagnostic: string | null = null;
  /**
   * A hole in an otherwise good force series: how many positions have no
   * solution, and where the first one is, so Show Them can take the reader
   * there. Those are toggle positions — reactions grow without bound as the
   * mechanism approaches them — and standing the mechanism at one teaches
   * more than any sentence about it.
   */
  analysisGap: { failed: number; total: number; firstSeconds: number; mechIndex: number } | null =
    null;

  /**
   * One hole is "the position"; several are shown by naming the one the
   * button actually goes to — the first — so the jump has no surprise in it.
   */
  get gapShowLabel(): string {
    const gap = this.analysisGap;
    if (!gap) return '';
    return gap.failed === 1
      ? 'Show Position'
      : `Show First (${formatTimeLabel(gap.firstSeconds)} s)`;
  }

  showGapPosition(): void {
    if (!this.analysisGap) return;
    const service = this.mechanismService;
    // A seek keeps the playback state, so pressed mid-animation it would sail
    // straight past the pose it names. Standing at the pose IS the point.
    if (service.isPlaying) {
      service.animate(service.mechanismTimeStep, false);
    }
    if (service.isMechanismPlaying(this.analysisGap.mechIndex)) {
      service.toggleMechanismPlaying(this.analysisGap.mechIndex);
    }
    service.seekMechanism(this.analysisGap.mechIndex, this.analysisGap.firstSeconds);
  }

  private subscriptions = new Subscription();
  private chartSyncTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  seriesCheckboxForm = this.fb.group(
    {
      x: [false],
      y: [false],
      z: [false],
    },
    { updateOn: 'change' }
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes || !this.analysis || !this.mechProp || !this.mechPart) return;
    // A different part, or a different quantity, is a different question -- and
    // a "before" curve from the last one would be a comparison between two
    // things that were never compared.
    if (Object.keys(changes).some((name) => name !== 'initialSeries')) {
      this.baseline = undefined;
    }
    // The legend handing back what it remembers is not a change to what is
    // plotted, and rebuilding the chart for it would be a rebuild per click.
    if (Object.keys(changes).every((name) => name === 'initialSeries')) return;
    this.updateChartData();
  }

  updateChartData() {
    if (!this.analysis || !this.mechProp || !this.mechPart) return;
    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);
    this.scheduleChartSync(false);
  }

  ngAfterViewInit(): void {
    this.scheduleChartSync(true);
  }

  ngOnInit(): void {
    //Param 1: analysis: "force","stress","kinematic"

    //Param 2: analysisType: IF analysis == force: "statics","dynamic"
    //Param 2: analysisType: IF analysis == kinematic: "loop","ic"

    //Param 3: mechProp: IF analysis == force: "Input Torque","Joint Forces"
    //Param 3: mechProp: IF analysis == kinemaics: "Linear Joint Pos","Linear Joint Vel","Linear Joint Acc",
    //"Linear Link's CoM Pos","Linear Link's CoM Vel","Linear Link's CoM Acc",
    //"Angular Link Pos","Angular Link Vel",Angular Link Acc"

    //Param 4: mechPart: If Joint 'a','b','c'... If Link 'ab','bc','cd'...
    this.determineChart(this.analysis, this.analysisType, this.mechProp, this.mechPart);
    this.comparison.register(this);

    this.subscriptions.add(
      this.seriesCheckboxForm.valueChanges.subscribe(() => this.applySeriesVisibility())
    );
    this.subscriptions.add(
      this.settingsService.angleUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.settingsService.lengthUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.settingsService.forceUnit.pipe(skip(1)).subscribe(() => this.updateChartData())
    );
    this.subscriptions.add(
      this.mechanismService.onMechUpdateState.subscribe((data) => {
        // State 1 -- "being dragged" -- used to raise a "Graph paused while
        // dragging" placeholder in place of the chart. It could only ever fire
        // in Edit, where these graphs are not on screen, and now that a drag in
        // an analysis mode is an edit it would blank the very curve the drag is
        // about. The graph is about to be told the answer; the old curve is a
        // better thing to be looking at in the meantime than a sentence.
        if (data === 2 && this.mechanismService.oneValidMechanismExists()) {
          this.updateChartData();
        }
      })
    );
    this.subscriptions.add(
      // The broadcast says *something* moved, not which; this graph asks its
      // own machine where it is.
      this.mechanismService.onMechPositionChange.subscribe(() => this.showAnnotations())
    );
  }

  private scheduleChartSync(resetSelection: boolean): void {
    if (this.chartSyncTimer) clearTimeout(this.chartSyncTimer);
    this.chartSyncTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (resetSelection) {
        this.seriesCheckboxForm.patchValue(
          this.initialSeries ?? defaultSeriesSelection(this.numberOfSeries, this.analysis),
          { emitEvent: false }
        );
      }
      this.applySeriesVisibility();
      this.updateYAxis();
    }, 1);
  }

  /**
   * Which series this graph has, in the order it plots them.
   *
   * Two means X and Y; three means X, Y and their magnitude, force analysis
   * included -- the plot draws the magnitude first so the components sit over
   * it rather than under it.
   */
  get seriesKeys(): ('x' | 'y' | 'z')[] {
    if (this.numberOfSeries === 3) return ['z', 'x', 'y'];
    if (this.numberOfSeries === 2) return ['x', 'y'];
    return [];
  }

  seriesLabel(key: 'x' | 'y' | 'z'): string {
    // The third series is always the magnitude of the other two -- a planar
    // mechanism has no third component, and force analysis returns hypot(x, y)
    // here exactly as the kinematic series do. It was labeled "Z" in force
    // mode, which promised an out-of-plane reaction that does not exist.
    return key === 'z' ? 'Magnitude' : key.toUpperCase();
  }

  isSeriesShown(key: 'x' | 'y' | 'z'): boolean {
    return !!this.seriesCheckboxForm.value[key];
  }

  /** The legend is the switch. Showing none of them is allowed; the graph says so. */
  toggleSeries(key: 'x' | 'y' | 'z'): void {
    this.seriesCheckboxForm.patchValue({ [key]: !this.isSeriesShown(key) });
  }

  /** Draw exactly these: the row's Magnitude / X & Y switch, applied. */
  showSeries(selection: SeriesSelection): void {
    this.seriesCheckboxForm.patchValue({ ...selection });
  }

  colorForSeriesKey(key: 'x' | 'y' | 'z'): string {
    return this.colorForSeries(this.seriesLabel(key) === 'Magnitude' ? 'Z' : key.toUpperCase());
  }

  applySeriesVisibility(): void {
    const data = this.seriesCheckboxForm.getRawValue();
    const selectedNames = new Set<string>();
    if (data.x) selectedNames.add('X');
    if (data.y) selectedNames.add('Y');
    if (data.z) selectedNames.add('Z');

    const live = (this.chartOptions.series ?? []).filter((series) =>
      selectedNames.has(series.name ?? '')
    );
    // The curves as they were when the gesture began, under the ones moving
    // under the reader's hand. Baseline first, so the live curve is drawn over
    // it rather than under it -- what is being compared *to* belongs behind.
    // Same names with a suffix, so the tooltip says which is which; the
    // visibility toggles are the live names, so hiding Y hides both Ys.
    const before = (this.comparedBaseline?.series ?? []).filter((series) =>
      selectedNames.has(BEFORE.test(series.name ?? '') ? series.name!.replace(BEFORE, '') : '')
    );
    this.displayedSeries = [...before, ...live];
    this.displayedColors = this.displayedSeries.map((series) =>
      BEFORE.test(series.name ?? '')
        ? ghostOf(this.colorForSeries(series.name!.replace(BEFORE, '')))
        : this.colorForSeries(series.name)
    );
    // The earlier curve is the marked one: thinner, dashed, in its own ink
    // faded, under a live curve drawn exactly as it always is. The live curve
    // used to be dashed while the hand was down and settle to solid on release,
    // which was two encodings changing at the one moment the reader finally had
    // a still frame to read; now nothing on the plot changes when they let go.
    this.displayedStroke = {
      ...this.chartOptions.stroke,
      width: this.displayedSeries.map((series) => (BEFORE.test(series.name ?? '') ? 1.8 : 2.6)),
      dashArray: this.displayedSeries.map((series) => (BEFORE.test(series.name ?? '') ? 5 : 0)),
    };
    this.noDataSelected = this.displayedSeries.length === 0;
    this.applyYAxisScale();
    this.shownSeriesChange.emit({ x: !!data.x, y: !!data.y, z: !!data.z });
    // Into the options even before there is a chart to draw on: the first
    // render reads them from there.
    this.showAnnotations();
  }

  /**
   * Where the y axis starts, stops, and puts its lines.
   *
   * Apex picks its own round numbers, and for a series running from -1.1 to 2.0
   * it drew lines at 0.3, 1.0 and 1.7 -- so a graph that crosses zero, which is
   * usually the fact the reader came for, had nothing marking where it does.
   * Every tick here is a whole number of one step away from a limit that is
   * itself a whole number of steps, so zero is a line whenever it is in range.
   */
  /** Every finite number in a set of series, in one array. */
  private valuesOf(series: ApexAxisChartSeries): number[] {
    const values: number[] = [];
    series.forEach((one) =>
      one.data.forEach((point) => {
        const value = this.pointValue(point);
        if (value !== null) values.push(value);
      })
    );
    return values;
  }

  private applyYAxisScale(): void {
    const values = this.valuesOf(this.displayedSeries);
    const yaxis = this.chartOptions.yaxis!;
    // With a comparison on the plot the axis has to hold both curves, and it
    // has to hold *still*: refitted to the live values on every pointer move it
    // swims under the very curve the reader is watching, and every frame looks
    // the same height as the last. Frozen to the baseline and widened only when
    // the live curve leaves it -- a clipped peak would lie, and a peak that
    // stops growing because the axis grew with it says nothing.
    // The baseline itself, not the baseline as shown: the switch hides the
    // earlier curves, and the axis must not jump when it is flipped -- so the
    // range they were read against stays in force, and the live curve stays
    // trimmed, until the comparison is actually gone.
    const held = this.baseline;
    // The live values only. The baseline contributes the range it was drawn to,
    // untouched; what can contain a singularity is the curve the drag is making
    // right now, and that is the only half worth trimming. An ordinary graph
    // with no comparison keeps the range it has always had -- a spike in a
    // drawing somebody built deliberately is the answer rather than the noise.
    const liveValues = this.valuesOf(
      this.displayedSeries.filter((one) => !BEFORE.test(one.name ?? ''))
    );
    const range = held
      ? liveValues.length
        ? readableRange(liveValues)
        : { low: 0, high: 0 }
      : values.length
        ? { low: Math.min(...values), high: Math.max(...values) }
        : { low: 0, high: 0 };
    const low = range.low;
    const high = range.high;
    if (held && values.length) {
      // A *running* range, not this frame's. Recomputed from the live values
      // each frame it shrank as readily as it grew, so the axis swam: a drag
      // through a toggle sent it to 30,000 and the next frame brought it back
      // to 800, and every frame looked the same height as the last. Widening
      // only, the curve moves against something that is holding still.
      held.low = Math.min(held.low, low);
      held.high = Math.max(held.high, high);
    }
    const scale = values.length
      ? held
        ? niceAxisScale(Math.min(low, held.low), Math.max(high, held.high))
        : niceAxisScale(low, high)
      : undefined;
    this.chartOptions = {
      ...this.chartOptions,
      yaxis: scale
        ? { ...yaxis, min: scale.min, max: scale.max, tickAmount: scale.tickAmount }
        : { ...yaxis, min: FLOOR_OF, max: CEIL_OF, tickAmount: undefined },
    };
  }

  private updateYAxis(): void {
    if (!this.chart) return;
    const chartInput = (this.chart as unknown as { chart?: () => unknown }).chart;
    if (typeof chartInput === 'function' && !chartInput()) return;
    this.chart.updateOptions({ yaxis: this.chartOptions.yaxis }, false, true);
  }

  /**
   * Where this machine is in its own cycle, as a sample of its own solve.
   *
   * Not the shared clock. Each machine has a clock of its own while they are
   * being controlled apart, and a graph of a paused machine was drawing its
   * playhead at the running machine's time -- a line sweeping across a plot of
   * something standing still on the grid. Machines also have different numbers
   * of samples, so the shared index does not even mean the same moment.
   */
  private ownSample(): number {
    const mechanism = this.mechanismService.mechanismForId(this.mechPart);
    if (!mechanism) return 0;
    const at = this.mechanismService.mechanisms.indexOf(mechanism);
    const step =
      at === -1
        ? this.mechanismService.mechanismTimeStep
        : this.mechanismService.currentSampleOf(at);
    return Math.max(Math.min(step, mechanism.joints.length - 1), 0);
  }

  /**
   * The playhead and its markers: the zero line, the line at the time on
   * screen, and a dot where each curve crosses it.
   *
   * Written into the chart's options *and* drawn onto the chart. Drawn, so a
   * playhead moving under playback costs one cheap call rather than a redraw
   * per frame; and written into the options, because a redraw for any other
   * reason -- the series switched, the axis refitted, the panel settling its
   * width -- starts from the options and would otherwise come up without it.
   * A row that has just opened redraws three times in a few milliseconds, and
   * chasing each one with a fresh drawing lost the race every time.
   */
  private showAnnotations() {
    const held = this.chartOptions.annotations!;
    held.xaxis = [];
    held.yaxis = [];
    held.points = [];
    // Nothing while the hand is down. The playhead and its point markers are
    // recomputed on every move, and mid-gesture they are three things flickering
    // between the reader and the one thing they are looking at.
    if (this.gestureLive) {
      this.chart?.clearAnnotations();
      return;
    }
    // Zero, a shade darker than the other gridlines: where a curve crosses it
    // is usually the fact the reader came for.
    held.yaxis.push({ y: 0, borderColor: '#c8ccd8', strokeDashArray: 0 });
    const timeIndex = this.ownSample();
    const timeSeconds =
      this.mechanismService.mechanismForId(this.mechPart)?.timeNum[timeIndex] ?? timeIndex;
    const anyShown =
      this.seriesCheckboxForm.value.x ||
      this.seriesCheckboxForm.value.y ||
      this.seriesCheckboxForm.value.z;
    if (timeIndex > 0 && anyShown) {
      // A plain line. The time it stands at is the panel's subtitle, and what
      // each curve reads there is the row's own number, so a box on the plot
      // said both a second time.
      held.xaxis.push({ x: timeSeconds, borderColor: '#2c2c2c', strokeDashArray: 0 });
      this.markCurves(timeIndex, timeSeconds);
    }
    if (!this.chart) return;
    this.chart.clearAnnotations();
    held.yaxis.forEach((one) => this.chart.addYaxisAnnotation(one, false));
    held.xaxis.forEach((one) => this.chart.addXaxisAnnotation(one, false));
    held.points.forEach((one) => this.chart.addPointAnnotation(one, false));
  }

  /** A dot on each shown curve at the playhead, in the curve's own ink. */
  private markCurves(timeIndex: number, timeSeconds: number): void {

    const xSeries = this.chartOptions.series?.find((s) => s.name === 'X');
    const ySeries = this.chartOptions.series?.find((s) => s.name === 'Y');
    const zSeries = this.chartOptions.series?.find((s) => s.name === 'Z');

    if (this.seriesCheckboxForm.value.x && xSeries) {
      this.addPointAnnotation(xSeries, timeIndex, timeSeconds, ANALYSIS_SERIES_COLORS.X);
    }
    if (this.seriesCheckboxForm.value.y && ySeries) {
      this.addPointAnnotation(ySeries, timeIndex, timeSeconds, ANALYSIS_SERIES_COLORS.Y);
    }
    if (this.seriesCheckboxForm.value.z && zSeries) {
      this.addPointAnnotation(zSeries, timeIndex, timeSeconds, this.colorForSeries('Z'));
    }
  }

  private colorForSeries(name: string | undefined): string {
    if (name === 'Y') return ANALYSIS_SERIES_COLORS.Y;
    if (name === 'Z' && this.numberOfSeries === 3) return ANALYSIS_SERIES_COLORS.Z;
    return ANALYSIS_SERIES_COLORS.X;
  }

  private addPointAnnotation(
    series: ApexAxisChartSeries[number],
    timeIndex: number,
    timeSeconds: number,
    color: string
  ): void {
    const value = this.pointValue(series.data[timeIndex]);
    if (value === null) return;
    this.chartOptions.annotations!.points!.push({
      x: timeSeconds,
      y: value,
      // A dot in the series' own ink with a white rim, and no label: the
      // number it marks is the row's own value.
      marker: {
        size: 3.4,
        fillColor: color,
        strokeColor: '#ffffff',
        strokeWidth: 1.6,
        shape: 'circle',
      },
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.comparison.unregister(this);
    if (this.chartSyncTimer) clearTimeout(this.chartSyncTimer);
    this.subscriptions.unsubscribe();
  }

  /**
   * Put an angular series into the unit the axis beside it is lettered in.
   *
   * In place, and to the four decimals this has always shown: the conversion
   * itself now lives with the model, so the file the export writes and the
   * curve drawn here cannot end up in different units.
   */
  private scaleAngles(series: number[], mechProp: string): void {
    const scale = angularScale(mechProp, this.settingsService.angleUnit.getValue());
    if (scale === 1) return;
    for (let i = 0; i < series.length; i++) {
      series[i] = Number((series[i] * scale).toFixed(4));
    }
  }

  private pointValue(point: unknown): number | null {
    if (typeof point === 'number') return Number.isFinite(point) ? point : null;
    if (point && typeof point === 'object' && 'y' in point) {
      const value = (point as { y: unknown }).y;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return null;
  }

  /**
   * The machine that owns the part being graphed.
   *
   * A drawing holds several independent mechanisms, each with its own samples
   * and its own clock, so the series, the time axis and the force analysis all
   * have to come from this part's machine rather than from whichever one was
   * built first. A part in a floating chain belongs to none, and graphs nothing.
   */
  determineChart(analysis: string, analysisType: string, mechProp: string, mechPart: string) {
    try {
      this.buildChart(analysis, analysisType, mechProp, mechPart);
    } catch (error) {
      // A solver that throws leaves `chartOptions.series` unassigned, and the
      // template read that as an empty selection -- "Please select at least
      // one data series", above no checkboxes to select. That blames the user
      // for our failure. Say the analysis failed, and keep the stack in the
      // console for whoever has to fix it.
      console.error('Analysis failed for', analysis, mechProp, mechPart, error);
      this.numberOfSeries = 0;
      this.displayedSeries = [];
      this.displayedColors = [];
      this.analysisDiagnostic =
        'This mechanism could not be analyzed, so this graph is unavailable.';
    }
  }

  private buildChart(
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string
  ): void {
    const mechanism = this.mechanismService.mechanismForId(mechPart);
    let yAxisTitle = '';
    let datum: number[][] = [];
    const seriesData = [];
    // One spelling of a unit, from the service every panel's fields use.
    const lengthUnit = this.nup.unitLabel(this.settingsService.lengthUnit.value);
    const angleUnit = this.nup.unitLabel(this.settingsService.angleUnit.value);
    const posLinUnit = `(${lengthUnit})`;
    const velLinUnit = `(${lengthUnit}/s)`;
    const accLinUnit = `(${lengthUnit}/s²)`;
    const posAngUnit = `(${angleUnit})`;
    const velAngUnit = `(${angleUnit}/s)`;
    const accAngUnit = `(${angleUnit}/s²)`;
    this.analysisDiagnostic = null;
    // Only the force branch writes the gap, so a kinematic graph would
    // otherwise inherit the banner from the force graph shown before it.
    this.analysisGap = null;
    switch (analysis) {
      case 'force':
        switch (mechProp) {
          case 'Input Torque':
          case 'Input Effort': {
            const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
            const effortKind = mechanism
              ?.getForceAnalysis(mode)
              .frames.find((frame) => frame.status === 'ok' && frame.inputEffort)
              ?.inputEffort?.kind;
            yAxisTitle =
              effortKind === 'force'
                ? this.settingsService.forceUnit.value === ForceUnit.LBF
                  ? 'Force (lbf)'
                  : 'Force (N)'
                : this.settingsService.forceUnit.value === ForceUnit.LBF
                  ? 'Torque (lbf·in)'
                  : 'Torque (N·m)';
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'Z', type: 'line', data: datum[0] });
            this.numberOfSeries = 1;
            break;
          }
          case 'Joint Forces':
            yAxisTitle =
              this.settingsService.forceUnit.value === ForceUnit.LBF ? 'Force (lbf)' : 'Force (N)';
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
        }
        break;
      case 'stress':
        break;
      case 'kinematic':
        switch (mechProp) {
          case 'Linear Joint Pos':
            yAxisTitle = 'Position ' + posLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case 'Linear Joint Vel':
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Linear Joint Acc':
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Pos":
            yAxisTitle = 'Position (CoM) ' + posLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            this.numberOfSeries = 2;
            break;
          case "Linear Link's CoM Vel":
            yAxisTitle = 'Velocity ' + velLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case "Linear Link's CoM Acc":
            yAxisTitle = 'Acceleration ' + accLinUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            seriesData.push({ name: 'X', type: 'line', data: datum[0] });
            seriesData.push({ name: 'Y', type: 'line', data: datum[1] });
            seriesData.push({ name: 'Z', type: 'line', data: datum[2] });
            this.numberOfSeries = 3;
            break;
          case 'Angular Link Pos':
            yAxisTitle = 'Position ' + posAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Pos');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Vel':
            yAxisTitle = 'Velocity ' + velAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Vel');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
          case 'Angular Link Acc':
            yAxisTitle = 'Acceleration ' + accAngUnit;
            [datum] = this.determineAnalysis(analysis, analysisType, mechProp, mechPart);
            var series: number[] = datum[0];
            this.scaleAngles(series, 'Angular Link Acc');
            seriesData.push({ name: 'Z', type: 'line', data: series });
            this.numberOfSeries = 1;
            break;
        }
        break;
      default:
        return;
    }

    // ApexCharts/Safari can fail the entire chart when one exact toggle pose
    // contributes NaN or Infinity. A null point creates an intentional gap at
    // that singular timestep while preserving the rest of the series.
    const times = mechanism?.timeNum ?? [];
    // Turned back onto the anchor, where a gesture at a displaced pose has
    // turned the cycle away from it: mid-drag the provisional cycle starts at
    // the pose under the hand, so plotted raw the live curve is the baseline
    // rotated by wherever the reader happened to pause. Half a sample of phase
    // is invisible at 360 of them, so the blend is not worth carrying.
    const turn = mechanism
      ? this.mechanismService.phaseOffsetOf(this.mechanismService.mechanisms.indexOf(mechanism))
      : 0;
    const chartSeries = seriesData.map((series) => ({
      ...series,
      data: series.data.map((_, index) => {
        const value = series.data[(index + turn) % series.data.length];
        return { x: times[index] ?? index, y: Number.isFinite(value) ? value : null };
      }),
    })) as ApexAxisChartSeries;
    this.axisTitle = yAxisTitle;
    this.chartOptions = {
      ...this.chartOptions,
      series: chartSeries,
    };
    this.displayedSeries = chartSeries;
    this.displayedColors = chartSeries.map((series) => this.colorForSeries(series.name));
  }

  determineAnalysis(
    analysis: string,
    analysisType: string,
    mechProp: string,
    mechPart: string
  ): [[number[], number[], number[]], string[]] {
    const datum_X: number[] = [];
    const datum_Y: number[] = [];
    const datum_Z: number[] = [];
    const categories: string[] = [];
    const mechanism = this.mechanismService.mechanismForId(mechPart);
    // A loose joint, or a chain that never reaches ground, is in no mechanism
    // and so has nothing solved to plot.
    if (!mechanism) return [[datum_X, datum_Y, datum_Z], categories];

    const series = [datum_X, datum_Y, datum_Z];
    /** One solved sample, spread across the series in the order plotted. */
    const collect = (index: number): void => {
      this.samples
        .sampleAt(mechanism, index, analysis, analysisType, mechProp, mechPart, this.reactionLinkId)
        .forEach((value, position) => series[position].push(value));
    };

    if (analysis === 'force') {
      const mode: ForceAnalysisMode = analysisType === 'dynamic' ? 'dynamic' : 'static';
      const result = mechanism.getForceAnalysis(mode);
      result.frames.forEach((frame, index) => {
        categories.push(frame.timeSeconds.toString());
        collect(index);
      });

      const hasFiniteData = [datum_X, datum_Y, datum_Z].some((values) =>
        values.some(Number.isFinite)
      );
      // A hole in an otherwise good series is worth a sentence of its own: a
      // silent gap at a toggle position reads as a plotting bug, when it is
      // the most physical thing on the chart.
      const failed = result.frames.length - result.successfulFrames;
      const firstFailed = result.frames.find((frame) => frame.status !== 'ok');
      this.analysisGap =
        hasFiniteData && failed > 0 && firstFailed
          ? {
              failed,
              total: result.frames.length,
              firstSeconds: firstFailed.timeSeconds,
              mechIndex: Math.max(this.mechanismService.mechanisms.indexOf(mechanism), 0),
            }
          : null;
      this.analysisDiagnostic = hasFiniteData
        ? null
        : (result.diagnostic ??
          (mechProp === 'Joint Forces'
            ? 'Only one part meets this joint, so there is no force to graph here.'
            : 'Input effort is unavailable for this mechanism.'));
      return [[datum_X, datum_Y, datum_Z], categories];
    }

    // The solver keeps its answers in statics, and starts each graph from a
    // clean set of them rather than from the last mechanism graphed.
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    mechanism.joints.forEach((_, index) => {
      categories.push(mechanism.timeNum[index]?.toString() ?? index.toString());
      collect(index);
    });
    return [[datum_X, datum_Y, datum_Z], categories];
  }
}
