import { Component, input, output, computed } from '@angular/core';
import { Gear, gearPitchRadius, gearPlane } from '../../model/gear';
import { UprightDirective } from '../../model-frame.directive';
import { GearDrawingComponent } from './gear-drawing.component';

/** Concentric pitch geometry stays at its physical center; planes affect ink/order only. */
@Component({
  selector: 'g[appGearShaftDrawing]',
  imports: [GearDrawingComponent, UprightDirective],
  template: `
    @for (gear of drawingOrder(); track gear.id) {
      <svg:g
        appGearDrawing
        [gear]="gear"
        [detail]="detail() && radius(gear) > detailThreshold()"
        [attr.transform]="'rotate(' + headingDegrees() + ')'"
        [class.selected]="selectedId() === gear.id"
        [class.invalid]="invalidIds().includes(gear.id)"
        [attr.data-gear-id]="gear.id"
        [attr.data-gear-center]="gear.centerJointId"
        [attr.data-gear-plane]="plane(gear) + 1"
        role="button"
        tabindex="0"
        [attr.aria-label]="'Gear ' + (gear.name || gear.id) + ', plane ' + (plane(gear) + 1)"
        (pointerdown)="$event.stopPropagation()"
        (pointerup)="$event.stopPropagation()"
        (mousedown)="$event.stopPropagation()"
        (mouseup)="$event.stopPropagation()"
        (click)="pick($event, gear.id, true)"
        (keydown.enter)="pick($event, gear.id)"
        (contextmenu)="pick($event, gear.id); $event.preventDefault()"
      />
      <svg:g upright pointer-events="none">
        <svg:text
          [attr.x]="radius(gear) * 0.55"
          [attr.y]="labelY(gear)"
          [attr.font-size]="labelSize()"
          fill="var(--text-primary)"
        >
          {{ gear.teeth }}T
          @if (gears().length > 1 || plane(gear)) {
            · P{{ plane(gear) + 1 }}
          }
        </svg:text>
      </svg:g>
    }
  `,
})
export class GearShaftDrawingComponent {
  readonly gears = input.required<readonly Gear[]>();
  readonly selectedId = input<string>();
  readonly invalidIds = input<readonly string[]>([]);
  readonly headingDegrees = input(0);
  readonly labelSize = input(12);
  readonly detail = input(true);
  readonly detailThreshold = input(0);
  readonly picked = output<string>();
  protected radius = gearPitchRadius;
  protected plane = gearPlane;
  protected ordered = computed(() => [...this.gears()].sort((a, b) => gearPlane(a) - gearPlane(b)));
  protected drawingOrder = computed(() => [
    ...this.ordered().filter((g) => g.id !== this.selectedId()),
    ...this.ordered().filter((g) => g.id === this.selectedId()),
  ]);
  protected labelY(gear: Gear) {
    const sameRadius = this.ordered().filter(
      (g) => Math.abs(gearPitchRadius(g) - gearPitchRadius(gear)) < 1e-9
    );
    return (
      -gearPitchRadius(gear) * 0.55 +
      sameRadius.findIndex((g) => g.id === gear.id) * this.labelSize() * 1.4
    );
  }
  protected pick(event: Event, id: string, cycle = false) {
    event.stopPropagation();
    if (cycle) {
      const gear = this.gears().find((g) => g.id === id)!;
      const coincident = this.ordered().filter(
        (g) => Math.abs(gearPitchRadius(g) - gearPitchRadius(gear)) < 1e-9
      );
      const at = coincident.findIndex((g) => g.id === this.selectedId());
      if (at >= 0 && coincident.length > 1) id = coincident[(at + 1) % coincident.length].id;
    }
    this.picked.emit(id);
  }
}
