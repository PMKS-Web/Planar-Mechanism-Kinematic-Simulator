import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { ViewButtonComponent } from '../view-controls/view-button.component';
import { InstantCenterService } from '../../services/instant-center.service';
import { MechanismService } from '../../services/mechanism.service';
import { AnalysisSampleService } from '../../services/analysis-sample.service';
import { CenterGeometry, PairCenter } from '../../model/mechanism/instant-center-solver';
import { MODEL_SCALE } from '../../model/render-scale';
import { RealLink } from '../../model/link';
import { PrisJoint, RealJoint } from '../../model/joint';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { InstantCenterBodyComponent } from './instant-center-body.component';

@Component({
  selector: 'app-instant-centers',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    CollapsibleSubsectionComponent,
    ToggleComponent,
    ButtonComponent,
    ViewButtonComponent,
    InstantCenterBodyComponent,
  ],
  templateUrl: './instant-centers.component.html',
  styleUrl: './instant-centers.component.scss',
})
export class InstantCentersComponent {
  protected readonly ic = inject(InstantCenterService);
  protected readonly mechanism = inject(MechanismService);
  private readonly samples = inject(AnalysisSampleService);
  protected readonly open = signal(false);
  protected readonly selectionOpen = signal(false);
  protected readonly analysisOpen = signal(false);
  protected readonly bodyOpen = new Set<string>();
  private readonly settings = inject(SettingsService);
  private readonly units = inject(NumberUnitParserService);
  protected get lengthUnit() {
    return this.units.unitLabel(this.settings.lengthUnit.value);
  }
  protected readonly selectAll = () => this.ic.selectAll(true);
  protected readonly clearSelection = () => this.ic.selectAll(false);
  protected readonly form = new FormGroup({
    show: new FormControl(this.ic.show.value, { nonNullable: true }),
    construction: new FormControl(this.ic.showConstruction.value, { nonNullable: true }),
  });
  private readonly subscription: Subscription = this.form.valueChanges.subscribe(() => {
    this.ic.show.next(this.form.controls.show.value);
    this.ic.showConstruction.next(this.form.controls.construction.value);
  });
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  protected location(geometry: CenterGeometry, center: PairCenter): string {
    const p = this.ic.point(geometry, center);
    if (p) return `(${this.number(p.x / MODEL_SCALE)}, ${this.number(p.y / MODEL_SCALE)})`;
    if (center.location === 'infinite' && center.point) {
      const angle =
        ((((Math.atan2(center.point[1], center.point[0]) * 180) / Math.PI) % 180) + 180) % 180;
      return `At infinity · ${this.number(angle)}° direction`;
    }
    return 'Unresolved at this pose';
  }

  protected number(value: number | undefined): string {
    return value !== undefined && Number.isFinite(value)
      ? Math.abs(value) < 1e-9
        ? '0'
        : Number(value.toPrecision(4)).toString()
      : 'Unavailable';
  }

  protected comparisons() {
    return this.mechanism.mechanisms.flatMap((mechanism, index) => {
      if (!mechanism.isMechanismValid()) return [];
      const step = this.mechanism.currentSampleOf(index);
      const result = this.ic.at(mechanism, step);
      if (!result) return [];
      const input = mechanism.joints[step].find(
        (joint) => joint instanceof RealJoint && joint.input
      );
      return [
        {
          mechanism,
          machine: `M${index + 1}`,
          step,
          input: input?.id,
          rate:
            mechanism.inputAngularVelocities[step] / (input instanceof PrisJoint ? MODEL_SCALE : 1),
          rateUnit: input instanceof PrisJoint ? this.lengthUnit + '/s' : 'rad/s',
          result,
          joints: mechanism.joints[step].map((joint) => ({
            id: joint.id,
            ic: this.samples.sampleAt(
              mechanism,
              step,
              'kinematic',
              'ic',
              'Linear Joint Vel',
              joint.id
            ),
            current: this.samples.sampleAt(
              mechanism,
              step,
              'kinematic',
              'loop',
              'Linear Joint Vel',
              joint.id
            ),
          })),
          rows: mechanism.links[step]
            .filter((link) => link instanceof RealLink)
            .map((link) => ({
              id: link.id,
              name: link.name,
              ic: result.linkAngVel.get(link.id),
              current: this.samples.sampleAt(
                mechanism,
                step,
                'kinematic',
                'loop',
                'Angular Link Vel',
                link.id
              )[0],
            })),
        },
      ];
    });
  }
}
