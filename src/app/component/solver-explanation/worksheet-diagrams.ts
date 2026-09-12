import { Diagram, DiagramPoint } from './solver-diagram.component';
import { BodyExplanation, BodyLoad } from '../../model/mechanism/solver-explanation';
import { Mechanism } from '../../model/mechanism/mechanism';
import { PrisJoint, RealJoint } from '../../model/joint';

const orange = 'var(--warning)';

function hull(points: DiagramPoint[]): DiagramPoint[] {
  const sorted = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()].sort(
    (a, b) => a.x - b.x || a.y - b.y
  );
  if (sorted.length < 3) return sorted;
  const cross = (a: DiagramPoint, b: DiagramPoint, c: DiagramPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (list: DiagramPoint[]) => {
    const result: DiagramPoint[] = [];
    for (const p of list) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 0) result.pop();
      result.push(p);
    }
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}

export function mechanismDiagram(mechanism: Mechanism, step: number): Diagram {
  return {
    points: mechanism.joints[step]
      .filter((j) => !(j instanceof PrisJoint))
      .map((j) => ({ x: j.x, y: j.y, label: j.id, ground: j instanceof RealJoint && j.ground })),
    lines: mechanism.links[step]
      .filter((l) => l.joints.length === 2)
      .map((l) => ({ from: l.joints[0], to: l.joints[1], width: 3 })),
    outlines: mechanism.links[step].filter((l) => l.joints.length > 2).map((l) => hull(l.joints)),
  };
}

export function freeBodyDiagram(
  body: BodyExplanation & {
    loads: (BodyLoad & { displayLabel: string })[];
    reference?: { id: string; label: string; point: number[] };
  },
  assumed: boolean,
  showReference = true
): Diagram {
  const centroid = {
    x: body.points.reduce((s, p) => s + p.x, 0) / body.points.length,
    y: body.points.reduce((s, p) => s + p.y, 0) / body.points.length,
  };
  const radius = Math.max(
    1,
    ...body.points.map((p) => Math.hypot(p.x - centroid.x, p.y - centroid.y))
  );
  const offset = Math.hypot(body.center[0] - centroid.x, body.center[1] - centroid.y) > radius * 2;
  // Some legacy CAD mass centers are far outside the outline. Keep the body readable,
  // mark CoM*, and retain the specified center in every moment calculation.
  const center = {
    x: offset ? centroid.x + radius * 1.25 : body.center[0],
    y: offset ? centroid.y + radius * 0.4 : body.center[1],
    label: offset ? 'CoM*' : 'CoM',
    reference: showReference && body.reference?.id === '@CoM',
  };
  const span = radius * 0.65;
  const outline = hull(body.points);
  const lines: Diagram['lines'] =
    outline.length === 2 ? [{ from: outline[0], to: outline[1], width: 3 }] : [];
  for (const load of body.loads) {
    const from = offset && load.kind === 'weight' ? center : { x: load.point[0], y: load.point[1] };
    if (load.couple !== undefined) {
      if (!assumed && Math.abs(load.couple) < 1e-10) continue;
      const sign = assumed ? (load.sign ?? 1) : Math.sign(load.couple);
      for (let i = 0; i < 12; i++) {
        const at = (j: number) => ({
          x: from.x + span * 0.48 * Math.cos(sign * ((j * Math.PI) / 8 + 0.4)),
          y: from.y + span * 0.48 * Math.sin(sign * ((j * Math.PI) / 8 + 0.4)),
        });
        lines.push({
          from: at(i),
          to: at(i + 1),
          arrow: i === 11,
          width: 1.7,
          color: orange,
          ...(i === 6 ? { label: load.displayLabel } : {}),
        });
      }
      continue;
    }
    const direction =
      assumed && load.direction ? load.direction.map((v) => v * (load.sign ?? 1)) : load.vector;
    const mag = Math.hypot(...direction);
    if (mag < 1e-10) continue;
    lines.push({
      from,
      to: { x: from.x + (span * direction[0]) / mag, y: from.y + (span * direction[1]) / mag },
      arrow: true,
      width: 1.7,
      color: orange,
      label: load.displayLabel,
    });
  }
  const points = body.points
    .filter((p, i, a) => a.findIndex((q) => q.x === p.x && q.y === p.y) === i)
    .map((p) => ({ ...p, label: p.id, reference: showReference && body.reference?.id === p.id }));
  for (const load of body.loads.filter((l) => l.applicationId)) {
    const existing = points.find(
      (p) => Math.hypot(p.x - load.point[0], p.y - load.point[1]) < 1e-9
    );
    if (existing) {
      existing.label += ` / ${load.applicationId}`;
      existing.reference ||= showReference && body.reference?.id === load.applicationId;
    } else
      points.push({
        id: load.applicationId!,
        x: load.point[0],
        y: load.point[1],
        label: load.applicationId!,
        reference: showReference && body.reference?.id === load.applicationId,
      });
  }
  if (body.rowCount === 2) {
    outline.splice(
      0,
      outline.length,
      ...[
        [-0.2, -0.13],
        [0.2, -0.13],
        [0.2, 0.13],
        [-0.2, 0.13],
      ].map(([x, y]) => ({ x: center.x + radius * x, y: center.y + radius * y }))
    );
  } else points.push(center as (typeof points)[number]);
  return {
    points,
    // Reserve room in both directions, even when a force is zero or reversed.
    framingPoints: [
      ...body.points,
      center,
      ...body.loads
        .filter((l) => l.kind === 'applied')
        .map((l) => ({ x: l.point[0], y: l.point[1] })),
    ].flatMap((p) => [
      { x: p.x - span, y: p.y - span },
      { x: p.x + span, y: p.y + span },
    ]),
    momentLabel: showReference && body.rowCount === 3 ? body.reference?.label : undefined,
    lines,
    outlines: outline.length > 2 ? [outline] : [],
    note: offset
      ? 'CoM* is placed schematically: the specified center of mass lies far outside this body. All moment arms use the specified center.'
      : undefined,
  };
}

export function constructionDiagram(
  point: DiagramPoint & { id: string },
  refs: (DiagramPoint & { id: string })[],
  radii: number[],
  candidates: number[][] = []
): Diagram {
  return {
    points: [
      ...refs.map((p) => ({ x: p.x, y: p.y, label: p.id })),
      ...candidates
        .filter(([x, y]) => Math.hypot(x - point.x, y - point.y) > 0.001)
        .map(([x, y], i) => ({ x, y, label: `P${i + 1}`, color: 'var(--text-tertiary)' })),
      { x: point.x, y: point.y, label: point.id, color: orange },
    ],
    lines: refs.map((p, i) => ({
      from: p,
      to: point,
      arrow: true,
      dashed: true,
      width: 1.2,
      label: `r${point.id}${p.id}`,
      midpointLabel: true,
      color: i ? 'var(--success)' : 'var(--brand)',
    })),
    circles: refs.flatMap((p, i) =>
      Number.isFinite(radii[i])
        ? [{ x: p.x, y: p.y, r: radii[i], color: i ? 'var(--success)' : 'var(--brand)' }]
        : []
    ),
  };
}
