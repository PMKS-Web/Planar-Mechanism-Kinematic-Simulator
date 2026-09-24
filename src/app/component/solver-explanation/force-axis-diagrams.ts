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

/** Place every position vector for one free body on one separated projection grid. */
export function positionVectorGridDiagram(
  body: Diagram,
  products: { point: string; diagram: Diagram }[]
): Diagram {
  const targets = products
    .map((product) => {
      const reference = product.diagram.points.find((point) => point.reference);
      const target =
        product.diagram.points.find((point) => !point.reference) ??
        (reference ? { ...reference, label: product.point } : undefined);
      return reference && target ? { label: product.point, reference, target } : undefined;
    })
    .filter((value): value is NonNullable<typeof value> => !!value)
    .sort(
      (a, b) =>
        Math.hypot(a.target.x - a.reference.x, a.target.y - a.reference.y) -
        Math.hypot(b.target.x - b.reference.x, b.target.y - b.reference.y)
    );
  const geometry = [
    ...body.points,
    ...(body.outlines ?? []).flat(),
    ...body.lines.flatMap((line) => [line.from, line.to]),
    ...targets.flatMap(({ reference, target }) => [reference, target]),
  ];
  const minX = Math.min(...geometry.map((point) => point.x));
  const maxX = Math.max(...geometry.map((point) => point.x));
  const minY = Math.min(...geometry.map((point) => point.y));
  const maxY = Math.max(...geometry.map((point) => point.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const lines: Diagram['lines'] = targets.flatMap(({ label, reference, target }, index) => {
    if (Math.abs(target.x - reference.x) < 1e-12 && Math.abs(target.y - reference.y) < 1e-12)
      return [];
    const xRail = minY - span * (0.22 + index * 0.16);
    const yRail = maxX + span * (0.22 + index * 0.16);
    return [
      {
        from: { x: reference.x, y: xRail },
        to: { x: target.x, y: xRail },
        label: 'r_' + label + '/' + (reference.label ?? 'ref') + ',x',
        dashed: true,
        arrow: true,
        arrowStart: true,
        color: 'var(--success)',
        width: 1.4,
        midpointLabel: true,
      },
      {
        from: { x: yRail, y: reference.y },
        to: { x: yRail, y: target.y },
        label: 'r_' + label + '/' + (reference.label ?? 'ref') + ',y',
        dashed: true,
        arrow: true,
        arrowStart: true,
        color: 'var(--brand)',
        width: 1.4,
        labelPoint: { x: yRail - span * 0.08, y: (reference.y + target.y) / 2 },
      },
      {
        from: reference,
        to: { x: reference.x, y: xRail },
        dashed: true,
        color: 'var(--text-tertiary)',
        width: 0.9,
      },
      {
        from: target,
        to: { x: target.x, y: xRail },
        dashed: true,
        color: 'var(--text-tertiary)',
        width: 0.9,
      },
      {
        from: reference,
        to: { x: yRail, y: reference.y },
        dashed: true,
        color: 'var(--text-tertiary)',
        width: 0.9,
      },
      {
        from: target,
        to: { x: yRail, y: target.y },
        dashed: true,
        color: 'var(--text-tertiary)',
        width: 0.9,
      },
    ];
  });
  return {
    axisAngle: body.axisAngle,
    axisMomentLabel: body.axisMomentLabel,
    legend: 'Moment-arm component grid',
    points: body.points,
    outlines: body.outlines,
    // Retain the isolated free body; thicken the two-joint link so it stays
    // distinguishable from the projection guides and force arrows.
    lines: [
      ...body.lines.map((line) => (!line.arrow && line.width === 3 ? { ...line, width: 5 } : line)),
      ...lines,
    ],
    momentLabel: body.momentLabel,
    note: body.note,
    framingPoints: [
      { x: minX - span * 0.08, y: minY - span * (0.35 + targets.length * 0.16) },
      { x: maxX + span * (0.35 + targets.length * 0.16), y: maxY + span * 0.08 },
    ],
  };
}
