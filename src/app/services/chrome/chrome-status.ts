import { InjectionToken, inject } from '@angular/core';
import { LegacyChromeStatusService } from './legacy-chrome-status.service';

export interface ChromeStatus {
  readonly record: { readonly label: string } | undefined;
  readonly live: boolean;
  sync(): void;
  synthesisStatus(): string;
}
export const CHROME_STATUS = new InjectionToken<ChromeStatus>('CHROME_STATUS', {
  providedIn: 'root',
  factory: () => inject(LegacyChromeStatusService),
});
