import type { Provider } from '@angular/core';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { SaveHistoryService } from '../save-history.service';
import { SvgGridService } from '../svg-grid.service';
import { SelectedTabService } from '../../selected-tab.service';
import { ActiveObjService } from '../active-obj.service';
import { EditPermissionService } from '../edit-permission.service';
import {
  CHROME_MECHANISM,
  CHROME_SETTINGS,
  CHROME_HISTORY,
  CHROME_GRID,
  CHROME_TABS,
  CHROME_SELECTION,
  CHROME_PERMISSION,
} from './chrome-tokens';

/** Aliases, not replacement instances: the grid and chrome share every write. */
export const LEGACY_CHROME_PROVIDERS: Provider[] = [
  { provide: CHROME_MECHANISM, useExisting: MechanismService },
  { provide: CHROME_SETTINGS, useExisting: SettingsService },
  { provide: CHROME_HISTORY, useExisting: SaveHistoryService },
  { provide: CHROME_GRID, useExisting: SvgGridService },
  { provide: CHROME_TABS, useExisting: SelectedTabService },
  { provide: CHROME_SELECTION, useExisting: ActiveObjService },
  { provide: CHROME_PERMISSION, useExisting: EditPermissionService },
];
