import { Injectable, inject } from '@angular/core';
import { Coord } from '../model/coord';
import { Joint, RealJoint } from '../model/joint';
import { Link } from '../model/link';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';

@Injectable({ providedIn: 'root' })
export class PlacementTargetService {
  private readonly mechanism = inject(MechanismService);

  target(point: Coord, source?: Joint | Link): RealJoint | undefined {
    const reach = 0.3 * SettingsService.objectScale;
    return this.mechanism
      .visibleJoints()
      .filter(
        (joint) =>
          joint !== source &&
          !this.mechanism.isPartInert(joint) &&
          !this.mechanism.attachRefusal(joint) &&
          !(source instanceof RealJoint && joint.links.some((link) => source.links.includes(link)))
      )
      .map((joint) => ({ joint, distance: Math.hypot(joint.x - point.x, joint.y - point.y) }))
      .filter(({ distance }) => distance <= reach)
      .sort((a, b) => a.distance - b.distance)[0]?.joint;
  }
}
