import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'panel-section',
    templateUrl: './panel-section.component.html',
    styleUrls: ['./panel-section.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class PanelSectionComponent {}
