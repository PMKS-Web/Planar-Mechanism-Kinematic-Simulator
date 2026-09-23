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

  /**
   * The center-of-mass mark's radius: the style's size, but never under 6px,
   * because it is a handle as well as a glyph and a thin style made it one
   * nobody could hit.
   */
  comRadius(): number {
    return Math.max(0.11 * this.settings.drawingScale, this.pixels(6));
  }

  /** Where a grab on that mark lands: a 12px radius at the least. */
  comHitRadius(): number {
    return Math.max(0.16 * this.settings.drawingScale, this.pixels(12));
  }

  private pixels(px: number): number {
    const zoom = this.settings.drawingZoom;
    return zoom > 0 ? px / zoom : 0;
  }

  comPaths(link: Link): string[] {
    if (!(link instanceof RealLink)) return [];
    const { x, y } = link.CoM;
    const r = this.comRadius();
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
