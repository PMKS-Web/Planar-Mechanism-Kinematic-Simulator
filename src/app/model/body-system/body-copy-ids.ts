import { BodyDocument } from './body-document';
import { BodyId, compareRecordIds, RecordId, VertexId, WORLD } from './body-id';

/** Allocate the complete map before reading references; enumeration cannot choose a copied owner. */
export function bodyCopyIds(document: BodyDocument, prefix: string) {
  const allocate = <K extends string>(kind: K, ids: readonly RecordId<K>[]) =>
    new Map(
      [...new Set(ids)]
        .sort(compareRecordIds)
        .map((id, index) => [id, `${prefix}:${kind}:${index}` as RecordId<K>])
    );
  const bodies = allocate(
    'body',
    document.bodies.filter((body) => body.id !== WORLD).map((body) => body.id)
  );
  bodies.set(WORLD, WORLD);
  const vertices = new Map<BodyId, Map<VertexId, VertexId>>();
  for (const body of document.bodies)
    if (body.kind === 'material' && body.geometry.kind !== 'circle')
      vertices.set(
        body.id,
        new Map(
          [...body.geometry.vertices]
            .sort((a, b) => compareRecordIds(a.id, b.id))
            .map((vertex, index) => [
              vertex.id,
              `${bodies.get(body.id)}:vertex:${index}` as VertexId,
            ])
        )
      );
  return {
    bodies,
    vertices,
    attachments: allocate(
      'attachment',
      document.attachments.map((item) => item.id)
    ),
    joints: allocate(
      'joint',
      document.joints.map((item) => item.id)
    ),
    junctions: allocate(
      'junction',
      document.junctions.map((item) => item.id)
    ),
    assemblies: allocate(
      'assembly',
      document.assemblies.map((item) => item.id)
    ),
    drivers: allocate(
      'driver',
      document.drivers.map((item) => item.id)
    ),
    limits: allocate(
      'limit',
      document.limits.map((item) => item.id)
    ),
    forces: allocate(
      'force',
      document.forces.map((item) => item.id)
    ),
  };
}
export type BodyCopyIds = ReturnType<typeof bodyCopyIds>;
export function copiedId<T extends string>(map: ReadonlyMap<T, T>, id: T): T {
  const copied = map.get(id);
  if (copied === undefined)
    throw new Error('Copy contains a reference outside its selected material');
  return copied;
}
