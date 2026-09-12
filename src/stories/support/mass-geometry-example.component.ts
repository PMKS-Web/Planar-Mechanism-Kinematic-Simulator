import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RealLink } from '../../app/model/link';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { uniformMassProperties } from '../../app/model/mass-properties';
import { ModelFrameDirective, UprightDirective } from '../../app/model-frame.directive';
import { MassGeometryComponent } from '../../app/component/inertia-explanation/mass-geometry.component';
import { InertiaExplanationComponent } from '../../app/component/inertia-explanation/inertia-explanation.component';
import { ButtonComponent } from '../../app/component/BLOCKS/button/button.component';

/** An educational comparison using the real drawing path and integration overlay. */
@Component({
  selector: 'app-mass-geometry-example',
  imports: [
    ModelFrameDirective,
    UprightDirective,
    MassGeometryComponent,
    InertiaExplanationComponent,
    ButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <p>{{ caption() }}</p>
    <svg [attr.viewBox]="viewBox" role="img" aria-label="Drawing outline and automatic mass domain">
      <g modelFrame>
        <path class="drawing" [attr.d]="body().d" />
        <g app-mass-geometry [body]="body()" [markSize]="markerSize / 2" />
        @for (joint of markers; track joint.id) {
          <circle class="joint" [attr.cx]="joint.x" [attr.cy]="joint.y" [attr.r]="markerSize / 3" />
          <g [upright]="joint">
            <text [attr.y]="markerSize * 1.2" [attr.font-size]="markerSize">{{ joint.id }}</text>
          </g>
        }
      </g>
    </svg>
    <p>Filled outline: drawing geometry. Dashed line or polygon: automatic mass domain.</p>
    @if (interior()) {
      <p>
        Joint E is inside the hull at {{ interiorCoordinates }} cm. A concave joint ordering still
        integrates the convex plate ABCD.
      </p>
      <button-block [click]="moveInterior">Move Interior Joint</button-block>
      <p>Move E within the hull: its outline, centroid and automatic inertia stay unchanged.</p>
    }
    <app-inertia-explanation [body]="body()" [expanded]="true" />
  `,
  styles: `
    :host {
      display: block;
      font-size: 12px;
      color: var(--text-primary);
    }
    p {
      padding: 0 var(--card-gap);
    }
    svg {
      display: block;
      width: 100%;
      height: 180px;
    }
    .drawing {
      fill: var(--brand);
      fill-opacity: 0.25;
      stroke: var(--brand);
      stroke-width: 3;
    }
    .joint {
      fill: var(--surface-subtle);
      stroke: var(--text-strong);
      stroke-width: 2;
    }
    text {
      fill: var(--text-strong);
      text-anchor: middle;
    }
  `,
})
export class MassGeometryExampleComponent {
  readonly body = input.required<RealLink>();
  readonly caption = input('');
  readonly interior = input(false);
  protected get markerSize() {
    const bounds = this.viewBox.split(' ').map(Number);
    return Math.max(bounds[2], bounds[3]) / 20;
  }
  protected get markers() {
    const grouped = new Map<string, { id: string; x: number; y: number }>();
    for (const joint of this.body().joints) {
      const key = `${joint.x},${joint.y}`;
      const marker = grouped.get(key);
      if (marker) marker.id += ', ' + joint.id;
      else grouped.set(key, { id: joint.id, x: joint.x, y: joint.y });
    }
    return [...grouped.values()];
  }
  protected get viewBox() {
    const xs = this.body().joints.map((j) => j.x);
    const ys = this.body().joints.map((j) => j.y);
    return [
      Math.min(...xs) - 160,
      -Math.max(...ys) - 160,
      Math.max(...xs) - Math.min(...xs) + 320,
      Math.max(...ys) - Math.min(...ys) + 320,
    ].join(' ');
  }
  protected get interiorCoordinates() {
    const e = this.body().joints[4];
    return `(${e.x / MODEL_SCALE}, ${e.y / MODEL_SCALE})`;
  }
  protected readonly moveInterior = () => {
    const body = this.body();
    const joint = body.joints[4];
    const shifted = joint.x === 3 * MODEL_SCALE;
    joint.x = (shifted ? 4 : 3) * MODEL_SCALE;
    joint.y = (shifted ? 1.5 : 1) * MODEL_SCALE;
    const properties = uniformMassProperties(body, 0.001 / MODEL_SCALE ** 2);
    body.CoM = properties.com;
    body.massMoI = properties.moi;
    body.reComputeDPath();
  };
}
