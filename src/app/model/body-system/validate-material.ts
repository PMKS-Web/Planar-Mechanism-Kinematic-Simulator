import { ValidationContext } from './validation-context';
import { WORLD } from './body-id';
import { finitePoint, finitePose } from './body-frame';
import { validGeometry } from './body-geometry-validation';
import { MassSpecification } from './material-body';

export function validateMaterial(context: ValidationContext): void {
  const { document, bodies, issue } = context;
  if (!bodies.has(WORLD)) issue('missing-world', 'bodies');
  const vertices = new Set<string>();
  for (const body of document.bodies) {
    const path = `bodies.${body.id}`;
    if (!finitePose(body.pose)) issue('nonfinite-pose', path);
    if (body.kind === 'world') {
      if (body.id !== WORLD || body.pose.x !== 0 || body.pose.y !== 0 || body.pose.angle !== 0)
        issue('immutable-world', path);
      continue;
    }
    if (body.kind !== 'material' || body.id === WORLD) {
      issue('invalid-body-kind', path);
      continue;
    }
    if (!validGeometry(body.geometry)) issue('invalid-geometry', path);
    if (!validMass(body.mass)) issue('invalid-mass', path);
    if (body.geometry.kind === 'bar' && body.mass.mass.mode === 'density')
      issue('bar-needs-explicit-mass', path);
    if (body.geometry.kind !== 'circle')
      for (const vertex of body.geometry.vertices) {
        if (!vertex.id || vertices.has(vertex.id)) issue('duplicate-or-empty-vertex-id', path);
        vertices.add(vertex.id);
      }
  }
}

export function validateAttachments(context: ValidationContext): void {
  const { document, bodies, issue } = context;
  for (const anchor of document.attachments) {
    const body = bodies.get(anchor.bodyId);
    const path = `attachments.${anchor.id}`;
    if (!body) issue('missing-body', path);
    if (!finitePoint(anchor.point)) issue('nonfinite-point', path);
    if (anchor.vertexId) {
      const vertex =
        body?.kind === 'material' && body.geometry.kind !== 'circle'
          ? body.geometry.vertices.find((point) => point.id === anchor.vertexId)
          : undefined;
      if (!vertex || vertex.x !== anchor.point.x || vertex.y !== anchor.point.y)
        issue('invalid-vertex-binding', path);
    }
  }
}

function validMass(mass: MassSpecification): boolean {
  return (
    ['explicit', 'density'].includes(mass.mass.mode) &&
    Number.isFinite(mass.mass.value) &&
    mass.mass.value >= 0 &&
    (mass.inertia.mode === 'automatic' ||
      (mass.inertia.mode === 'explicit' &&
        Number.isFinite(mass.inertia.value) &&
        mass.inertia.value >= 0)) &&
    (mass.center.mode === 'automatic' ||
      (mass.center.mode === 'explicit' &&
        finitePoint(mass.center.point) &&
        ['body', 'grid'].includes(mass.center.editAnchor)))
  );
}
