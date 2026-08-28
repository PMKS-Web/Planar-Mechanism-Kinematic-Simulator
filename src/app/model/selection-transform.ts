import { Coord } from './coord';
import { Force } from './force';
import { Joint, PrisJoint } from './joint';
import { Link, RealLink } from './link';
import { SelectedPart, selectableLinks } from './selection';
import { CanonicalSelectionClosure, canonicalSelectionClosure } from './selection-closure';

export { canonicalSelectionClosure } from './selection-closure';

export interface SelectionBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SelectionAffineTransform {
  translation?: { x: number; y: number };
  rotation?: number;
  scale?: number;
  pivot?: { x: number; y: number };
}

export type SelectionTransformResult =
  | { applied: true; lockedJointIds: [] }
  | { applied: false; lockedJointIds: string[]; reason?: 'invalid-transform' };

interface BodySnapshot {
  link: RealLink;
  from: { x: number; y: number }[];
  com: { x: number; y: number };
  forces: ForceSnapshot[];
  allJointsMove: boolean;
}

interface ForceSnapshot {
  force: Force;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function pointThroughFrame(
  point: { x: number; y: number },
  from: { x: number; y: number }[],
  to: readonly Joint[]
): { x: number; y: number } {
  if (from.length < 2 || to.length < 2) return point;
  const fromX = from[1].x - from[0].x;
  const fromY = from[1].y - from[0].y;
  const denominator = fromX * fromX + fromY * fromY;
  if (denominator === 0) {
    return { x: point.x + to[0].x - from[0].x, y: point.y + to[0].y - from[0].y };
  }
  const relativeX = point.x - from[0].x;
  const relativeY = point.y - from[0].y;
  const along = (relativeX * fromX + relativeY * fromY) / denominator;
  const across = (relativeY * fromX - relativeX * fromY) / denominator;
  const toX = to[1].x - to[0].x;
  const toY = to[1].y - to[0].y;
  return {
    x: to[0].x + along * toX - across * toY,
    y: to[0].y + along * toY + across * toX,
  };
}

function postOrderRealLinks(links: readonly Link[]): RealLink[] {
  const ordered: RealLink[] = [];
  const seen = new Set<RealLink>();
  const visit = (link: Link) => {
    if (!(link instanceof RealLink) || seen.has(link)) return;
    seen.add(link);
    link.subset.forEach(visit);
    ordered.push(link);
  };
  links.forEach(visit);
  return ordered;
}

/** A gesture-start snapshot. Every apply is cumulative input mapped from this immutable state. */
export class SelectionTransformSnapshot {
  readonly bounds: SelectionBounds;
  readonly pivot: Coord;
  readonly jointIds: Set<string>;
  readonly lockedJointIds: string[];
  readonly canTransform: boolean;

  private readonly jointStarts = new Map<string, { x: number; y: number }>();
  private readonly groundedSlotAngles = new Map<PrisJoint, number>();
  private readonly bodies: BodySnapshot[];
  private readonly visualOrder: RealLink[];

