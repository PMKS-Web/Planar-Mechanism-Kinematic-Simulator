import { BodyDocument } from '../../model/body-system/body-document';
import { DocumentIssue, validateBodyDocument } from '../../model/body-system/body-validation';
import { hasBodyDocumentShape } from '../../model/body-system/document-schema/document';
import { canonicalBodyDocument } from './body-document-canonical';
import { bodyDocumentEnvelope, readBodyDocumentEnvelope } from './body-document-envelope';

export interface NativeDocumentRefusal {
  readonly ok: false;
  readonly reason:
    'unsupported-version' | 'invalid-format' | 'too-large' | 'checksum' | 'invalid-document';
  readonly issues?: readonly DocumentIssue[];
}
export type NativeDocumentRead =
  { readonly ok: true; readonly document: BodyDocument } | NativeDocumentRefusal;
export type NativeDocumentWrite =
  { readonly ok: true; readonly payload: string } | NativeDocumentRefusal;

/** Whole candidates are checked before any authority or recovery store can replace its drawing. */
export function decodeBodyDocument(payload: string): NativeDocumentRead {
  const envelope = readBodyDocumentEnvelope(payload);
  if (!envelope.ok) return envelope;
  let value: unknown;
  try {
    value = JSON.parse(envelope.json);
  } catch {
    return { ok: false, reason: 'invalid-format' };
  }
  return inspectDocument(value);
}

export function encodeBodyDocument(document: BodyDocument): NativeDocumentWrite {
  const checked = inspectDocument(document);
  if (!checked.ok) return checked;
  const payload = bodyDocumentEnvelope(canonicalBodyDocument(checked.document));
  return payload ? { ok: true, payload } : { ok: false, reason: 'too-large' };
}

function inspectDocument(value: unknown): NativeDocumentRead {
  if (value && typeof value === 'object' && 'version' in value && value.version !== 2)
    return { ok: false, reason: 'unsupported-version' };
  if (!hasBodyDocumentShape(value)) return { ok: false, reason: 'invalid-document' };
  const issues = validateBodyDocument(value);
  return issues.length
    ? { ok: false, reason: 'invalid-document', issues }
    : { ok: true, document: value };
}
