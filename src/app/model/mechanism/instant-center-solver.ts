import { Joint, PrisJoint, RealJoint } from '../joint';
import { Link } from '../link';
import { GROUND_BODY } from '../actuator';
import { slideAssemblies, assemblyBodyIds } from '../slide-assembly';
import { groupRigidBodies } from '../rigid-bodies';

/** Homogeneous coordinates keep translation (w = 0) distinct from a failed construction. */
export type ProjectivePoint = [number, number, number];
export interface PairCenter {
  id: string;
  bodies: [string, string];
  kind: 'fixed' | 'permanent' | 'secondary';
  location: 'finite' | 'infinite' | 'unresolved';
  point?: ProjectivePoint;
  /** The two Kennedy lines, each named by its two known centers. */
  construction?: [[string, string], [string, string]];
}
export interface CenterGeometry {
  bodies: string[];
  /** Original link ids map to one rigid body, including welded slider blocks. */
  bodyOf: Map<string, string>;
  centers: PairCenter[];
  origin: [number, number];
  scale: number;
}

export function centerId(a: string, b: string): string {
  return JSON.stringify([a, b].sort());
}

function cross(a: ProjectivePoint, b: ProjectivePoint): ProjectivePoint {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalized(p: ProjectivePoint): ProjectivePoint | undefined {
  const size = Math.hypot(...p);
  if (!Number.isFinite(size) || size < 1e-10) return undefined;
  return p.map((x) => x / size) as ProjectivePoint;
}

/**
 * Reworks PMKSConversion's ICSolver (0bda849) for today's bodies and slots.
 * Primary centers come from joints; secondary centers intersect two Kennedy
 * lines. No positions or rates are borrowed from the closed-loop rate solver.
 * Pair keys replace substring matching, and projective intersections replace
 * slopes, so vertical lines and centers at infinity need no special guesses.
 */
export function determineInstantCenters(joints: Joint[], links: Link[]): CenterGeometry {
  const bodyOf = groupRigidBodies(links, slideAssemblies(joints).map(assemblyBodyIds));
  const representative = (id: string): string => {
    const next = bodyOf.get(id);
    return next && next !== id ? representative(next) : id;
  };
  const merge = (ids: string[]) => {
    const roots = [...new Set(ids.map(representative))].sort();
    const root = roots.includes(GROUND_BODY) ? GROUND_BODY : roots[0];
    roots.forEach((id) => bodyOf.set(id, root));
  };
  // A frame link joining two fixed pins is the same body as the world.
  for (const link of links) {
    const fixed = link.joints.filter(
      (j) => j instanceof RealJoint && !(j instanceof PrisJoint) && j.ground
    );
    if (fixed.some((a) => fixed.some((b) => Math.hypot(a.x - b.x, a.y - b.y) > 1e-9))) {
      merge([link.id, GROUND_BODY]);
    }
  }
  for (const id of bodyOf.keys()) bodyOf.set(id, representative(id));
  const bodies = [
    GROUND_BODY,
    ...new Set(links.map((l) => bodyOf.get(l.id)!).filter((id) => id !== GROUND_BODY)),
  ];
  const origin: [number, number] = joints.length ? [joints[0].x, joints[0].y] : [0, 0];
  const scale = Math.max(1e-9, ...joints.map((j) => Math.hypot(j.x - origin[0], j.y - origin[1])));
  const centers = new Map<string, PairCenter>();
  for (let i = 0; i < bodies.length; i++) {
    for (let k = i + 1; k < bodies.length; k++) {
      const pair: [string, string] = [bodies[i], bodies[k]];
      const id = centerId(...pair);
      centers.set(id, { id, bodies: pair, kind: 'secondary', location: 'unresolved' });
    }
  }
  const seed = (ids: string[], point: ProjectivePoint) => {
    const pairBodies = [...new Set(ids.map(representative))];
    for (let i = 0; i < pairBodies.length; i++) {
      for (let k = i + 1; k < pairBodies.length; k++) {
        const center = centers.get(centerId(pairBodies[i], pairBodies[k]));
        if (!center) continue;
        center.point = normalized(point);
        center.kind = center.bodies.includes(GROUND_BODY) ? 'fixed' : 'permanent';
        center.location = point[2] === 0 ? 'infinite' : 'finite';
      }
    }
  };
  for (const joint of joints) {
    if (!(joint instanceof RealJoint)) continue;
    // Resolve membership from this snapshot, never from an editable link pointer.
    const incident = links.filter((l) => l.joints.some((j) => j.id === joint.id)).map((l) => l.id);
    if (joint instanceof PrisJoint) {
      if (joint.isDangling || (joint.isFloating && !joint.isSlotWellFormed)) continue;
      seed(
        [...incident, joint.carrier?.id ?? GROUND_BODY],
        [-Math.sin(joint.slotAngle), Math.cos(joint.slotAngle), 0]
      );
    } else {
      if (joint.ground) incident.push(GROUND_BODY);
      seed(incident, [(joint.x - origin[0]) / scale, (joint.y - origin[1]) / scale, 1]);
    }
  }
  let progress = true;
  while (progress) {
    progress = false;
    for (const center of centers.values()) {
      if (center.point) continue;
      const lines: { point: ProjectivePoint; ids: [string, string] }[] = [];
      for (const third of bodies) {
        if (center.bodies.includes(third)) continue;
        const ids: [string, string] = [
          centerId(center.bodies[0], third),
          centerId(center.bodies[1], third),
        ];
        const a = centers.get(ids[0])?.point;
        const b = centers.get(ids[1])?.point;
        const line = a && b && normalized(cross(a, b));
        if (line) lines.push({ point: line, ids });
      }
      // Prefer the best separated lines, rather than the first almost-coincident pair.
      let best = 1e-10;
      for (let i = 0; i < lines.length; i++) {
        for (let k = i + 1; k < lines.length; k++) {
          const candidate = cross(lines[i].point, lines[k].point);
          const separation = Math.hypot(...candidate);
          if (separation <= best) continue;
          best = separation;
          center.point = normalized(candidate);
          center.construction = [lines[i].ids, lines[k].ids];
        }
      }
      if (center.point) {
        center.location = Math.abs(center.point[2]) < 1e-10 ? 'infinite' : 'finite';
        if (center.location === 'infinite') center.point[2] = 0;
        progress = true;
      }
    }
  }
  return { bodies, bodyOf, centers: [...centers.values()], origin, scale };
}

/** Drawing coordinates, only for finite centers. Infinity is a direction, never a huge SVG coordinate. */
export function finiteCenter(
  geometry: CenterGeometry,
  center: PairCenter
): { x: number; y: number } | undefined {
  if (center.location !== 'finite' || !center.point) return undefined;
  const [x, y, w] = center.point;
  return {
    x: geometry.origin[0] + (geometry.scale * x) / w,
    y: geometry.origin[1] + (geometry.scale * y) / w,
  };
}
