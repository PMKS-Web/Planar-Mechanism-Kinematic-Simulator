import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
export const nativeFixtures = JSON.parse(
  await readFile(new URL('../src/test-data/native-editor-fixtures.json', import.meta.url), 'utf8')
);
export async function openNative(
  page,
  key,
  base = process.env.PMKS_BASE_URL || 'http://localhost:4307'
) {
  const fixture = nativeFixtures.find((f) => f.key === key);
  assert.ok(fixture, `Native fixture ${key} is published`);
  await page.goto(`${base}/?editor=native&document=${encodeURIComponent(fixture.payload)}`);
  await page.locator('#native-canvas').waitFor();
  await page.locator('#bootSplash').waitFor({ state: 'detached' });
}
/** Read-only inspection supplements UI gestures; tests never install a document through this handle. */
export function nativeState(page) {
  return page.evaluate(() => {
    const root = window.ng.getComponent(document.querySelector('app-root'));
    return {
      document: root.editor.store.document,
      drawing: root.editor.drawing(),
      revision: root.editor.store.revision,
      history: root.editor.store.undoDepth,
      selection: root.editor.selection(),
      clocks: root.editor.store.local.clocks,
      paths: root.playback.machines().map((m) => ({
        key: m.key,
        kind: m.path.kind,
        duration: m.path.duration,
        samples: m.path.samples.length,
      })),
      message: root.editor.message(),
    };
  });
}
export async function bodyCenter(page, id) {
  return page.locator(`[data-body-id="${id}"]`).evaluate((el) => {
    const box = el.getBBox(),
      p = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
        el.getScreenCTM()
      );
    return { x: p.x, y: p.y };
  });
}
export async function markCenter(page, id) {
  return page.locator(`[data-mark-id="${id}"]`).evaluate((el) => {
    const p = new DOMPoint(0, 0).matrixTransform(el.getScreenCTM());
    return { x: p.x, y: p.y };
  });
}
