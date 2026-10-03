import { PrisJoint } from '../joint';
import { Link } from '../link';
import type { Constraint } from './simultaneous-solver';

/**
 * Two pins of one rigid body on parallel fixed guides fix its heading.
 * At a perpendicular crossing the distance row loses this fact at first
 * order, although every continuous rigid motion still preserves it. Write
 * the implied heading explicitly so a permanent tangency does not masquerade
 * as an extra freedom in the position or differentiated-constraint solve.
 * This is a kinematic consequence, not a weld or an individual pin moment.
 */
export function parallelGuideHeadings(links: Link[], unknown: Set<string>): Constraint[] {
  const constraints: Constraint[] = [];
  for (const link of links) {
    const guides = link.joints.filter(
      (joint): joint is PrisJoint => joint instanceof PrisJoint && joint.ground && !joint.isFloating
    );
    let found = false;
    for (let a = 0; a < guides.length && !found; a++) {
      for (const second of guides.slice(a + 1)) {
        const first = guides[a];
        if (Math.abs(Math.sin(first.angle_rad - second.angle_rad)) > 1e-12) continue;
        if (!unknown.has(first.id) && !unknown.has(second.id)) continue;
        const dx = second.x - first.x,
          dy = second.y - first.y;
        const span = Math.hypot(dx, dy);
        if (span === 0) continue;
        constraints.push({
          kind: 'fixedDirection',
          a1: first.id,
          a2: second.id,
          dir: [dx / span, dy / span],
        });
        found = true;
        break;
      }
    }
  }
  return constraints;
}
