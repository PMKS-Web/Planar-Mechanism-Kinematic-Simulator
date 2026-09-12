import type { Link } from '../../model/link';
import type { LoadCase } from '../../model/structural/loads';
import { validateLoadCase } from '../../model/structural/loads';
import type { StructuralProperties } from '../../model/structural/structural-properties';
import { validateStructuralProperties } from '../../model/structural/structural-properties';

export interface StructuralDocument {
  readonly links: readonly { readonly id: string; readonly properties: StructuralProperties }[];
  readonly loadCases: readonly LoadCase[];
}

export function structuralDocumentOf(
  links: readonly Link[],
  loadCases: readonly LoadCase[]
): StructuralDocument {
  const entries: { id: string; properties: StructuralProperties }[] = [];
  const visit = (link: Link & { subset?: Link[] }) => {
    if (link.structural !== undefined) entries.push({ id: link.id, properties: link.structural });
    link.subset?.forEach(visit);
  };
  links.forEach(visit);
  const document = { links: entries, loadCases };
  validateStructuralDocument(document);
  return document;
}

export function validateStructuralDocument(
  document: StructuralDocument,
  linkIds?: ReadonlySet<string>
): void {
  if (!document || !Array.isArray(document.links) || !Array.isArray(document.loadCases)) {
    throw new Error('Invalid structural document.');
  }
  const seen = new Set<string>();
  for (const entry of document.links) {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      seen.has(entry.id) ||
      (linkIds !== undefined && !linkIds.has(entry.id))
    ) {
      throw new Error('Structural properties refer to a missing or repeated link.');
    }
    seen.add(entry.id);
    validateStructuralProperties(entry.properties);
  }
  for (const loadCase of document.loadCases) {
    validateLoadCase(loadCase);
    // A removed target stays in the case and yields invalid-load at analysis time.
    // Silently dropping it would change the engineering question on the next save.
  }
}

/** T1 + UTF-8 JSON in base64url. No separators collide with the legacy trailing section. */
export function encodeStructuralDocument(document: StructuralDocument): string[] {
  validateStructuralDocument(document);
  if (!document.links.length && !document.loadCases.length) return [];
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return ['T1' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')];
}

export function decodeStructuralDocument(entries: readonly string[]): StructuralDocument {
  if (entries.length === 0) return { links: [], loadCases: [] };
  if (entries.length !== 1 || !/^T1[A-Za-z0-9_-]+$/.test(entries[0])) {
    throw new Error('Unsupported or repeated structural document version.');
  }
  try {
    const binary = atob(entries[0].slice(2).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const document: StructuralDocument = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
    validateStructuralDocument(document);
    return document;
  } catch {
    throw new Error('The URL contains invalid structural data.');
  }
}
