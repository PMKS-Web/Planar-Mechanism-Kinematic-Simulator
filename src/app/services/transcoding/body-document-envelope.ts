export const NATIVE_DOCUMENT_PREFIX = 'pmks2:';
export const MAX_NATIVE_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** CRC32 detects damaged share strings; it is not an authenticity or permission check. */
function checksum(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
export function bodyDocumentEnvelope(json: string): string | undefined {
  const bytes = new TextEncoder().encode(json);
  if (bytes.length > MAX_NATIVE_DOCUMENT_BYTES) return undefined;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${NATIVE_DOCUMENT_PREFIX}${checksum(bytes)}.${payload}`;
}
export type EnvelopeRead =
  | { readonly ok: true; readonly json: string }
  | {
      readonly ok: false;
      readonly reason: 'unsupported-version' | 'invalid-format' | 'too-large' | 'checksum';
    };
export function readBodyDocumentEnvelope(text: string): EnvelopeRead {
  if (!text.startsWith(NATIVE_DOCUMENT_PREFIX)) return { ok: false, reason: 'unsupported-version' };
  if (
    text.length >
    NATIVE_DOCUMENT_PREFIX.length + 9 + Math.ceil(MAX_NATIVE_DOCUMENT_BYTES / 3) * 4
  )
    return { ok: false, reason: 'too-large' };
  const match = /^pmks2:([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/.exec(text);
  if (!match) return { ok: false, reason: 'invalid-format' };
  try {
    const binary = atob(match[2].replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
    if (bytes.length > MAX_NATIVE_DOCUMENT_BYTES) return { ok: false, reason: 'too-large' };
    if (checksum(bytes) !== match[1]) return { ok: false, reason: 'checksum' };
    return { ok: true, json: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'invalid-format' };
  }
}
