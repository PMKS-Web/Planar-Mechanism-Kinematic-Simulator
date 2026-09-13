import { Component, input, output, computed } from '@angular/core';
import { Gear, gearPlane } from '../../model/gear';
import { ButtonComponent } from '../BLOCKS/button/button.component';

/** Explicit identity navigation also reaches equal-radius gears hidden behind one another. */
@Component({
  selector: 'app-gear-shaft-choices',
  imports: [ButtonComponent],
  template: `
    <p>Gears on Shaft {{ gears()[0]?.hostLinkId }}</p>
    @for (gear of ordered(); track gear.id) {
      <button-block
        [click]="choose(gear.id)"
        [icon]="gear.id === selectedId() ? 'check' : 'settings'"
        [dataAction]="'select-shaft-gear-' + gear.id"
        [tooltip]="gear.name || gear.id"
      >
        {{ gear.name || gear.id }} · {{ gear.teeth }}T · Plane {{ plane(gear) + 1 }}
      </button-block>
    }
  `,
  styles: [
    `
      p {
        font-size: 12px;
        color: var(--text-secondary);
        margin: 8px 0;
      }
      button-block {
        display: block;
        margin: 4px 0;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class GearShaftChoicesComponent {
  readonly gears = input.required<readonly Gear[]>();
  readonly selectedId = input<string>();
  readonly picked = output<string>();
  protected plane = gearPlane;
  protected ordered = computed(() => [...this.gears()].sort((a, b) => gearPlane(a) - gearPlane(b)));
  protected choose(id: string) {
    return () => this.picked.emit(id);
  }
}
