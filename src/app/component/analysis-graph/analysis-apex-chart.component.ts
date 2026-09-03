import {
  AfterViewInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  input,
  viewChild,
} from '@angular/core';
import ApexCharts, {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';

declare global {
  interface Window {
    ApexCharts?: typeof ApexCharts;
  }
}

/** A curve drawn over the plot in data coordinates, while the chart itself stands still. */
export interface LiveCurve {
  name: string;
  color: string;
  width: number;
  points: { x: number; y: number | null }[];
}

/** The plot's frame, read off the chart that is standing: where data lands in pixels. */
interface PlotFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  svgWidth: number;
  svgHeight: number;
}

/**
 * Small Angular bridge for the ApexCharts bundle loaded by angular.json.
 *
 * ng-apexcharts defers `apexcharts/client` until a chart first appears. Safari can retain that
 * deferred Vite URL across a development rebuild and then receive a 504 "Outdated Optimize Dep",
 * leaving every graph blank. Using the eagerly loaded browser bundle removes that stale request.
 */
@Component({
  selector: 'app-analysis-apex-chart',
  template: `
    @if (renderError) {
      <div class="chart-render-error" role="status">{{ renderError }}</div>
    }
    <div #chartHost></div>
    @if (livePaths.length) {
      <svg
        class="liveOverlay"
        [attr.width]="overlay.svgWidth"
        [attr.height]="overlay.svgHeight"
        aria-hidden="true"
      >
        <defs>
          <clipPath [attr.id]="clipId">
            <rect
              [attr.x]="overlay.left"
              [attr.y]="overlay.top"
              [attr.width]="overlay.width"
              [attr.height]="overlay.height"
            />
          </clipPath>
        </defs>
        <g [attr.clip-path]="'url(#' + clipId + ')'" fill="none" stroke-linejoin="round">
          @for (path of livePaths; track $index) {
            <path
              [attr.d]="path.d"
              [attr.data-series]="path.name"
              [attr.stroke]="path.color"
              [attr.stroke-width]="path.width"
            />
          }
        </g>
      </svg>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }
      .liveOverlay {
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisApexChartComponent implements OnChanges, AfterViewInit, OnDestroy {
  private zone = inject(NgZone);
  private changeDetector = inject(ChangeDetectorRef);

  readonly annotations = input<ApexAnnotations>();
  readonly chart = input<ApexChart>();
  readonly colors = input<string[]>();
  readonly dataLabels = input<ApexDataLabels>();
  readonly grid = input<ApexGrid>();
  readonly legend = input<ApexLegend>();
  readonly markers = input<ApexMarkers>();
  readonly series = input<ApexAxisChartSeries>([]);
  readonly stroke = input<ApexStroke>();
  readonly tooltip = input<ApexTooltip>();
  readonly xaxis = input<ApexXAxis>();
  readonly yaxis = input<ApexYAxis>();

  readonly chartHost = viewChild.required<ElementRef<HTMLElement>>('chartHost');

  renderError: string | null = null;
  chartInstance?: ApexCharts;

  /**
   * The curves following a drag, drawn here rather than by the chart.
   *
   * ApexCharts has one way to take new data, and it is to tear the plot down
   * and build it again: axes measured, labels laid out, every element made
   * anew, about eight milliseconds and seven thousand DOM changes per row per
   * pointer move. During a gesture the axes do not move -- the scale is held
   * for exactly that reason -- so the only thing that needs redrawing is the
   * curve, and a path over the standing plot is that. The chart is handed the
   * final series when the hand lets go.
   */
  livePaths: { name: string; d: string; color: string; width: number }[] = [];
  overlay: PlotFrame = {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    minX: 0,
    maxX: 1,
    minY: 0,
    maxY: 1,
    svgWidth: 0,
    svgHeight: 0,
  };
  readonly clipId = `liveClip${Math.random().toString(36).slice(2, 9)}`;
  private clearOverlayAfterRender = false;

  /**
   * Draw these curves over the plot, or clear them with `null`.
   *
   * Clearing waits for the chart's next render to finish: on release the
   * chart is handed the final series, and the overlay stays up until those
   * are actually drawn, so there is never a frame with no live curve on it.
   */
  showLive(curves: LiveCurve[] | null): void {
    const frame = curves ? this.plotFrame() : null;
    if (!curves || !frame) {
      this.clearOverlayAfterRender = this.livePaths.length > 0;
      return;
    }
    this.clearOverlayAfterRender = false;
    this.overlay = frame;
    const spanX = frame.maxX - frame.minX || 1;
    const spanY = frame.maxY - frame.minY || 1;
    this.livePaths = curves.map((curve) => {
      let d = '';
      let pen = false;
      for (const point of curve.points) {
        if (point.y === null || !Number.isFinite(point.y) || !Number.isFinite(point.x)) {
          pen = false;
          continue;
        }
        const px = frame.left + ((point.x - frame.minX) / spanX) * frame.width;
        const py = frame.top + ((frame.maxY - point.y) / spanY) * frame.height;
        d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
        pen = true;
      }
      return { name: curve.name, d, color: curve.color, width: curve.width };
    });
    this.changeDetector.markForCheck();
  }

  private plotFrame(): PlotFrame | null {
    const globals = (this.chartInstance as unknown as { w?: { globals?: Record<string, number> } })
      ?.w?.globals;
    if (!globals || !(globals['gridWidth'] > 0) || !(globals['gridHeight'] > 0)) return null;
    return {
      left: globals['translateX'],
      top: globals['translateY'],
      width: globals['gridWidth'],
      height: globals['gridHeight'],
      minX: globals['minX'],
      maxX: globals['maxX'],
      minY: globals['minY'],
      maxY: globals['maxY'],
      svgWidth: globals['svgWidth'],
      svgHeight: globals['svgHeight'],
    };
  }

  private viewInitialized = false;
  private destroyed = false;
  private updateGeneration = 0;
  /**
   * One redraw at a time. Apex's update is asynchronous, and two started a
   * few milliseconds apart -- which a drag produces every frame -- finish in
   * either order and leave whichever finished last on screen. Under a drag
   * that was the previous frame's curves over this frame's axis, or a live
   * curve with no earlier one under it. A redraw asked for while one is in
   * flight runs when it is done, from the options current *then*.
   */
  private updating = false;
  private updateWanted = false;

  ngOnChanges(_changes: SimpleChanges): void {
    this.scheduleUpdate();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.scheduleUpdate();
    this.watchWidth();
    this.watchLayering();
  }

  private layerWatch?: MutationObserver;

  /**
   * Keep the axis annotations behind the curves whenever Apex puts them back
   * in front, which it does on every draw it makes -- and some of those it
   * makes after the promise for the draw has resolved. Watching the DOM is
   * the one vantage point that sees all of them. The move itself is a no-op
   * once the order is right, so the observer does not chase its own tail.
   */
  private watchLayering(): void {
    if (typeof MutationObserver === 'undefined') return;
    this.layerWatch = new MutationObserver(() => this.layerAnnotations());
    this.layerWatch.observe(this.chartHost().nativeElement, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.updateGeneration++;
    this.widthWatch?.disconnect();
    this.layerWatch?.disconnect();
    this.chartInstance?.destroy();
    this.chartInstance = undefined;
  }

  private widthWatch?: ResizeObserver;
  private renderedWidth = 0;

  /**
   * Re-lay the chart out when its container's width changes under it.
   *
   * Apex measures the host once, at construction, and keeps that width. A chart
   * built while the panel was still settling -- which is every chart on the
   * first render of a panel -- stayed at the width it was built for, so the
   * label at the far end of the axis sat past the card's edge and was clipped.
   * Toggling the card rebuilt the chart and it came back right, which is what
   * made this look like a rendering bug rather than a measuring one.
   */
  private watchWidth(): void {
    const host = this.chartHost()?.nativeElement;
    if (!host || typeof ResizeObserver === 'undefined') return;
    this.renderedWidth = host.clientWidth;
    this.widthWatch = new ResizeObserver(() => {
      const width = host.clientWidth;
      if (!width || width === this.renderedWidth || this.destroyed) return;
      this.renderedWidth = width;
      this.zone.runOutsideAngular(() => {
        void this.chartInstance
          ?.updateOptions({ chart: { width } }, false, false)
          .then(() => this.layerAnnotations());
      });
    });
    this.widthWatch.observe(host);
  }

  updateOptions(
    options: object,
    redrawPaths?: boolean,
    animate?: boolean,
    updateSyncedCharts?: boolean
  ): Promise<unknown> | undefined {
    return this.chartInstance
      ?.updateOptions(options, redrawPaths, animate, updateSyncedCharts)
      .then((result) => {
        this.layerAnnotations();
        return result;
      });
  }

  /**
   * The axis annotations -- the zero line, the playhead -- behind the curves.
   *
   * Apex draws every annotation over the series and offers no option about
   * it, so a zero line crossed the curve it exists to be read against. The
   * groups are moved under the series after each draw; the point markers stay
   * in front, which is where a dot on a curve belongs.
   */
  layerAnnotations(): void {
    const host = this.chartHost()?.nativeElement;
    const series = host?.querySelector('.apexcharts-line-series, .apexcharts-area-series');
    const parent = series?.parentNode;
    if (!series || !parent) return;
    for (const selector of ['.apexcharts-yaxis-annotations', '.apexcharts-xaxis-annotations']) {
      const group = host!.querySelector(selector);
      // Only a group that is in front: moving one already behind is a
      // mutation of its own, which the observer would answer with another.
      const inFront =
        !!group && !!(series.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (group && inFront && group.parentNode === parent) parent.insertBefore(group, series);
    }
  }

  clearAnnotations(): void {
    this.chartInstance?.clearAnnotations();
  }

  addXaxisAnnotation(options: object, pushToMemory?: boolean): void {
    this.chartInstance?.addXaxisAnnotation(options, pushToMemory);
  }

  addPointAnnotation(options: object, pushToMemory?: boolean): void {
    this.chartInstance?.addPointAnnotation(options, pushToMemory);
  }

  addYaxisAnnotation(options: object, pushToMemory?: boolean): void {
    this.chartInstance?.addYaxisAnnotation(options, pushToMemory);
  }

  private scheduleUpdate(): void {
    if (!this.viewInitialized || this.destroyed) return;
    const generation = ++this.updateGeneration;
    queueMicrotask(() => {
      if (generation !== this.updateGeneration || this.destroyed) return;
      void this.renderOrUpdate();
    });
  }

  private async renderOrUpdate(): Promise<void> {
    if (this.updating) {
      this.updateWanted = true;
      return;
    }
    this.updating = true;
    try {
      const options = this.options();
      if (this.chartInstance) {
        await this.zone.runOutsideAngular(() =>
          this.chartInstance!.updateOptions(options, false, true)
        );
      } else {
        const ApexChartsConstructor = window.ApexCharts;
        if (!ApexChartsConstructor) {
          throw new Error('The chart renderer did not load.');
        }
        this.chartInstance = this.zone.runOutsideAngular(
          () => new ApexChartsConstructor(this.chartHost().nativeElement, options)
        );
        await this.zone.runOutsideAngular(() => this.chartInstance!.render());
      }
      this.layerAnnotations();
      this.zone.run(() => {
        this.renderError = null;
        this.changeDetector.markForCheck();
      });
    } catch (error) {
      console.error('Unable to render analysis graph.', error);
      this.zone.run(() => {
        this.renderError = 'Graph rendering failed. Reload the page and try again.';
        this.changeDetector.markForCheck();
      });
    } finally {
      this.updating = false;
      if (this.clearOverlayAfterRender && !this.updateWanted) {
        this.clearOverlayAfterRender = false;
        this.livePaths = [];
        this.zone.run(() => this.changeDetector.markForCheck());
      }
      if (this.updateWanted && !this.destroyed) {
        this.updateWanted = false;
        void this.renderOrUpdate();
      }
    }
  }

  private options(): ApexCharts.ApexOptions {
    const options: ApexCharts.ApexOptions = {
      annotations: this.annotations(),
      chart: this.chart(),
      colors: this.colors(),
      dataLabels: this.dataLabels(),
      grid: this.grid(),
      legend: this.legend(),
      markers: this.markers(),
      series: this.series(),
      stroke: this.stroke(),
      tooltip: this.tooltip(),
      xaxis: this.xaxis(),
      yaxis: this.yaxis(),
    };
    // ApexCharts treats an explicitly present `undefined` as an override of its default. Safari
    // then fails inside configuration reads such as `markers.size`. Match ng-apexcharts' contract
    // by omitting inputs that were not supplied.
    return Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined)
    ) as ApexCharts.ApexOptions;
  }
}
