import { BodyDocument } from './body-document';
import { BodyInsertRecords, BodySelectionRef } from './body-edit-types';

export const BODY_INSERT_TABLES = [
  'bodies',
  'attachments',
  'joints',
  'junctions',
  'assemblies',
  'drivers',
  'limits',
  'forces',
  'groups',
  'holds',
  'locks',
] as const;

export function insertBodyRecords(
  document: BodyDocument,
  records: BodyInsertRecords
): BodyDocument {
  return {
    ...document,
    ...Object.fromEntries(
      BODY_INSERT_TABLES.map((table) => [table, [...document[table], ...(records[table] ?? [])]])
    ),
  };
}
export function insertedBodySelection(records: BodyInsertRecords): BodySelectionRef[] {
  const assemblies = records.assemblies ?? [];
  return [
    ...assemblies.map((item) => ({ kind: 'assembly' as const, id: item.id })),
    ...(records.bodies ?? [])
      .filter((body) => !assemblies.some((item) => item.barrel === body.id || item.rod === body.id))
      .map((body) => ({ kind: 'body' as const, id: body.id })),
  ];
}
