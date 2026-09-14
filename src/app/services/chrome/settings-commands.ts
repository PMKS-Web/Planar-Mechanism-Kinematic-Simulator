import { InjectionToken, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from '../../model/unit-enums';
import { LegacySettingsCommandsService } from './legacy-settings-commands.service';

/** Values are physical document units; each command owns its transaction and any view compensation. */
export interface SettingsCommands {
  readonly objectScale: number;
  readonly objectScaleChanges: Observable<number>;
  setObjectScale(value: number): void;
  autoSize(): void;
  setAngleUnit(unit: AngleUnit): void;
  setForceUnit(unit: ForceUnit): void;
  setGlobalUnit(unit: GlobalUnit): void;
  setLengthUnit(unit: LengthUnit): void;
  setGrid(which: 'major' | 'minor', on: boolean): void;
  setGravity(on: boolean): void;
}
export const SETTINGS_COMMANDS = new InjectionToken<SettingsCommands>('SETTINGS_COMMANDS', {
  providedIn: 'root',
  factory: () => inject(LegacySettingsCommandsService),
});
