import { DxfEntity, DxfLine, DxfPoint } from './dxf-model';

export interface SemanticAxis {
  start: DxfPoint;
  end: DxfPoint;
  startId: string;
  endId: string;
  key: string;
  label: string;
}

/** Join only opposed collinear members through a weld; branches remain a network. */
export function consolidateWeldedAxes(
  source: SemanticAxis[],
  weldedIds: Set<string>
): SemanticAxis[] {
  const axes = dedupeAxes(source);
  let changed = true;
  while (changed) {
    changed = false;
    for (const jointId of [...weldedIds].sort()) {
      const incident = axes
        .map((axis, index) => ({ axis, index }))
        .filter(({ axis }) => axis.startId === jointId || axis.endId === jointId);
      let pair:
        [{ axis: SemanticAxis; index: number }, { axis: SemanticAxis; index: number }] | null =
        null;
      for (let i = 0; i < incident.length && !pair; i++) {
        for (let j = i + 1; j < incident.length; j++) {
          if (opposedAt(incident[i].axis, incident[j].axis, jointId)) {
            pair = [incident[i], incident[j]];
            break;
          }
        }
      }
      if (!pair) continue;
      const first = outerEnd(pair[0].axis, jointId);
      const second = outerEnd(pair[1].axis, jointId);
      const merged: SemanticAxis = {
        start: first.point,
        end: second.point,
        startId: first.id,
        endId: second.id,
        key: `${pair[0].axis.key}+${pair[1].axis.key}`,
        label: `${pair[0].axis.label} / ${pair[1].axis.label}`,
      };
      const high = Math.max(pair[0].index, pair[1].index);
      const low = Math.min(pair[0].index, pair[1].index);
      axes.splice(high, 1);
      axes.splice(low, 1, merged);
      changed = true;
      break;
    }
  }
  return dedupeAxes(axes);
}

export function groundAnnotation(joint: DxfPoint, scale: number, layer: string): DxfEntity[] {
  const center = { x: joint.x, y: joint.y };
  const baseY = center.y - 0.16 * scale;
  const half = 0.2 * scale;
  const entities: DxfEntity[] = [
    {
      type: 'LINE',
      layer,
      start: { x: center.x - half, y: baseY },
      end: { x: center.x + half, y: baseY },
    },
  ];
  for (const offset of [-0.12, 0, 0.12]) {
    entities.push({
      type: 'LINE',
      layer,
      start: { x: center.x + offset * scale, y: baseY },
      end: { x: center.x + (offset - 0.07) * scale, y: baseY - 0.12 * scale },
    });
  }
  return entities;
}

export function inputAnnotation(
  joint: DxfPoint & { slotAngle?: number },
  clockwise: boolean,
  scale: number,
  layer: string
): DxfEntity[] {
  if (joint.slotAngle === undefined) {
    const direction = clockwise ? -1 : 1;
    const startAngle = clockwise ? Math.PI : 0;
    const radius = 0.34 * scale;
    const points = Array.from({ length: 7 }, (_, index) => {
      const angle = startAngle + (direction * (Math.PI * index)) / 6;
      return { x: joint.x + Math.cos(angle) * radius, y: joint.y + Math.sin(angle) * radius };
    });
    const tip = points.at(-1)!;
    const tipAngle = startAngle + direction * Math.PI;
    const tx = -Math.sin(tipAngle) * direction;
    const ty = Math.cos(tipAngle) * direction;
    const nx = -ty;
    const ny = tx;
    return [
      { type: 'LWPOLYLINE', layer, points, closed: false },
      {
        type: 'LINE',
        layer,
        start: tip,
        end: {
          x: tip.x - tx * 0.13 * scale + nx * 0.09 * scale,
          y: tip.y - ty * 0.13 * scale + ny * 0.09 * scale,
        },
      },
      {
        type: 'LINE',
        layer,
        start: tip,
        end: {
          x: tip.x - tx * 0.13 * scale - nx * 0.09 * scale,
          y: tip.y - ty * 0.13 * scale - ny * 0.09 * scale,
        },
      },
    ];
  }
  const angle = joint.slotAngle ?? 0;
  const direction = clockwise ? -1 : 1;
  const ux = Math.cos(angle) * direction;
  const uy = Math.sin(angle) * direction;
  const tip = { x: joint.x + ux * 0.42 * scale, y: joint.y + uy * 0.42 * scale };
  const nx = -uy;
  const ny = ux;
  return [
    { type: 'LINE', layer, start: { x: joint.x, y: joint.y }, end: tip },
    {
      type: 'LINE',
      layer,
      start: tip,
      end: {
        x: tip.x - ux * 0.13 * scale + nx * 0.1 * scale,
        y: tip.y - uy * 0.13 * scale + ny * 0.1 * scale,
      },
    },
    {
      type: 'LINE',
      layer,
      start: tip,
      end: {
        x: tip.x - ux * 0.13 * scale - nx * 0.1 * scale,
        y: tip.y - uy * 0.13 * scale - ny * 0.1 * scale,
      },
    },
  ];
}

