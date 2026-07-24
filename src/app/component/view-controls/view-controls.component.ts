import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { SvgGridService } from '../../services/svg-grid.service';

/**
 * View toggles that apply in every mode, so they sit at the foot of the nav
 * rail rather than inside a mode's own section.
 */
@Component({
  selector: 'app-view-controls',
  templateUrl: './view-controls.component.html',
  styleUrls: ['./view-controls.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ViewControlsComponent {
  constructor(
    public svgGrid: SvgGridService,
    public mechanismService: MechanismService,
    public settingsService: SettingsService
  ) {}

  noJointExists(): boolean {
    return this.mechanismService.joints.length === 0;
  }

  noLinkExists(): boolean {
    return this.mechanismService.links.length === 0;
  }

  showCenterOfMass(): void {
    this.settingsService.isShowCOM.next(!this.settingsService.isShowCOM.value);
  }

  comIconName(): string {
    return this.settingsService.isShowCOM.value ? 'com_off' : 'com';
  }

  idLabelIconName(): string {
    return this.settingsService.isShowID.value ? 'abc_off' : 'abc';
  }

  onShowIDPressed(): void {
    this.settingsService.isShowID.next(!this.settingsService.isShowID.value);
  }

  onZoomInPressed(): void {
    this.svgGrid.zoomIn();
  }

  onZoomOutPressed(): void {
    this.svgGrid.zoomOut();
  }

  onReframePressed(): void {
    this.svgGrid.scaleToFitLinkage();
  }
}
