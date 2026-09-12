import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from './mechanism.service';
import { Mechanism } from '../model/mechanism/mechanism';
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

/** Optional, derived analysis: no URL fields, undo entries, or changes to the animation solver. */
@Injectable({ providedIn: 'root' })
export class InstantCenterService {
  private mechanism = inject(MechanismService);
  readonly show = new BehaviorSubject(false);
  readonly showConstruction = new BehaviorSubject(false);
  private revision = -1;
  private drawing: { machine: string; geometry: CenterGeometry }[] = [];

  at(mechanism: Mechanism, index: number): InstantCenterRates | undefined {
    return instantCenterRatesAt(mechanism, index);
  }

  /** Geometry follows the displayed, interpolated pose, separately from sampled velocity readouts. */
  displayed(): { machine: string; geometry: CenterGeometry }[] {
    if (this.revision === this.mechanism.poseRevision) return this.drawing;
    this.revision = this.mechanism.poseRevision;
    this.drawing = this.mechanism.partitions.flatMap((partition, index) => {
      if (!this.mechanism.mechanisms[index]?.isMechanismValid()) return [];
      const jointIds = new Set(partition.joints.map((joint) => joint.id));
      const linkIds = new Set(partition.links.map((link) => link.id));
      return [
        {
          machine: partition.id,
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
