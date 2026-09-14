import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UrlGenerationService } from '../url-generation.service';
import { UrlProcessorService } from '../url-processor.service';
import { ExportFlowService } from '../export/export-flow.service';
// eslint-disable-next-line no-restricted-imports -- These are the library and drawing export modal entry points.
import { TemplatesComponent } from '../../component/MODALS/templates/templates.component';
// eslint-disable-next-line no-restricted-imports -- Drawing export is opened as a modal, not used as application state.
import { DrawingExportComponent } from '../../component/MODALS/drawing-export/drawing-export.component';
import type { ChromeProject } from './chrome-project';

@Injectable({ providedIn: 'root' })
export class LegacyChromeProjectService implements ChromeProject {
  private generation = inject(UrlGenerationService);
  private processor = inject(UrlProcessorService);
  private exportFlow = inject(ExportFlowService);
  private dialog = inject(MatDialog);
  newProjectUrl() {
    return window.location.origin + window.location.pathname;
  }
  open(payload: string) {
    this.processor.updateFromURL(payload);
  }
  serialize() {
    return this.generation.generateUrlQuery();
  }
  shareUrl() {
    return this.generation.generateFullUrl();
  }
  copyUrl() {
    this.generation.copyFullUrl();
  }
  openLibrary() {
    TemplatesComponent.openIn(this.dialog);
  }
  exportDrawing() {
    DrawingExportComponent.openIn(this.dialog);
  }
  prepareExport() {
    this.exportFlow.reset();
  }
}
