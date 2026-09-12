import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  inject,
  input,
  OnDestroy,
  signal,
} from '@angular/core';
import { Link, RealLink } from '../../model/link';
import { massGeometryOf } from '../../model/mass-geometry';
import { MassGeometryPreviewService } from '../../services/mass-geometry-preview.service';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

const descriptions = {
  rod: {
    name: 'Uniform slender rod',
    detail:
      'Mass is uniform along the centerline between the farthest pair of joints. Displayed width and rounded ends are not included. Collinear extra joints use the same segment.',
  },
  plate: {
    name: 'Uniform convex plate',
    detail:
      'Mass is uniform over the straight-edged convex hull of the joint positions. Interior joints add no material. Moving an interior joint within the hull leaves this domain unchanged. Joint positions cannot define a concave mass boundary: the hull fills any indentation.',
  },
  point: {
    name: 'Point mass',
    detail:
      'Mass is concentrated at one location with zero rotational inertia. Coincident joints and slider blocks use this idealization; their displayed size adds no mass extent.',
  },
};

@Component({
  selector: 'app-inertia-mass-model',
  imports: [CollapsibleSubsectionComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './inertia-mass-model.component.html',
  styleUrl: './inertia-explanation.component.scss',
})
export class InertiaMassModelComponent implements DoCheck, OnDestroy {
  readonly body = input.required<Link>();
  protected readonly opened = signal(false);
  protected readonly showing = signal(false);
  protected readonly preview = inject(MassGeometryPreviewService);
  private previousBody?: Link;
  protected get compound() {
    const body = this.body();
    return body instanceof RealLink && body.subset.length > 0;
  }
  protected get parts() {
    return massGeometryOf(this.body()).map((part, i) => ({
      ...descriptions[part.kind],
      label: `${i + 1}: ${part.body.name || part.body.id}`,
      custom: part.body instanceof RealLink && (part.body.comIsCustom || part.body.moiIsCustom),
    }));
  }
  protected get title() {
    return this.compound ? 'Combined member properties' : this.parts[0]?.name;
  }
  protected get custom() {
    const body = this.body();
    return body instanceof RealLink && (body.comIsCustom || body.moiIsCustom);
  }
  protected readonly toggle = () => {
    this.showing.update((value) => !value);
    this.activate();
  };
  protected activate() {
    if (this.opened() && this.showing()) this.preview.show(this, this.body());
    else this.preview.clear(this);
  }
  protected close() {
    this.opened.set(false);
    this.showing.set(false);
    this.preview.clear(this);
  }
  ngDoCheck() {
    if (this.previousBody !== this.body()) {
      this.previousBody = this.body();
      this.activate();
    }
  }
  ngOnDestroy() {
    this.preview.clear(this);
  }
}
