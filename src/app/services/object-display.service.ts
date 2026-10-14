import { Injectable, inject } from '@angular/core';
import { proportionalObjectScale } from '../model/proportional-object-scale';
import { MechanismService } from './mechanism.service';
import { SaveHistoryService } from './save-history.service';
import { SettingsService, writeStoredFlag } from './settings.service';

const SIZE_FACTORS = [0.65, 1, 1.4] as const;

/** Display controls cannot edit cylinder lengths, stroke, or solved motion. */
@Injectable({ providedIn: 'root' })
export class ObjectDisplayService {
  private mechanism = inject(MechanismService);
  private history = inject(SaveHistoryService);
  readonly settings = inject(SettingsService);

  selectedSize(): number {
    const normal = proportionalObjectScale(this.mechanism.links);
    if (!normal) return -1;
    return SIZE_FACTORS.findIndex(
      (factor) => Math.abs(SettingsService.objectScale / normal - factor) < 0.01
    );
  }

  chooseSize(index: number): void {
    const normal = proportionalObjectScale(this.mechanism.links);
    const factor = SIZE_FACTORS[index];
    if (!normal || !factor || this.selectedSize() === index) return;
    SettingsService.preserveCylinderGeometry();
    SettingsService.objectScaleChosen = true;
    SettingsService._objectScale.next(normal * factor);
    this.mechanism.applyObjectScaleChange();
    this.history.save();
  }

  chooseLines(index: number): void {
    const lines = index === 1;
    this.settings.isLineDrawing.next(lines);
    writeStoredFlag('lineDrawing', lines);
  }
}
