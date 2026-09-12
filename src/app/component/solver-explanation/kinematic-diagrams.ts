import { Mechanism } from '../../model/mechanism/mechanism';
import { Diagram } from './solver-diagram.component';
import { mechanismDiagram } from './worksheet-diagrams';

/** Body geometry is independent of the chosen positive angular direction. */
export function angularConventionDiagram(
  mechanism: Mechanism,
  step: number,
  signs: Record<string, number>,
  only?: string
): Diagram {
  const base = mechanismDiagram(mechanism, step);
  const links = mechanism.links[step].filter(
    (l) => signs[l.id] !== undefined && (!only || l.id === only)
  );
  const rotations = links.map((link) => ({
    x: link.joints.reduce((sum, j) => sum + j.x, 0) / link.joints.length,
    y: link.joints.reduce((sum, j) => sum + j.y, 0) / link.joints.length,
    sign: signs[link.id],
    label: link.id,
  }));
  const ids = new Set(links.flatMap((l) => l.joints.map((j) => j.id)));
  const points = only ? base.points.filter((p) => ids.has(p.label!)) : base.points;
  // Fixed symmetric padding also reserves room for the curved reference arrows.
  const span = Math.max(
    1,
    ...points.flatMap((p) => points.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))
  );
  return {
    ...base,
    points,
    lines: only
      ? links
          .filter((l) => l.joints.length === 2)
          .map((l) => ({ from: l.joints[0], to: l.joints[1], width: 3 }))
      : base.lines,
    outlines: only
      ? base.outlines?.filter((outline) =>
          outline.every((p) => points.some((q) => p.x === q.x && p.y === q.y))
        )
      : base.outlines,
    framingPoints: points.flatMap((p) => [
      { x: p.x - span * 0.16, y: p.y - span * 0.16 },
      { x: p.x + span * 0.16, y: p.y + span * 0.16 },
    ]),
    rotations,
    legend: 'Arrows define positive ω and α',
  };
}
