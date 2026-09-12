import { BodyDocument } from '../model/body-system/body-document';
import { encodeBodyDocument, decodeBodyDocument } from './transcoding/body-document-codec';
import { validateBodyEditDocument } from '../model/body-system/body-edit-validation';

export interface BodyRecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const NATIVE_TAB_DRAWING = 'pmks2:tab-drawing:v1';
export const NATIVE_LAST_DRAWING = 'pmks2:last-drawing:v1';

/** Native backups have their own keys: an unsupported development backup cannot trap native startup. */
export class NativeBodyRecovery {
  constructor(
    private readonly tab: BodyRecoveryStorage,
    private readonly persistent: BodyRecoveryStorage
  ) {}
  save(document: BodyDocument) {
    const encoded = encodeBodyDocument(document);
    if (!encoded.ok) return { ok: false as const, reason: 'invalid-document' as const };
    const envelope = JSON.stringify({ version: 1, payload: encoded.payload });
    let tab = false,
      persistent = false;
    // Storage can be denied or full independently. The live document remains authoritative.
    try {
      this.tab.setItem(NATIVE_TAB_DRAWING, envelope);
      tab = true;
    } catch {}
    try {
      this.persistent.setItem(NATIVE_LAST_DRAWING, envelope);
      persistent = true;
    } catch {}
    return { ok: tab && persistent, tab, persistent };
  }
  read() {
    const rejected: ('tab' | 'persistent')[] = [];
    for (const [source, storage, key] of [
      ['tab', this.tab, NATIVE_TAB_DRAWING],
      ['persistent', this.persistent, NATIVE_LAST_DRAWING],
    ] as const) {
      try {
        const text = storage.getItem(key);
        if (text === null) continue;
        if (text.length > 12 * 1024 * 1024) throw new Error('Oversized backup');
        const envelope: unknown = JSON.parse(text);
        if (
          !envelope ||
          typeof envelope !== 'object' ||
          !('version' in envelope) ||
          envelope.version !== 1 ||
          !('payload' in envelope) ||
          typeof envelope.payload !== 'string'
        )
          throw new Error('Unsupported backup');
        const decoded = decodeBodyDocument(envelope.payload);
        if (!decoded.ok || validateBodyEditDocument(decoded.document))
          throw new Error('Invalid backup');
        return { ok: true as const, document: decoded.document, source, rejected };
      } catch {
        rejected.push(source);
      }
    }
    return { ok: false as const, reason: 'no-valid-backup' as const, rejected };
  }
}
