import { Component, ChangeDetectionStrategy } from '@angular/core';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { NotReadyWarningComponent } from '../not-ready-warning/not-ready-warning.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

@Component({
  selector: 'app-equation-panel',
  templateUrl: './equation-panel.component.html',
  styleUrls: ['./equation-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionComponent,
    NotReadyWarningComponent,
    TitleBlock,
    CollapsibleSubsectionComponent,
  ],
})
export class EquationPanelComponent {}
