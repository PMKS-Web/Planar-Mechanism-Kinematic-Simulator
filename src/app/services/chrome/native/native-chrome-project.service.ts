import { NativeSettingsService } from './native-settings.service';
import { encodeBodyDocument } from '../../transcoding/body-document-codec';
import { Injectable, inject } from '@angular/core';
import { NativeEditorService } from '../../native-editor.service';
import { SvgGridService } from '../../svg-grid.service';
import { NATIVE_PREVIEW_FEATURES } from '../../../model/body-system/native-preview-features';
import type { ChromeProject } from '../chrome-project';

@Injectable({ providedIn: 'root' })
export class NativeChromeProjectService implements ChromeProject {
  private readonly editor = inject(NativeEditorService);
  private readonly grid = inject(SvgGridService);
  readonly recover = () => {
    this.editor.recover();
    this.grid.scaleToFitLinkage();
  };
  newProjectUrl() {
    return `${location.origin}${location.pathname}?editor=native`;
  }
  open(payload: string) {
    const opened = this.editor.load(payload.trim());
    if (opened) this.grid.scaleToFitLinkage();
    return opened;
  }
  private readonly settings = inject(NativeSettingsService);
  serialize() {
    const document = this.editor.document();
    const result = encodeBodyDocument({
      ...document,
      settings: { ...document.settings, showIds: this.settings.isShowID.value },
    });
    if (!result.ok) throw new Error('The project could not be saved.');
    return result.payload;
  }
  shareUrl() {
    const url = new URL(this.newProjectUrl());
    url.searchParams.set('document', this.serialize());
    return url.href;
  }
  copyUrl() {
    return navigator.clipboard.writeText(this.shareUrl());
  }
  openLibrary() {
    this.editor.report(NATIVE_PREVIEW_FEATURES.library);
  }
  exportDrawing() {
    this.editor.report(NATIVE_PREVIEW_FEATURES.export);
  }
  prepareExport() {
    this.editor.report(NATIVE_PREVIEW_FEATURES.export);
  }
}
