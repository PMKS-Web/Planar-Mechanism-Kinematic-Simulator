declare const recordKind: unique symbol;

export type RecordId<K extends string> = string & { readonly [recordKind]: K };
export type BodyId = RecordId<'body'>;
export type AttachmentId = RecordId<'attachment'>;
export type JointId = RecordId<'joint'>;
export type VertexId = RecordId<'vertex'>;
export type AssemblyId = RecordId<'assembly'>;
export type JunctionId = RecordId<'junction'>;
export type DriverId = RecordId<'driver'>;
export type ForceId = RecordId<'force'>;
export type LimitId = RecordId<'limit'>;

export const WORLD = 'WORLD' as BodyId;

/** Derived frames must use the same ordering on clients with different locale settings. */
export function compareRecordIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Labels never participate in allocation, so a rename cannot retarget a reference. */
export function newRecordId<K extends string>(): RecordId<K> {
  return crypto.randomUUID() as RecordId<K>;
}
