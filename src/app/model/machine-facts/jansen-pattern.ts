import { Joint } from '../joint';
import { Link } from '../link';
import { distAt, isGroundPin } from './fact-math';
import { jointsOf, RelationContext, turnsFully } from './relations';
import type { FamilyMatch } from './family-check';

/**
 * Match one connected leg before measuring its proportions. A pool of lengths
 * from unrelated loops can contain every holy number without containing a leg.
 * Extra legs may share the crank; joint names and drawing orientation do not
 * participate in recognition.
 */
export function jansenPattern(ctx: RelationContext): FamilyMatch | undefined {
  const binary = ctx.bodies.filter((body) => jointsOf(ctx, body).length === 2);
  const triangles = ctx.bodies.filter((body) => jointsOf(ctx, body).length === 3);
  const joins = (body: Link, a: Joint, b: Joint) => {
    const joints = jointsOf(ctx, body);
    return joints.includes(a) && joints.includes(b);
  };
  const other = (body: Link, point: Joint) => jointsOf(ctx, body).find((joint) => joint !== point)!;
  const near = (actual: number, expected: number) =>
    Math.abs(actual - expected) <= 0.015 * expected;
  for (const crank of binary.filter((body) => turnsFully(ctx, body))) {
    const ground = jointsOf(ctx, crank).find(isGroundPin);
    if (!ground) continue;
    const a = other(crank, ground);
    const scale = 15 / distAt(ctx.samples, ground, a);
    for (const ab of binary.filter((body) => body !== crank && jointsOf(ctx, body).includes(a))) {
      const b = other(ab, a);
      for (const upper of triangles.filter((body) => jointsOf(ctx, body).includes(b))) {
        const g = jointsOf(ctx, upper).find(isGroundPin);
        if (!g || g === ground) continue;
        const c = jointsOf(ctx, upper).find((point) => point !== g && point !== b)!;
        for (const ad of binary.filter(
          (body) => body !== crank && body !== ab && jointsOf(ctx, body).includes(a)
        )) {
          const d = other(ad, a);
          if (!binary.some((body) => joins(body, g, d))) continue;
          for (const ce of binary.filter((body) => jointsOf(ctx, body).includes(c))) {
            const e = other(ce, c);
            const lower = triangles.find((body) => body !== upper && joins(body, d, e));
            if (!lower) continue;
            const f = jointsOf(ctx, lower).find((point) => point !== d && point !== e)!;
            // These roles must be distinct: shared points collapse the leg graph.
            if (new Set([ground, a, g, b, c, d, e, f]).size !== 8) continue;
            const bars: [Joint, Joint, number][] = [
              [a, b, 50],
              [g, b, 41.5],
              [b, c, 55.8],
              [g, c, 40.1],
              [a, d, 61.9],
              [g, d, 39.3],
              [c, e, 39.4],
              [d, e, 36.7],
              [e, f, 65.7],
              [d, f, 49],
              [ground, g, Math.hypot(38, 7.8)],
            ];
            if (bars.every(([p, q, length]) => near(distAt(ctx.samples, p, q) * scale, length))) {
              return {
                family: 'Jansen linkage (Strandbeest leg)',
                basis:
                  "the connected crank, upper triangle and foot triangle match Jansen's ten leg lengths and ground spacing, scaled to a crank of 15",
              };
            }
          }
        }
      }
    }
  }
  return undefined;
}
