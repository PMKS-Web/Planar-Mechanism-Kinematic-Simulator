import { InjectionToken, inject } from '@angular/core';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { SaveHistoryService } from '../save-history.service';
import { SvgGridService } from '../svg-grid.service';
import { SelectedTabService } from '../../selected-tab.service';
import { ActiveObjService } from '../active-obj.service';
import { EditPermissionService } from '../edit-permission.service';
import type {
  ChromeMechanism,
  ChromeSettings,
  ChromeHistory,
  ChromeGrid,
  ChromeTabs,
  ChromeSelection,
  ChromePermission,
} from './chrome-contracts';

// Defaults alias the existing singleton; overriding a token never evaluates its
// legacy factory. Tests and gallery stories can keep their existing service stubs.
export const CHROME_MECHANISM = new InjectionToken<ChromeMechanism>('CHROME_MECHANISM', {
  providedIn: 'root',
  factory: () => inject(MechanismService),
});
export const CHROME_SETTINGS = new InjectionToken<ChromeSettings>('CHROME_SETTINGS', {
  providedIn: 'root',
  factory: () => inject(SettingsService),
});
export const CHROME_HISTORY = new InjectionToken<ChromeHistory>('CHROME_HISTORY', {
  providedIn: 'root',
  factory: () => inject(SaveHistoryService),
});
export const CHROME_GRID = new InjectionToken<ChromeGrid>('CHROME_GRID', {
  providedIn: 'root',
  factory: () => inject(SvgGridService),
});
export const CHROME_TABS = new InjectionToken<ChromeTabs>('CHROME_TABS', {
  providedIn: 'root',
  factory: () => inject(SelectedTabService),
});
export const CHROME_SELECTION = new InjectionToken<ChromeSelection>('CHROME_SELECTION', {
  providedIn: 'root',
  factory: () => inject(ActiveObjService),
});
export const CHROME_PERMISSION = new InjectionToken<ChromePermission>('CHROME_PERMISSION', {
  providedIn: 'root',
  factory: () => inject(EditPermissionService),
});
