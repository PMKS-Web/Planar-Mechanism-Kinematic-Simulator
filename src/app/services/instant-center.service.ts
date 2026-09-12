import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from './mechanism.service';
import { Mechanism } from '../model/mechanism/mechanism';
import { partitionKey } from '../model/mechanism/mechanism-partition';
import {
  determineInstantCenters,
  finiteCenter,
  CenterGeometry,
  PairCenter,
} from '../model/mechanism/instant-center-solver';
import {
  InstantCenterRates,
  instantCenterRatesAt,
} from '../model/mechanism/instant-center-kinematics';

export interface InstantCenterDrawing {
  machine: string;
  selectionKey: string;
  geometry: CenterGeometry;
}

/** Optional, derived analysis: no URL fields, undo entries, or changes to the animation solver. */
@Injectable({ providedIn: 'root' })
export class InstantCenterService {
  private mechanism = inject(MechanismService);
  readonly show = new BehaviorSubject(false);
  readonly showConstruction = new BehaviorSubject(false);
  private revision = -1;
  private drawing: InstantCenterDrawing[] = [];
  private readonly hidden = new Set<string>();

  selected(drawing: InstantCenterDrawing, center: PairCenter): boolean {
    return !this.hidden.has(JSON.stringify([drawing.selectionKey, center.id]));
  }

  toggle(drawing: InstantCenterDrawing, center: PairCenter): void {
    const key = JSON.stringify([drawing.selectionKey, center.id]);
    if (this.hidden.has(key)) this.hidden.delete(key);
    else this.hidden.add(key);
  }

  selectAll(selected: boolean): void {
    for (const drawing of this.displayed()) {
      for (const center of drawing.geometry.centers) {
        if (this.selected(drawing, center) !== selected) this.toggle(drawing, center);
      }
    }
  }

  selectedCenters(drawing: InstantCenterDrawing): PairCenter[] {
    return drawing.geometry.centers.filter((center) => this.selected(drawing, center));
  }

  at(mechanism: Mechanism, index: number): InstantCenterRates | undefined {
    return instantCenterRatesAt(mechanism, index);
  }

  /** Geometry follows the displayed, interpolated pose, separately from sampled velocity readouts. */
  displayed(): InstantCenterDrawing[] {
    if (this.revision === this.mechanism.poseRevision) return this.drawing;
    this.revision = this.mechanism.poseRevision;
    this.drawing = this.mechanism.partitions.flatMap((partition, index) => {
      if (!this.mechanism.mechanisms[index]?.isMechanismValid()) return [];
      const jointIds = new Set(partition.joints.map((joint) => joint.id));
      const linkIds = new Set(partition.links.map((link) => link.id));
      return [
        {
          machine: partition.id,
          selectionKey: partitionKey(partition),
          geometry: determineInstantCenters(
            this.mechanism.joints.filter((joint) => jointIds.has(joint.id)),
            this.mechanism.links.filter((link) => linkIds.has(link.id))
          ),
        },
      ];
    });
    return this.drawing;
  }

  label(center: PairCenter): string {
    return `I(${center.bodies.map((id) => (id === 'ground' ? '0' : id)).join(', ')})`;
  }

  point(geometry: CenterGeometry, center: PairCenter) {
    return finiteCenter(geometry, center);
  }
}
