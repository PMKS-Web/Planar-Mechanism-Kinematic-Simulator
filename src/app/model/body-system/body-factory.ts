import { BodyDocument, emptyBodyDocument } from './body-document';
import { AttachmentId, BodyId, newRecordId } from './body-id';
import {
  Point,
  Pose,
  relativePose,
  worldToLocal,
  dot,
  cross,
  rotate,
  subtract,
  localToWorld,
  finitePoint,
  finitePose,
} from './body-frame';
import { Attachment, BodyJoint, PinJunction } from './joint-record';
import { GeometryVertex, MaterialBody } from './material-body';

/** A construction helper for fixtures and transaction candidates, never a second editor authority. */
export class BodyFactory {
  constructor(private value: BodyDocument = emptyBodyDocument()) {}

  get document(): BodyDocument {
    return this.value;
  }

  body(label: string, pose: Pose, points: readonly [Point, Point], width = 0.1): BodyId {
    if (
      !finitePose(pose) ||
      !points.every(finitePoint) ||
      !Number.isFinite(width) ||
      width <= 0 ||
      (points[0].x === points[1].x && points[0].y === points[1].y)
    ) {
      throw new Error('Invalid body geometry');
    }
    const id = newRecordId<'body'>();
    const body: MaterialBody = {
      id,
      kind: 'material',
      label,
      pose: { ...pose },
      geometry: {
        kind: 'bar',
        width,
        vertices: points.map((point) => ({
          ...point,
          id: newRecordId<'vertex'>(),
        })) as [GeometryVertex, GeometryVertex],
      },
      mass: {
        mass: { mode: 'explicit', value: 1 },
        inertia: { mode: 'automatic' },
        center: { mode: 'automatic' },
      },
      presentation: { fill: '#5c6bc0', hidden: false, showCenter: false },
    };
    this.value = { ...this.value, bodies: [...this.value.bodies, body] };
    return id;
  }

  attachment(bodyId: BodyId, point: Point, label = ''): AttachmentId {
    if (!finitePoint(point)) throw new Error('Invalid attachment point');
    if (!this.value.bodies.some((body) => body.id === bodyId))
      throw new Error('Missing attachment owner');
    const attachment: Attachment = {
      id: newRecordId<'attachment'>(),
      bodyId,
      point: { ...point },
      label,
      trace: false,
    };
    this.value = { ...this.value, attachments: [...this.value.attachments, attachment] };
    return attachment.id;
  }

  joint(kind: BodyJoint['kind'], a: AttachmentId, b: AttachmentId, worldAxis = 0): BodyJoint {
    if (!Number.isFinite(worldAxis)) throw new Error('Invalid joint axis');
    const anchorA = this.value.attachments.find((anchor) => anchor.id === a);
    const anchorB = this.value.attachments.find((anchor) => anchor.id === b);
    if (!anchorA || !anchorB || anchorA.bodyId === anchorB.bodyId)
      throw new Error('Joint needs two distinct owners');
    const poseA = this.value.bodies.find((body) => body.id === anchorA.bodyId)!.pose;
    const poseB = this.value.bodies.find((body) => body.id === anchorB.bodyId)!.pose;
    const pair = {
      id: newRecordId<'joint'>(),
      label: '',
      bodyA: anchorA.bodyId,
      bodyB: anchorB.bodyId,
      frameA: { attachmentId: a, angle: worldAxis - poseA.angle },
      frameB: { attachmentId: b, angle: worldAxis - poseB.angle },
    };
    const angleZero = poseB.angle - poseA.angle;
    const direction = rotate({ x: 1, y: 0 }, worldAxis);
    const displacement = subtract(
      localToWorld(poseB, anchorB.point),
      localToWorld(poseA, anchorA.point)
    );
    // Capture datums only from feasible anchors; a travel zero cannot repair a lateral offset.
    const tolerance =
      64 *
      Number.EPSILON *
      Math.max(
        ...[poseA, poseB, anchorA.point, anchorB.point, displacement].map((point) =>
          Math.hypot(point.x, point.y)
        )
      );
    if (
      (kind === 'revolute' && Math.hypot(displacement.x, displacement.y) > tolerance) ||
      ((kind === 'prismatic' || kind === 'pin-in-slot') &&
        Math.abs(cross(direction, displacement)) > tolerance)
    )
      throw new Error('Joint anchors do not satisfy the requested connection');
    const travelZero = dot(direction, displacement);
    const joint: BodyJoint =
      kind === 'weld'
        ? { ...pair, kind, rest: relativePose(poseA, poseB) }
        : kind === 'revolute'
          ? { ...pair, kind, angleZero }
          : { ...pair, kind, angleZero, travelZero };
    this.value = { ...this.value, joints: [...this.value.joints, joint] };
    return joint;
  }

  junction(bodyIds: readonly BodyId[], worldPoint: Point): PinJunction {
    if (!finitePoint(worldPoint)) throw new Error('Invalid pin point');
    if (bodyIds.length < 2 || new Set(bodyIds).size !== bodyIds.length)
      throw new Error('A pin needs distinct bodies');
    if (bodyIds.some((id) => !this.value.bodies.some((body) => body.id === id)))
      throw new Error('Missing pin member');
    const attachments = bodyIds.map((id) => {
      const body = this.value.bodies.find((candidate) => candidate.id === id);
      if (!body) throw new Error('Missing pin member');
      return this.attachment(id, worldToLocal(body.pose, worldPoint));
    });
    const hub = attachments[0];
    const joints = attachments
      .slice(1)
      .map((attachment) => this.joint('revolute', hub, attachment).id);
    const junction: PinJunction = { id: newRecordId<'junction'>(), hub, attachments, joints };
    this.value = { ...this.value, junctions: [...this.value.junctions, junction] };
    return junction;
  }
}
