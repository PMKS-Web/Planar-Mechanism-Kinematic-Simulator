import { decodeBodyDocument } from './body-document-codec';
import { readLegacyProduction } from './legacy-production-reader';

/** Dispatch before parsing: an unknown native version must never enter the production parser. */
export function readBodyDocument(payload: string) {
  if (/^pmks[0-9]+:/.test(payload)) return decodeBodyDocument(payload);
  return readLegacyProduction(payload);
}
