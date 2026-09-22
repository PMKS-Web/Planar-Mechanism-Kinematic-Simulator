import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Force } from '../../model/force';
import { forceAngleGuide, forceFrameAngle } from '../../model/force-frame';
import { UprightDirective } from '../../model-frame.directive';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { ForceGuideService } from '../../services/force-guide.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { AngleUnit } from '../../model/utils';

@Component({
  selector: '[appForceMark]',
  templateUrl: './force-mark.component.html',
  styleUrls: ['./force-mark.component.scss'],
  imports: [UprightDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ForceMarkComponent {
  protected readonly Math = Math;
  readonly force = input.required<Force>();
  readonly selected = input(false);
  readonly paused = input(true);
  readonly ink = input<string | null>(null);
  protected readonly settings = inject(SettingsService);
  protected readonly grid = inject(SvgGridService);
  protected readonly guide = inject(ForceGuideService);
  private readonly units = inject(NumberUnitParserService);
  protected readonly frameAngle = forceFrameAngle;
  protected readonly angleGuide = forceAngleGuide;

  protected angleLabel(angle: number): string {
    const unit = this.settings.angleUnit.value;
    return this.units.formatValueAndUnit(
      this.units.convertAngle(angle, AngleUnit.RADIAN, unit),
      unit
    );
  }
}
