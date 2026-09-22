import { Injectable, inject } from '@angular/core';
import { DRAWING_STYLES, storeDrawingStyle } from '../model/drawing-style';
import { linkArtwork, schematicLink } from '../model/link-artwork';
import { Link, RealLink } from '../model/link';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';

/** The whole drawing shares one style. It has no route to document history or the solver. */
@Injectable({ providedIn: 'root' })
export class ObjectDisplayService {
  private mechanism = inject(MechanismService);
  readonly settings = inject(SettingsService);

  selectedStyle(): string {
    return String(DRAWING_STYLES.indexOf(this.settings.drawingStyle.value));
  }

  chooseStyle(index: string | null): void {
    const style = DRAWING_STYLES[Number(index)];
    if (!style) return;
    this.settings.drawingStyle.next(style);
    storeDrawingStyle(style);
  }

  path(link: Link): string {
    return linkArtwork(link, this.settings.drawingScale, this.mechanism.sealedStructures());
  }

  skeleton(link: Link): string {
    return schematicLink(link, this.mechanism.sealedStructures());
  }

  comPaths(link: Link): string[] {
    if (!(link instanceof RealLink)) return [];
    const { x, y } = link.CoM;
    const r = 0.11 * this.settings.drawingScale;
    const points = [
      [x - r, y],
      [x, y + r],
      [x + r, y],
      [x, y - r],
    ];
    return points.map(([a, b], i) => {
      const [c, d] = points[(i + 1) % 4];
      return `M ${x} ${y} L ${a} ${b} A ${r} ${r} 0 0 0 ${c} ${d} Z`;
    });
  }
}
