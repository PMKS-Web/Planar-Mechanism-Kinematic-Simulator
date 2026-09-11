import type { BodyDocument } from './body-document';

export const MAX_BODY_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** An accepted drawing must fit its checked persistence envelope, including UTF-8 labels. */
export function fitsBodyDocumentBudget(document: BodyDocument): boolean {
  return new TextEncoder().encode(JSON.stringify(document)).length <= MAX_BODY_DOCUMENT_BYTES;
}