export function forceEntities(
  force: { startCoord: DxfPoint; endCoord: DxfPoint },
  scale: number,
  layer: string
): DxfEntity[] {
  const start = { x: force.startCoord.x, y: force.startCoord.y };
  const end = { x: force.endCoord.x, y: force.endCoord.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-12)) return [{ type: 'POINT', layer, at: start }];
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const head = Math.min(0.25 * scale, length * 0.3);
  return [
    { type: 'LINE', layer, start, end },
    {
      type: 'LINE',
      layer,
      start: end,
      end: { x: end.x - ux * head + nx * head * 0.45, y: end.y - uy * head + ny * head * 0.45 },
    },
    {
      type: 'LINE',
      layer,
      start: end,
      end: { x: end.x - ux * head - nx * head * 0.45, y: end.y - uy * head - ny * head * 0.45 },
    },
  ];
}

export function extentTicks(axis: DxfLine, scale: number, layer: string): DxfLine[] {
  const dx = axis.end.x - axis.start.x;
  const dy = axis.end.y - axis.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * 0.12 * scale;
  const ny = (dx / length) * 0.12 * scale;
  return [axis.start, axis.end].map((point) => ({
    type: 'LINE',
    layer,
    start: { x: point.x - nx, y: point.y - ny },
    end: { x: point.x + nx, y: point.y + ny },
  }));
}

function opposedAt(first: SemanticAxis, second: SemanticAxis, at: string): boolean {
  const a = vectorFrom(first, at);
  const b = vectorFrom(second, at);
  const scale = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return (
    scale > 1e-12 && Math.abs(a.x * b.y - a.y * b.x) <= scale * 1e-9 && a.x * b.x + a.y * b.y < 0
  );
}

function vectorFrom(axis: SemanticAxis, at: string): DxfPoint {
  const from = axis.startId === at ? axis.start : axis.end;
  const to = axis.startId === at ? axis.end : axis.start;
  return { x: to.x - from.x, y: to.y - from.y };
}

function outerEnd(axis: SemanticAxis, junction: string): { point: DxfPoint; id: string } {
  return axis.startId === junction
    ? { point: axis.end, id: axis.endId }
    : { point: axis.start, id: axis.startId };
}

function dedupeAxes(axes: SemanticAxis[]): SemanticAxis[] {
  const seen = new Set<string>();
  return axes.filter((axis) => {
    const ids = [axis.startId, axis.endId].sort().join('|');
    const points = [pointKey(axis.start), pointKey(axis.end)].sort().join('|');
    const key = `${ids}:${points}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pointKey(point: DxfPoint): string {
  return `${point.x.toPrecision(12)},${point.y.toPrecision(12)}`;
}
