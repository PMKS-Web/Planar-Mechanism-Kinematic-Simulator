import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-not-ready-warning',
    templateUrl: './not-ready-warning.component.html',
    styleUrls: ['./not-ready-warning.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NotReadyWarningComponent {

}
