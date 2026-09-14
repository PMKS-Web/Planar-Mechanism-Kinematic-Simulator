import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shadow distances follow the geometry's coordinate frame, independently of viewport scale. */
@Component({
  selector: 'defs[appCanvasEffects]',
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './canvas-effects.component.html',
})
export class CanvasEffectsComponent {
  readonly objectScale = input.required<number>();
}
