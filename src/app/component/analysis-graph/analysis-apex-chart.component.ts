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
  `,
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
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.updateGeneration++;
    this.widthWatch?.disconnect();
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
        this.chartInstance?.updateOptions({ chart: { width } }, false, false);
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
    return this.chartInstance?.updateOptions(options, redrawPaths, animate, updateSyncedCharts);
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
