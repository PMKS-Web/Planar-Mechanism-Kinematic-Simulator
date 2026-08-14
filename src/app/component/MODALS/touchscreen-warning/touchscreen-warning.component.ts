import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-touchscreen-warning',
  templateUrl: './touchscreen-warning.component.html',
  styleUrls: ['./touchscreen-warning.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
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
