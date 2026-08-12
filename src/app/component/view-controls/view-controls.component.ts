import { SelectedTabService } from '../../selected-tab.service';
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
    public settingsService: SettingsService,
    public tabs: SelectedTabService
  ) {}

  /**
   * Whether the thing this button switches on is currently on.
   *
   * The icon already swaps between an on and an off glyph; the button also
   * carries the state as a tint now that the words have gone, because an icon
   * alone is a weaker signal than an icon beside the word it stands for.
   */
  isShowingCoM(): boolean {
    return this.settingsService.isShowCOM.value;
  }

  isShowingIDs(): boolean {
    return this.settingsService.isShowID.value;
  }

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
