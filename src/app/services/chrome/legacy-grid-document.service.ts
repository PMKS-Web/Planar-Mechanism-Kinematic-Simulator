import { Injectable, Injector, inject } from '@angular/core';
import { MechanismService } from '../mechanism.service';
import { SaveHistoryService } from '../save-history.service';
import { SettingsService } from '../settings.service';
import type { GridDocument } from './grid-document';
import type { Rect } from '../view-framing';

@Injectable({ providedIn: 'root' })
export class LegacyGridDocumentService implements GridDocument {
  private mechanism = inject(MechanismService);
  private injector = inject(Injector);
  get objectScale() {
    return SettingsService.objectScale;
  }
  get objectScaleChosen() {
    return SettingsService.objectScaleChosen;
  }
  chooseObjectScale() {
    SettingsService.objectScaleChosen = true;
  }
  hasParts() {
    return this.mechanism.joints.length > 0;
  }
  setObjectScale(scale: number) {
    SettingsService._objectScale.next(scale);
    this.mechanism.applyObjectScaleChange();
  }
  restate() {
    this.injector.get(SaveHistoryService).restate();
  }
  fullMotionBox(): Rect | null {
    const mechanism = this.mechanism;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const solved of mechanism.mechanisms) {
      if (!solved.isMechanismValid()) continue;
      for (const frame of solved.joints) {
        for (const point of frame) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          // Drawing layers wear modelFrame, so their coordinates are y-up
          // inside a y-down viewport. Framing uses the viewport's space.
          minY = Math.min(minY, -point.y);
          maxY = Math.max(maxY, -point.y);
        }
      }
    }
    if (!Number.isFinite(minX)) return null;
    const pad = Math.max(this.objectScale * 0.65, 1);
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(maxX - minX + 2 * pad, 2 * pad),
      height: Math.max(maxY - minY + 2 * pad, 2 * pad),
    };
  }
}
