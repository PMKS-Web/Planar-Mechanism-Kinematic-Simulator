import { Component, computed, input } from '@angular/core';
import { Gear, gearPitchRadius } from '../../model/gear';

/** Symbolic pitch artwork. Tick count is bounded independently of physical tooth count. */
@Component({
  selector: 'g[appGearDrawing]',
  template: `
    <svg:circle class="pitch" [attr.r]="radius()" />
    <svg:path class="teeth" [attr.d]="ticks()" />
    <svg:line class="reference" x1="0" y1="0" [attr.x2]="radius() * 0.85" y2="0" />
    <svg:circle class="center" r="3" vector-effect="non-scaling-stroke" />
  `,
  styles: [
    `
      :host {
        color: var(--brand);
      }
      circle,
      path,
      line {
        fill: none;
        stroke: currentColor;
        vector-effect: non-scaling-stroke;
      }
      .pitch {
        stroke-width: 1.5;
        stroke-dasharray: 5 3;
      }
      .teeth {
        stroke-width: 1.5;
      }
      .reference {
        stroke-width: 1;
        pointer-events: none;
      }
      .center {
        pointer-events: none;
      }
      :host(.selected) {
        color: var(--brand-dark);
      }
      :host(.selected) .pitch {
        stroke-width: 3;
      }
      :host(.invalid) {
        color: var(--danger-dark);
      }
      :host(:focus-visible) {
        outline: none;
      }
      :host(:focus-visible) .pitch,
      :host(:hover) .pitch {
        stroke-width: 3;
      }
    `,
  ],
})
export class GearDrawingComponent {
  readonly gear = input.required<Gear>();
  readonly detail = input(true);
  protected readonly radius = computed(() => gearPitchRadius(this.gear()));
  protected readonly ticks = computed(() => {
    const count = Math.min(this.gear().teeth, this.detail() ? 96 : 12);
    const r = this.radius();
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      return `M${r * 0.98 * c},${r * 0.98 * s}L${r * 1.045 * c},${r * 1.045 * s}`;
    }).join(' ');
  });
}
