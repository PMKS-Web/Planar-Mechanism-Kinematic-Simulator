import { axisCoordinates } from '../../model/mechanism/force-axes';
import { Diagram, DiagramPoint } from './solver-diagram.component';

/** Keep the mechanism in its world pose while drawing vectors measured in the worksheet frame. */
export function worldForceDiagram(diagram: Diagram, angle: number): Diagram {
  const point = (p: DiagramPoint) => {
    const [x, y] = axisCoordinates([p.x, p.y], -angle);
    return { ...p, x, y };
  };
  // Each source anchor reserved a square. Rotating its center, not its corners,
  // keeps the viewport unchanged when only the worksheet axes change.
  const framingPoints = diagram.framingPoints?.flatMap((p, i, a) => {
    if (i % 2) return [];
    const q = a[i + 1];
    const center = point({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    const span = (q.x - p.x) / 2;
    return [
      { x: center.x - span, y: center.y - span },
      { x: center.x + span, y: center.y + span },
    ];
  });
  return {
    ...diagram,
    axisAngle: angle,
    framingPoints,
    points: diagram.points.map(point),
    outlines: diagram.outlines?.map((outline) => outline.map(point)),
    lines: diagram.lines.map((line) => ({ ...line, from: point(line.from), to: point(line.to) })),
  };
}

export function momentArmDiagram(
  from: number[],
  to: number[],
  reference: string,
  target: string,
  angle: number
): Diagram {
  const start = { x: from[0], y: from[1], label: reference, reference: true };
  const end = { x: to[0], y: to[1], label: target };
  const elbow = { x: to[0], y: from[1] };
  const length = Math.max(1, Math.hypot(to[0] - from[0], to[1] - from[1]));
  const lines: Diagram['lines'] = [
    {
      from: start,
      to: end,
      label: 'r',
      color: 'var(--brand)',
      arrow: true,
      width: 1.5,
      midpointLabel: true,
    },
    {
      from: start,
      to: elbow,
      label: 'r_x',
      color: 'var(--success)',
      dashed: true,
      arrow: true,
      width: 1.5,
      midpointLabel: true,
    },
    {
      from: elbow,
      to: end,
      label: 'r_y',
      color: 'var(--warning)',
      dashed: true,
      arrow: true,
      width: 1.5,
      midpointLabel: true,
    },
  ].filter((line) => Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y) > 1e-10);
  return worldForceDiagram(
    {
      points: [start, ...(start.x === end.x && start.y === end.y ? [] : [end])],
      lines,
      framingPoints: [start, end].flatMap((p) => [
        { x: p.x - length * 0.2, y: p.y - length * 0.2 },
        { x: p.x + length * 0.2, y: p.y + length * 0.2 },
      ]),
    },
    angle
  );
}
