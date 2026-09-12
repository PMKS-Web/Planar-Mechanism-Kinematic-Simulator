import { BodyId, VertexId } from '../../model/body-system/body-id';
import { Point } from '../../model/body-system/body-frame';
import { MaterialBody } from '../../model/body-system/material-body';
import { JointData, LinkData, LINK_TYPE } from './transcoder-data';

export const legacyBodyId = (id: string) => `production:body:${encodeURIComponent(id)}` as BodyId;

/** Choose material frames once; no runtime link or joint instances survive the import. */
export function legacyMaterial(
  link: LinkData,
  joints: readonly JointData[],
  width: number
): MaterialBody {
  const points = link.jointIDs.map((id) => joints.find((j) => j.id === id)!);
  if (!points.length) throw new Error('A production link has no material points.');
  const origin = [...points].sort((a, b) => a.id.localeCompare(b.id))[0];
  const vertices = hull(points).map((p, i) => ({
    x: p.x - origin.x,
    y: p.y - origin.y,
    id: `production:vertex:${encodeURIComponent(link.id)}:${i}` as VertexId,
  }));
  const center = { x: link.xCoM - origin.x, y: link.yCoM - origin.y };
  // A legacy slider's zero-length CD is its material block, never a mass on the P constraint.
  const geometry: MaterialBody['geometry'] =
    vertices.length === 1
      ? { kind: 'circle', center: { x: vertices[0].x, y: vertices[0].y }, radius: width / 2 }
      : vertices.length === 2
        ? { kind: 'bar', vertices: [vertices[0], vertices[1]], width }
        : { kind: 'polygon', vertices };
  return {
    kind: 'material',
    id: legacyBodyId(link.id),
    label: link.name,
    pose: { x: origin.x, y: origin.y, angle: 0 },
    geometry,
    mass: {
      mass: { mode: 'explicit', value: link.mass },
      inertia: link.moiIsCustom ? { mode: 'explicit', value: link.massMoI } : { mode: 'automatic' },
      center:
        link.type === LINK_TYPE.PISTON
          ? { mode: 'explicit', point: { x: 0, y: 0 }, editAnchor: 'body' }
          : link.comIsCustom
            ? { mode: 'explicit', point: center, editAnchor: 'body' }
            : { mode: 'automatic' },
    },
    presentation: {
      fill: /^#[0-9a-f]{6}$/i.test(link.color) ? link.color : '#5c6bc0',
      hidden: false,
      showCenter: false,
      ...(link.isCircle ? { outline: 'circle' as const } : {}),
    },
  };
}
function hull(points: readonly Point[]): Point[] {
  const sorted = [...new Map(points.map((p) => [`${p.x},${p.y}`, p])).values()].sort(
    (a, b) => a.x - b.x || a.y - b.y
  );
  if (sorted.length < 3) return sorted;
  const half = (items: readonly Point[]) => {
    const result: Point[] = [];
    for (const c of items) {
      while (result.length > 1) {
        const a = result[result.length - 2],
          b = result[result.length - 1];
        if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0) break;
        result.pop();
      }
      result.push(c);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
