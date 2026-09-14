import { InjectionToken, inject } from '@angular/core';
import { LegacyChromeProjectService } from './legacy-chrome-project.service';

/** File operations remain on the route's document, including Help's attached URL. */
export interface ChromeProject {
  readonly recover?: () => void;
  newProjectUrl(): string;
  open(payload: string): boolean | void;
  serialize(): string;
  shareUrl(): string;
  copyUrl(): void | Promise<void>;
  openLibrary(): void;
  exportDrawing(): void;
  prepareExport(): void;
}
export const CHROME_PROJECT = new InjectionToken<ChromeProject>('CHROME_PROJECT', {
  providedIn: 'root',
  factory: () => inject(LegacyChromeProjectService),
});