  constructor(
    readonly closure: CanonicalSelectionClosure,
    allLinks: readonly Link[]
  ) {
    this.jointIds = new Set(closure.jointIds);
    this.lockedJointIds = [...closure.lockedJointIds];
    this.canTransform = closure.canTransform;
    closure.joints.forEach((joint) => this.jointStarts.set(joint.id, { x: joint.x, y: joint.y }));
    closure.joints
      .filter((joint): joint is PrisJoint => joint instanceof PrisJoint && !joint.isFloating)
      .forEach((slot) => this.groundedSlotAngles.set(slot, slot.angle_rad));
    const xs = closure.joints.map((joint) => joint.x);
    const ys = closure.joints.map((joint) => joint.y);
    this.bounds = {
      minX: xs.length ? Math.min(...xs) : 0,
      minY: ys.length ? Math.min(...ys) : 0,
      maxX: xs.length ? Math.max(...xs) : 0,
      maxY: ys.length ? Math.max(...ys) : 0,
    };
    this.pivot = new Coord(
      (this.bounds.minX + this.bounds.maxX) / 2,
      (this.bounds.minY + this.bounds.maxY) / 2
    );
    const capturedForces = new Set<Force>();
    this.bodies = selectableLinks([...allLinks]).map((link) => ({
      link,
      from: link.joints.slice(0, 2).map((joint) => ({ x: joint.x, y: joint.y })),
      com: { x: link.CoM.x, y: link.CoM.y },
      forces: link.forces
        .filter((force) => {
          if (capturedForces.has(force)) return false;
          capturedForces.add(force);
          return true;
        })
        .map((force) => ({
          force,
          start: { x: force.startCoord.x, y: force.startCoord.y },
          end: { x: force.endCoord.x, y: force.endCoord.y },
        })),
      allJointsMove:
        link.joints.length > 0 && link.joints.every((joint) => this.jointIds.has(joint.id)),
    }));
    this.visualOrder = postOrderRealLinks(allLinks);
  }

  apply(transform: SelectionAffineTransform): SelectionTransformResult {
    if (this.lockedJointIds.length > 0) {
      return { applied: false, lockedJointIds: [...this.lockedJointIds] };
    }
    const translation = transform.translation ?? { x: 0, y: 0 };
    const rotation = transform.rotation ?? 0;
    const scale = transform.scale ?? 1;
    const pivot = transform.pivot ?? this.pivot;
    if (
      ![translation.x, translation.y, rotation, scale, pivot.x, pivot.y].every(Number.isFinite) ||
      !(scale > 0)
    ) {
      return { applied: false, lockedJointIds: [], reason: 'invalid-transform' };
    }
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const mapPoint = (point: { x: number; y: number }) => {
      const x = (point.x - pivot.x) * scale;
      const y = (point.y - pivot.y) * scale;
      return {
        x: pivot.x + x * cos - y * sin + translation.x,
        y: pivot.y + x * sin + y * cos + translation.y,
      };
    };

    this.closure.joints.forEach((joint) => {
      const start = this.jointStarts.get(joint.id)!;
      const at = mapPoint(start);
      joint.x = at.x;
      joint.y = at.y;
    });
    this.groundedSlotAngles.forEach((angle, slot) => {
      slot.angle_rad = angle + rotation;
    });
    this.bodies.forEach((body) => this.applyBody(body, mapPoint));
    this.visualOrder
      .filter((link) => link.joints.some((joint) => this.jointIds.has(joint.id)))
      .forEach((link) => link.reComputeDPath());
    return { applied: true, lockedJointIds: [] };
  }

  private applyBody(
    body: BodySnapshot,
    mapPoint: (point: { x: number; y: number }) => { x: number; y: number }
  ): void {
    if (!body.link.joints.some((joint) => this.jointIds.has(joint.id))) return;
    const place = (point: { x: number; y: number }) =>
      body.allJointsMove ? mapPoint(point) : pointThroughFrame(point, body.from, body.link.joints);
    body.forces.forEach(({ force, start, end }) => {
      const nextStart = place(start);
      const nextEnd = place(end);
      force.moveAnchor(new Coord(nextStart.x, nextStart.y));
      force.moveDirectionHandle(new Coord(nextEnd.x, nextEnd.y));
    });
    const com = body.link.comIsCustom
      ? place(body.com)
      : RealLink.determineCenterOfMass(body.link.joints);
    body.link.CoM = new Coord(com.x, com.y);
    if (body.link.comIsCustom) body.link.captureComOffset();
    body.link.updateCoMDs();
    body.link.updateLengthAndAngle();
  }
}

export function captureSelectionTransform(
  selected: readonly SelectedPart[],
  joints: readonly Joint[],
  links: readonly Link[]
): SelectionTransformSnapshot {
  return new SelectionTransformSnapshot(canonicalSelectionClosure(selected, joints, links), links);
}
