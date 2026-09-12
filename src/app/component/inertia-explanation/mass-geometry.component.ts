import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Link } from '../../model/link';
import { massGeometryOf } from '../../model/mass-geometry';
import { UprightDirective } from '../../model-frame.directive';

/** Shared by the grid overlay and the educational gallery comparison. */
@Component({
  selector: 'g[app-mass-geometry]',
  imports: [UprightDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './mass-geometry.component.html',
  styleUrl: './mass-geometry.component.scss',
  host: { 'pointer-events': 'none', 'aria-label': 'Automatic mass geometry' },
})
export class MassGeometryComponent {
  readonly body = input.required<Link>();
  readonly markSize = input(20);
  protected get domains() {
    return massGeometryOf(this.body()).map((domain) => ({
      ...domain,
      path:
        domain.points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') +
        (domain.kind === 'plate' ? ' Z' : ''),
    }));
  }
}
