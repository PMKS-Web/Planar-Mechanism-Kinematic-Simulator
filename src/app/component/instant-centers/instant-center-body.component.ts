import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { ApexAxisChartSeries, ApexChart, ApexStroke } from 'apexcharts';
import { Mechanism } from '../../model/mechanism/mechanism';
import { explainInstantCenter } from '../../model/mechanism/instant-center-explanation';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { InstantCenterService } from '../../services/instant-center.service';
import { ANALYSIS_SERIES_COLORS } from '../../model/analysis-series';
import { AnalysisApexChartComponent } from '../analysis-graph/analysis-apex-chart.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

@Component({
  selector: 'app-instant-center-body',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [AnalysisApexChartComponent, SegmentedComponent],
  templateUrl: './instant-center-body.component.html',
  styleUrl: './instant-centers.component.scss',
})
export class InstantCenterBodyComponent {
  readonly mechanism = input.required<Mechanism>();
  readonly index = input.required<number>();
  readonly linkId = input.required<string>();
  protected readonly ic = inject(InstantCenterService);
  private readonly samples = inject(AnalysisSampleService);
  private readonly settings = inject(SettingsService);
  private readonly units = inject(NumberUnitParserService);
  protected readonly property = signal(0);
  protected readonly options = ['Angular Velocity', 'CoM Speed'];
  protected readonly chart: ApexChart = {
    type: 'line',
    height: 240,
    animations: { enabled: false },
    toolbar: { show: false },
    zoom: { enabled: false },
  };
  protected readonly stroke: ApexStroke = { width: [3, 2], dashArray: [0, 6], curve: 'straight' };
  protected readonly colors = [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y];
  protected readonly dataLabels = { enabled: false };
  protected readonly yaxis = {
    labels: { formatter: (value: number) => this.number(value), minWidth: 30 },
  };
  protected readonly xaxis = {
    type: 'numeric' as const,
    title: { text: 'Time (s)' },
    labels: { formatter: (v: string) => this.number(Number(v)) },
  };
  private cachedMechanism?: Mechanism;
  private cacheKey = '';
  private series: ApexAxisChartSeries = [];
  protected unavailable = 0;
  protected plotted = 0;

  protected get lengthUnit() {
    return this.units.unitLabel(this.settings.lengthUnit.value);
  }
  protected detail() {
    return explainInstantCenter(this.mechanism(), this.index(), this.linkId());
  }
  protected currentVelocity() {
    return this.samples.sampleAt(
      this.mechanism(),
      this.index(),
      'kinematic',
      'loop',
      "Linear Link's CoM Vel",
      this.linkId()
    );
  }
  protected number(value: number | undefined): string {
    return value === undefined || !Number.isFinite(value)
      ? 'Unavailable'
      : Math.abs(value) < 1e-9
        ? '0'
        : Number(value.toPrecision(4)).toString();
  }
  protected plot(): ApexAxisChartSeries {
    const mechanism = this.mechanism();
    // The teaching preview samples long cycles; the default analysis still owns full output.
    const count = Math.min(361, mechanism.joints.length);
    const indices = Array.from({ length: count }, (_, i) =>
      Math.round((i * (mechanism.joints.length - 1)) / Math.max(1, count - 1))
    );
    const key = [
      this.linkId(),
      this.property(),
      this.lengthUnit,
      ...indices.map((i) => `${mechanism.timeNum[i]}:${mechanism.inputAngularVelocities[i]}`),
    ].join('|');
    if (this.cachedMechanism === mechanism && this.cacheKey === key) return this.series;
    this.cachedMechanism = mechanism;
    this.cacheKey = key;
    const property = this.property() === 0 ? 'Angular Link Vel' : "Linear Link's CoM Vel";
    const column = this.property() === 0 ? 0 : 2;
    this.unavailable = 0;
    this.plotted = count;
    this.series = ['loop', 'ic'].map((method) => ({
      name: method === 'ic' ? 'Instant centers' : 'Current solver',
      data: indices.map((i) => {
        const value = this.samples.sampleAt(
          mechanism,
          i,
          'kinematic',
          method,
          property,
          this.linkId()
        )[column];
        if (method === 'ic' && !Number.isFinite(value)) this.unavailable++;
        return { x: mechanism.timeNum[i], y: Number.isFinite(value) ? value : null };
      }),
    }));
    return this.series;
  }
}
