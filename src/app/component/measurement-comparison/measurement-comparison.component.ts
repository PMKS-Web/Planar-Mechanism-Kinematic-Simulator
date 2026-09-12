import { Component, DoCheck, inject, input, signal } from '@angular/core';
import { ApexAxisChartSeries, ApexChart } from 'apexcharts';
import {
  angularScale,
  ANALYSIS_SERIES_COLORS,
  formatAnalysisValue,
} from '../../model/analysis-series';
import { AngleUnit } from '../../model/unit-enums';
import {
  compareMeasurements,
  MeasurementComparison,
  parseMeasurements,
  unwrapMeasurements,
} from '../../model/measurement-comparison';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { AnalysisApexChartComponent } from '../analysis-graph/analysis-apex-chart.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { StandardFieldDirective } from '../BLOCKS/standard-field/standard-field.directive';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

/** A measurement is attached to a named quantity; rebuilding a mechanism invalidates its comparison. */
@Component({
  selector: 'app-measurement-comparison',
  templateUrl: './measurement-comparison.component.html',
  styleUrls: ['./measurement-comparison.component.scss'],
  imports: [
    AnalysisApexChartComponent,
    ButtonComponent,
    StandardFieldDirective,
    SegmentedComponent,
  ],
})
export class MeasurementComparisonComponent implements DoCheck {
  readonly analysis = input('');
  readonly analysisType = input('');
  readonly mechProp = input('');
  readonly mechPart = input('');
  readonly reactionLinkId = input('');
  readonly unit = input('');
  readonly names = input<string[]>([]);
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private samples = inject(AnalysisSampleService);
  protected readonly open = signal(false);
  protected readonly text = signal('');
  protected readonly component = signal(0);
  protected readonly offset = signal('0');
  protected readonly result = signal<MeasurementComparison | null>(null);
  protected readonly error = signal('');
  protected readonly stale = signal(false);
  protected readonly chartSeries = signal<ApexAxisChartSeries>([]);
  protected readonly chart: ApexChart = {
    type: 'line',
    height: 240,
    animations: { enabled: false },
    toolbar: { show: false },
    zoom: { enabled: false },
  };
  protected readonly colors = [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y];
  protected readonly stroke = { width: [2, 0] };
  protected readonly markers = { size: [0, 4] };
  protected readonly xaxis = {
    type: 'numeric' as const,
    title: { text: 'Time (s)' },
    decimalsInFloat: 3,
  };
  protected readonly dataLabels = { enabled: false };
  protected readonly yaxis = { labels: { formatter: formatAnalysisValue } };
  private signature = '';
  private identity = '';

  ngDoCheck(): void {
    const identity = [
      this.mechPart(),
      this.mechProp(),
      this.analysis(),
      this.reactionLinkId(),
    ].join('|');
    const signature = [
      identity,
      this.analysisType(),
      this.unit(),
      this.mechanism.solveRevision,
    ].join('|');
    if (signature === this.signature) return;
    if (this.identity && this.identity !== identity) {
      this.text.set('');
      this.component.set(0);
      this.offset.set('0');
      this.open.set(false);
    }
    this.stale.set(this.text().trim().length > 0);
    this.result.set(null);
    this.error.set('');
    this.signature = signature;
    this.identity = identity;
  }

  protected editText(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.invalidate();
  }

  protected editOffset(event: Event): void {
    this.offset.set((event.target as HTMLInputElement).value);
    this.invalidate();
  }

  protected selectComponent(index: number): void {
    this.component.set(index);
    this.invalidate();
  }

  protected reading(value: number): string {
    return Number(value.toPrecision(6)).toString();
  }

  private invalidate(): void {
    this.result.set(null);
    this.error.set('');
  }

  protected readonly clear = (): void => {
    this.text.set('');
    this.stale.set(false);
    this.invalidate();
  };

  protected readonly compare = (): void => {
    this.invalidate();
    try {
      const measurements = parseMeasurements(this.text());
      const mechanism = this.mechanism.mechanismForId(this.mechPart());
      if (!mechanism?.isMechanismValid())
        throw new Error('Solve this mechanism before comparing measurements.');
      if (!this.offset().trim())
        throw new Error('Enter a time offset in seconds, or 0 for no offset.');
      const scale = angularScale(this.mechProp(), this.settings.angleUnit.value);
      let values = mechanism.timeNum.map(
        (_, step) =>
          this.samples.sampleAt(
            mechanism,
            step,
            this.analysis(),
            this.analysisType(),
            this.mechProp(),
            this.mechPart(),
            this.reactionLinkId()
          )[this.component()] * scale
      );
      const period =
        this.mechProp() === 'Angular Link Pos'
          ? this.settings.angleUnit.value === AngleUnit.DEGREE
            ? 360
            : 2 * Math.PI
          : 0;
      if (period) values = unwrapMeasurements(values, period);
      const result = compareMeasurements(
        measurements,
        mechanism.timeNum,
        values,
        Number(this.offset()),
        period
      );
      this.result.set(result);
      this.stale.set(false);
      this.chartSeries.set([
        {
          name: 'Theoretical',
          data: mechanism.timeNum.map((x, i) => ({
            x,
            y: Number.isFinite(values[i]) ? values[i] : null,
          })),
        },
        {
          name: 'Measured',
          data: result.points.map((point) => ({
            x: point.time,
            y: period ? point.theoretical + point.residual : point.value,
          })),
        },
      ]);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'The measurements could not be compared.'
      );
    }
  };
}
