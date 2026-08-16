import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ScrollShadowDirective } from '../../../scroll-shadow.directive';

@Component({
  selector: 'panel-section',
  templateUrl: './panel-section.component.html',
  styleUrls: ['./panel-section.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [ScrollShadowDirective],
})
export class PanelSectionComponent {}
