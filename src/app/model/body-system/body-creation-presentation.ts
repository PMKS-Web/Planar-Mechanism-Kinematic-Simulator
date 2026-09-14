import { BodyDocument } from './body-document';
import { localToWorld } from './body-frame';

/** New material uses the familiar pin names and starts massless until the author gives it mass. */
export function bodyCreationPresentation(
  before: BodyDocument,
  candidate: BodyDocument
): BodyDocument {
  const oldBodies = new Set(before.bodies.map((body) => body.id));
  const oldPoints = new Set(before.attachments.map((point) => point.id));
  const inside = new Set(
    candidate.assemblies.flatMap((assembly) => {
      const joint = candidate.joints.find((joint) => joint.id === assembly.internalJoint)!;
      return [joint.frameA.attachmentId, joint.frameB.attachmentId];
    })
  );
  const used = new Set(candidate.attachments.map((point) => point.label));
  const name = () => {
    let index = 0;
    const letters = (index: number): string =>
      index < 26
        ? String.fromCharCode(65 + index)
        : letters(Math.floor(index / 26) - 1) + letters(index % 26);
    while (used.has(letters(index))) index++;
    const label = letters(index);
    used.add(label);
    return label;
  };
  const placed = before.attachments
    .filter((point) => point.label)
    .map((point) => ({
      ...localToWorld(before.bodies.find((body) => body.id === point.bodyId)!.pose, point.point),
      label: point.label,
    }));
  const attachments = candidate.attachments.map((point) => {
    if (oldPoints.has(point.id) || inside.has(point.id) || point.label) return point;
    const at = localToWorld(
      candidate.bodies.find((body) => body.id === point.bodyId)!.pose,
      point.point
    );
    const label =
      placed.find((other) => Math.hypot(other.x - at.x, other.y - at.y) < 1e-9)?.label ?? name();
    placed.push({ ...at, label });
    return { ...point, label };
  });
  return {
    ...candidate,
    attachments,
    bodies: candidate.bodies.map((body) => {
      if (body.kind !== 'material' || oldBodies.has(body.id)) return body;
      const assembly = candidate.assemblies.find(
        (assembly) => assembly.barrel === body.id || assembly.rod === body.id
      );
      return {
        ...body,
        label: assembly
          ? body.label
          : attachments
              .filter((point) => point.bodyId === body.id)
              .map((point) => point.label)
              .join(''),
        mass: { ...body.mass, mass: { mode: 'explicit', value: 0 } },
      };
    }),
  };
}
