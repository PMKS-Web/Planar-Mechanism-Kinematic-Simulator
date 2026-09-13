import { BodyDocument } from './body-document';
import { BodySelectionRef } from './body-edit-types';
import { AttachmentId, JointId, WORLD } from './body-id';
import { Point, add, localToWorld, rotate } from './body-frame';
import { BodyJoint, JointCoordinateRef } from './joint-record';

export interface BodyJointMark {
  readonly key: string;
  readonly kind: BodyJoint['kind'] | 'attachment';
  readonly target: BodySelectionRef;
  readonly jointIds: readonly JointId[];
  readonly point: Point;
  readonly angle: number;
  readonly grounded: boolean;
  readonly driveSpeed?: number;
  readonly label: string;
  readonly attachmentId?: AttachmentId;
  readonly coordinate?: JointCoordinateRef;
  readonly rider?: Point;
  readonly guide?: readonly [Point, Point];
}

/** Material attachments own the coordinates; glyph stations never become solver anchors. */
export function bodyJointMarks(document: BodyDocument): readonly BodyJointMark[] {
  const bodies = new Map(document.bodies.map((b) => [b.id, b]));
  const attachments = new Map(document.attachments.map((a) => [a.id, a]));
  const at = (id: AttachmentId) => {
    const a = attachments.get(id)!;
    return localToWorld(bodies.get(a.bodyId)!.pose, a.point);
  };
  const used = new Set(
    document.joints.flatMap((j) => [j.frameA.attachmentId, j.frameB.attachmentId])
  );
  const interior = new Set(
    document.assemblies.flatMap((c) => {
      const j = document.joints.find((j) => j.id === c.internalJoint)!;
      return [j.frameA.attachmentId, j.frameB.attachmentId];
    })
  );
  const marks: BodyJointMark[] = [];
  const shownPins = new Set<string>();
  for (const j of document.joints) {
    const junction = document.junctions.find((pin) => pin.joints.includes(j.id));
    if (j.kind === 'revolute' && junction && shownPins.has(junction.id)) continue;
    if (j.kind === 'revolute' && junction) shownPins.add(junction.id);
    const assembly = document.assemblies.find((c) => c.internalJoint === j.id);
    const target: BodySelectionRef = assembly
      ? { kind: 'assembly', id: assembly.id }
      : junction
        ? { kind: 'junction', id: junction.id }
        : { kind: 'joint', id: j.id };
    const base = {
      key: j.id,
      target,
      jointIds: junction?.joints ?? [j.id],
      label: j.label,
      grounded:
        j.bodyA === WORLD ||
        j.bodyB === WORLD ||
        !!junction?.attachments.some((id) => attachments.get(id)?.bodyId === WORLD),
      driveSpeed: document.drivers.find((d) =>
        (junction?.joints ?? [j.id]).includes(d.coordinate.jointId)
      )?.profile.speed,
      attachmentId: j.frameB.attachmentId,
    };
    if (j.kind === 'revolute' || j.kind === 'weld') {
      marks.push({ ...base, kind: j.kind, point: at(j.frameA.attachmentId), angle: 0 });
      continue;
    }
    const display = j.guideDisplay ?? { bodyId: j.bodyA, frame: j.frameA };
    const owner = bodies.get(display.bodyId)!;
    const anchor = attachments.get(display.frame.attachmentId)!;
    const offset = rotate(
      { x: display.station ?? 0, y: display.normalOffset ?? 0 },
      display.frame.angle
    );
    const station = localToWorld(owner.pose, add(anchor.point, offset));
    const angle = owner.pose.angle + display.frame.angle;
    const axis = bodies.get(j.bodyA)!.pose.angle + j.frameA.angle;
    const rider = at(j.frameB.attachmentId);
    const guideAt = (distance: number) =>
      localToWorld(
        owner.pose,
        add(
          anchor.point,
          rotate({ x: distance, y: display.normalOffset ?? 0 }, display.frame.angle)
        )
      );
    const extent = 1.5 * document.settings.objectScale;
    const from = display.from ?? (display.station ?? 0) - extent;
    const to = display.to ?? (display.station ?? 0) + extent;
    marks.push({
      ...base,
      kind: j.kind,
      point: j.kind === 'prismatic' ? station : rider,
      angle: j.kind === 'prismatic' ? angle : axis,
      coordinate: { jointId: j.id, coordinate: 'travel' },
      rider,
      guide: [guideAt(from), guideAt(to)],
    });
  }
  for (const a of document.attachments) {
    if (interior.has(a.id) || used.has(a.id)) continue;
    marks.push({
      key: a.id,
      kind: 'attachment',
      target: { kind: 'attachment', id: a.id },
      jointIds: [],
      point: at(a.id),
      angle: 0,
      grounded: false,
      label: a.label,
      attachmentId: a.id,
    });
  }
  return marks;
}

export function jointKindLabel(kind: BodyJoint['kind']): string {
  return {
    revolute: 'Revolute',
    prismatic: 'Prismatic',
    'pin-in-slot': 'Pin-in-slot',
    weld: 'Weld',
  }[kind];
}
