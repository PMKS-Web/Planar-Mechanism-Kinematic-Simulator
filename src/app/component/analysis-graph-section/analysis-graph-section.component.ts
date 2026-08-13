import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';
import { AnalysisGraphComponent } from '../analysis-graph/analysis-graph.component';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { AngleUnit, LengthUnit } from '../../model/unit-enums';
import { ANALYSIS_SERIES_COLORS } from '../../model/analysis-series';
import { roundNumber } from '../../model/utils';

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
  standalone: false,
})
export class AnalysisGraphSectionComponent {
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

  constructor(
    private mechanismService: MechanismService,
    private settings: SettingsService,
    private samples: AnalysisSampleService
  ) {}

  /**
   * What this quantity reads at the pose on screen.
   *
   * One sample, not the cycle: the header is answering "what is it now", and
   * solving every sample of every collapsed graph to answer that would cost
   * more than the graphs themselves.
   */
  get preview(): SeriesPreview[] {
    const mechanism = this.mechanismFor();
    if (!mechanism) return [];
    const step = Math.min(this.mechanismService.mechanismTimeStep, mechanism.joints.length - 1);
    const values = this.samples.sampleAt(
      mechanism,
      Math.max(step, 0),
      this.analysis,
      this.analysisType,
      this.mechProp,
      this.mechPart,
      this.reactionLinkId
    );
    if (values.length === 0) return [];

    const names = this.seriesNames(values.length);
    const keys: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    const unit = this.unitFor();
    return values.map((value, index) => ({
      key: keys[index],
      name: names[index],
      color: this.colorFor(names[index]),
      text: Number.isFinite(value) ? `${roundNumber(value, 2).toFixed(2)} ${unit}`.trim() : '—',
    }));
  }

  /** Whether the open graph is drawing this series. Closed, everything reads. */
  isShown(key: 'x' | 'y' | 'z'): boolean {
    return !this.graph || this.graph.isSeriesShown(key);
  }

  toggleSeries(key: 'x' | 'y' | 'z'): void {
    this.graph?.toggleSeries(key);
  }

  toggle(): void {
    this.expanded = !this.expanded;
    this.expandedChange.emit(this.expanded);
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
