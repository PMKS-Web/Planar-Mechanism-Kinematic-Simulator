import { BodyDocument } from './body-document';
import { bodyForceEnds } from './body-force-edit';

export function bodyForceMarks(document: BodyDocument) {
  return document.forces.map((force) => {
    const [start, end] = bodyForceEnds(document, force);
    return {
      id: force.id,
      label: force.label,
      start,
      end,
      angle: Math.atan2(end.y - start.y, end.x - start.x),
      color: force.presentation?.color ?? 'var(--text-black)',
    };
  });
}
