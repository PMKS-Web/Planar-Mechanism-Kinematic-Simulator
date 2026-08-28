import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  DEFAULT_DXF_EXPORT_OPTIONS,
  DxfExportOptions,
  DxfExportService,
} from '../../../services/export/dxf/dxf-export.service';

@Component({
  selector: 'app-drawing-export',
  templateUrl: './drawing-export.component.html',
  styleUrls: ['./drawing-export.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormsModule,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
  ],
})
export class DrawingExportComponent {
  static openIn(dialog: MatDialog): MatDialogRef<DrawingExportComponent> {
    return dialog.open(DrawingExportComponent, {
      width: 'min(520px, calc(100vw - 24px))',
      maxHeight: 'calc(100vh - 24px)',
      autoFocus: 'dialog',
    });
  }

  private exportService = inject(DxfExportService);
  private dialogRef = inject<MatDialogRef<DrawingExportComponent> | null>(
    MatDialogRef<DrawingExportComponent>,
    { optional: true }
  );

  options: Required<DxfExportOptions> = { ...DEFAULT_DXF_EXPORT_OPTIONS };

  download(): void {
    const file = this.exportService.create(this.options);
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
    this.dialogRef?.close();
  }
}
