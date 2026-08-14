import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import {
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
} from '@angular/material/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatButton } from '@angular/material/button';

@Component({
  selector: 'app-touchscreen-warning',
  templateUrl: './touchscreen-warning.component.html',
  styleUrls: ['./touchscreen-warning.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatDialogTitle, CdkScrollable, MatDialogContent, MatDialogActions, MatButton],
})
export class TouchscreenWarningComponent {
  dialogRef = inject<MatDialogRef<TouchscreenWarningComponent>>(MatDialogRef);

  onNoClick(): void {
    this.dialogRef.close();
  }

  onDismissClick(): void {
    localStorage.setItem('dismiss', 'true');
    this.onNoClick();
  }
}
