import { AUDIT_FIXTURES } from './audit-fixtures';

/** Original reproductions and source controls alongside the generated fixtures. */
export function auditGalleryRows(baseUrl: string): string[] {
  return AUDIT_FIXTURES.map((entry) => {
    const source = entry.sourcePayload
      ? ` ([source before conversion/save](${baseUrl}/?${entry.sourcePayload}))`
      : '';
    const spec = [6, 7, 28, 31, 37, 38, 39, 40, 41, 42, 43].includes(entry.id)
      ? 'mechanism-audit-save.spec.ts'
      : [58, 59, 60, 61, 68].includes(entry.id)
        ? 'mechanism-audit-interactions.spec.ts'
        : 'mechanism-audit.spec.ts';
    return (
      `| [Audit #${entry.id}: ${entry.name}](${baseUrl}/?${entry.payload})${source} | Retained audit reproduction | — | — | ` +
      `\`${spec}\` |`
    );
  });
}
