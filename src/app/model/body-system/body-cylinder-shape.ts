import { BodyDocument } from './body-document';
import { CylinderAssembly } from './assembly-record';
import { CylinderDimensions } from './cylinder-factory';
import { add, rotate, scale, subtract } from './body-frame';
import { GeometryVertex } from './material-body';
import { GuidedJoint } from './joint-record';

/** Outer material attachments stay put locally, so dimension edits do not rewrite weld rests. */
export function reshapeBodyCylinder(
  source: BodyDocument,
  assembly: CylinderAssembly,
  dimensions: CylinderDimensions
): BodyDocument | undefined {
  const points = new Map(source.attachments.map((p) => [p.id, p]));
  const internal = source.joints.find((j) => j.id === assembly.internalJoint) as GuidedJoint;
  const barrelMount = points.get(assembly.barrelMount)!,
    rodMount = points.get(assembly.rodMount)!;
  const members = new Map([
    [
      assembly.barrel,
      {
        mount: barrelMount,
        length: dimensions.barrelLength,
        oldLength: assembly.dimensions.barrelLength,
        width: dimensions.bore,
      },
    ],
    [
      assembly.rod,
      {
        mount: rodMount,
        length: dimensions.rodLength,
        oldLength: assembly.dimensions.rodLength,
        width: dimensions.rodDiameter,
      },
    ],
  ]);
  if (
    source.bodies.some(
      (body) => members.has(body.id) && (body.kind !== 'material' || body.geometry.kind !== 'bar')
    )
  )
    return undefined;
  const bodies = source.bodies.map((body) => {
    const member = members.get(body.id);
    if (!member || body.kind !== 'material' || body.geometry.kind !== 'bar') return body;
    const resized = (vertex: GeometryVertex): GeometryVertex => ({
      ...vertex,
      ...add(
        member.mount.point,
        scale(subtract(vertex, member.mount.point), member.length / member.oldLength)
      ),
    });
    return {
      ...body,
      geometry: {
        ...body.geometry,
        width: member.width,
        vertices: [resized(body.geometry.vertices[0]), resized(body.geometry.vertices[1])] as const,
      },
    };
  });
  const intrinsic = new Map([
    [
      internal.frameA.attachmentId,
      add(
        barrelMount.point,
        rotate({ x: dimensions.barrelLength - dimensions.rodLength, y: 0 }, internal.frameA.angle)
      ),
    ],
    [
      internal.frameB.attachmentId,
      add(rodMount.point, rotate({ x: -dimensions.rodLength, y: 0 }, internal.frameB.angle)),
    ],
  ]);
  const attachments = source.attachments.map((point) => {
    if (!members.has(point.bodyId)) return point;
    const body = bodies.find((b) => b.id === point.bodyId)!;
    const vertex =
      body.kind === 'material' && body.geometry.kind === 'bar' && point.vertexId
        ? body.geometry.vertices.find((v) => v.id === point.vertexId)
        : undefined;
    const at = intrinsic.get(point.id) ?? vertex;
    return at ? { ...point, point: { x: at.x, y: at.y } } : point;
  });
  const { stroke, ...materialDimensions } = dimensions;
  return {
    ...source,
    bodies,
    attachments,
    joints: source.joints.map((j) =>
      j.id === internal.id
        ? {
            ...internal,
            guideDisplay: {
              ...internal.guideDisplay,
              bodyId: assembly.barrel,
              frame: internal.frameA,
              station: dimensions.rodLength,
            },
          }
        : j
    ),
    assemblies: source.assemblies.map((a) =>
      a.id === assembly.id ? { ...a, dimensions: materialDimensions } : a
    ),
    limits: source.limits.map((limit) =>
      limit.id === assembly.strokeLimit ? { ...limit, lower: 0, upper: stroke } : limit
    ),
  };
}
