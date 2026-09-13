import { BodyDocument } from './body-document';
import { BodySelectionRef } from './body-edit-types';
import { localToWorld } from './body-frame';
import { nativeNumber } from './body-field-values';

/** Dimensions use the same displayed geometry as the inspector, including a paused draft. */
export function bodyDimensionMark(
  document: BodyDocument,
  selection: BodySelectionRef | undefined,
  kind: 'length' | 'angle' | undefined
) {
  if (!kind || selection?.kind !== 'body') return;
  const body = document.bodies.find((b) => b.id === selection.id);
  if (body?.kind !== 'material' || body.geometry.kind !== 'bar') return;
  const [a, b] = body.geometry.vertices.map((p) => localToWorld(body.pose, p));
  const angle = Math.atan2(b.y - a.y, b.x - a.x),
    length = Math.hypot(b.x - a.x, b.y - a.y),
    radius = length * 0.35;
  const at =
    kind === 'length' ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: a.x + radius, y: a.y };
  const label =
    kind === 'length'
      ? `${nativeNumber(length)} ${document.units.length}`
      : document.settings.angleUnit === 'deg'
        ? `${nativeNumber((angle * 180) / Math.PI)}°`
        : `${nativeNumber(angle)} rad`;
  const path =
    kind === 'length'
      ? `M ${a.x} ${a.y} L ${b.x} ${b.y}`
      : `M ${a.x + radius} ${a.y} A ${radius} ${radius} 0 0 ${angle >= 0 ? 1 : 0} ${a.x + radius * Math.cos(angle)} ${a.y + radius * Math.sin(angle)}`;
  return { at, label, path };
}
