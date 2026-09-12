import { NativeBodyDocumentService } from './native-body-document.service';
import {
  NativeBodyRecovery,
  NATIVE_TAB_DRAWING,
  NATIVE_LAST_DRAWING,
} from './native-body-recovery';
import { NATIVE_EDIT_CONTEXT } from '../../test-utils/verification/native-lifecycle-fixtures';
import { PRODUCTION_203_PAYLOADS } from '../../test-utils/verification/production-203-payloads';
import { encodeBodyDocument } from './transcoding/body-document-codec';
import { emptyBodyDocument } from '../model/body-system/body-document';
const state = NATIVE_EDIT_CONTEXT.state;
class MemoryStore {
  values = new Map<string, string>();
  denied = false;
  getItem(key: string) {
    if (this.denied) throw new Error('denied');
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.denied) throw new Error('full');
    this.values.set(key, value);
  }
}
function setup() {
  const service = new NativeBodyDocumentService(),
    tab = new MemoryStore(),
    persistent = new MemoryStore();
  const recovery = new NativeBodyRecovery(tab, persistent);
  service.attachRecovery(recovery);
  return { service, tab, persistent, recovery };
}
describe('native load and recovery facade', () => {
  it('loads production atomically, saves native, clears local state/history and emits once', () => {
    const { service, tab } = setup(),
      events: unknown[] = [];
    service.changes.subscribe((e) => events.push(e));
    expect(service.load(PRODUCTION_203_PAYLOADS['4-Bar'], state).ok).toBe(true);
    expect(events.length).toBe(1);
    expect(service.undoDepth).toBe(0);
    expect(service.revision).toBe(1);
    const saved = service.save();
    if (!saved.ok) throw new Error('save failed');
    expect(saved.payload.startsWith('pmks2:')).toBe(true);
    expect(JSON.parse(tab.getItem(NATIVE_TAB_DRAWING)!).payload).toBe(saved.payload);
    const body = service.document.bodies.find((b) => b.kind === 'material')!;
    service.setLocalState({ ...service.local, selection: [{ kind: 'body', id: body.id }] });
    service.commit(
      {
        id: 'label',
        operations: [{ kind: 'body-properties', bodyId: body.id, change: { label: 'Changed' } }],
      },
      state
    );
    expect(service.undoDepth).toBe(1);
    service.load(saved.payload, state);
    expect(service.local.selection).toEqual([]);
    expect(service.undoDepth).toBe(0);
    expect(service.redoDepth).toBe(0);
    expect(service.local.clocks.every((c) => c.time === 0 && c.command === c.anchor)).toBe(true);
  });
  it('leaves document, history, selection, revision, event count and both backups intact on refusal', () => {
    const { service, tab, persistent } = setup();
    service.load(PRODUCTION_203_PAYLOADS['4-Bar'], state);
    const body = service.document.bodies.find((b) => b.kind === 'material')!;
    service.setLocalState({ ...service.local, selection: [{ kind: 'body', id: body.id }] });
    service.commit(
      {
        id: 'label',
        operations: [{ kind: 'body-properties', bodyId: body.id, change: { label: 'Before' } }],
      },
      state
    );
    const before = {
      document: service.document,
      local: service.local,
      display: service.display,
      revision: service.revision,
      undo: service.undoDepth,
      tab: [...tab.values],
      persistent: [...persistent.values],
    };
    let events = 0;
    service.changes.subscribe(() => events++);
    for (const payload of ['pmks8:future', 'bad', PRODUCTION_203_PAYLOADS['4-Bar'].slice(1)])
      expect(service.load(payload, state).ok).toBe(false);
    const written = service.save();
    if (!written.ok) throw new Error('save failed');
    expect(service.load(written.payload, { ...state, playing: true }).ok).toBe(false);
    expect({
      document: service.document,
      local: service.local,
      display: service.display,
      revision: service.revision,
      undo: service.undoDepth,
      tab: [...tab.values],
      persistent: [...persistent.values],
    }).toEqual(before);
    expect(events).toBe(0);
  });
  it('uses the tab first, falls back past a stale tab and does not overwrite either while recovering', () => {
    const { service, tab, persistent, recovery } = setup();
    service.load(PRODUCTION_203_PAYLOADS['4-Bar'], state);
    const first = service.document;
    const other = encodeBodyDocument(emptyBodyDocument());
    if (!other.ok) throw new Error('encode');
    persistent.setItem(NATIVE_LAST_DRAWING, JSON.stringify({ version: 1, payload: other.payload }));
    const restored = recovery.read();
    expect(restored).toMatchObject({ ok: true, source: 'tab' });
    if (!restored.ok) throw new Error('recover');
    expect(encodeBodyDocument(restored.document)).toEqual(encodeBodyDocument(first));
    tab.setItem(NATIVE_TAB_DRAWING, JSON.stringify({ version: 0, payload: 'old-development' }));
    const saved = [...tab.values];
    expect(service.recover(state)).toMatchObject({
      ok: true,
      source: 'persistent',
      rejected: ['tab'],
    });
    expect(service.document.bodies.length).toBe(1);
    expect([...tab.values]).toEqual(saved);
    persistent.setItem(NATIVE_LAST_DRAWING, 'bad');
    const before = service.document;
    expect(service.recover(state).ok).toBe(false);
    expect(service.document).toBe(before);
  });
  it('reports unavailable storage without throwing away a successful load or touching legacy keys', () => {
    const { service, tab, persistent } = setup();
    tab.values.set('lastDrawing', 'legacy');
    tab.denied = true;
    persistent.denied = true;
    const result = service.load(PRODUCTION_203_PAYLOADS['4-Bar'], state);
    expect(result).toMatchObject({
      ok: true,
      recovery: { ok: false, tab: false, persistent: false },
    });
    expect(service.document.bodies.length).toBe(4);
    expect(tab.values.get('lastDrawing')).toBe('legacy');
  });
});
