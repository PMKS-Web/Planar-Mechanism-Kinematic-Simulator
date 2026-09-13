import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, bodyCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/render';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const report = [];
try {
  for (const key of [
    'four-bar',
    'rotating-p-drive',
    'mount-slot-grounded',
    'mount-slot-floating',
    'two-clocks',
    'axial',
    'welded-axial',
    'rotating',
    'oblique',
    'translating',
    'welded',
    'multiway',
  ]) {
    await openNative(page, key);
    const state = await nativeState(page);
    assert.equal(await page.locator('[data-body-id]').count(), state.document.bodies.length - 1);
    const film = filmstrip(page, `${out}/${key}`);
    await film.shot('start');
    const supports = await page
      .locator('[data-ground-id]')
      .evaluateAll((els) =>
        els.map((el) => [el.getAttribute('data-ground-id'), el.getAttribute('transform')])
      );
    assert.ok(
      await page.locator('.slot-channel').evaluateAll((channels) => {
        const mark = document.querySelector('.joint-mark');
        return (
          !mark ||
          channels.every(
            (channel) =>
              !!(channel.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING)
          )
        );
      }),
      'Guide channels are behind every joint glyph'
    );
    const first = state.paths[0];
    if (first) {
      const slider = page.getByRole('slider', { name: 'M1 Animation Position' });
      for (let i = 1; i <= 8; i++) {
        await slider.fill(String(Math.round(((first.samples - 1) * i) / 8)));
        await film.shot(`cycle-${i}`);
        if (key === 'mount-slot-grounded')
          assert.deepEqual(
            await page
              .locator('[data-ground-id]')
              .evaluateAll((els) =>
                els.map((el) => [el.getAttribute('data-ground-id'), el.getAttribute('transform')])
              ),
            supports,
            'World-fixed support marks stay fixed through travel'
          );
      }
      await page.getByRole('button', { name: 'Rewind', exact: true }).click();
      const end = await nativeState(page);
      for (const body of state.drawing.bodies) {
        const next = end.drawing.bodies.find((b) => b.id === body.id);
        assert.ok(Math.hypot(next.pose.x - body.pose.x, next.pose.y - body.pose.y) < 1e-7);
      }
    }
    await contactSheet(`${out}/${key}/*.png`, `${out}/${key}-sheet.png`, 3, 0.5);
    report.push({ key, paths: state.paths, material: state.document.bodies.length - 1 });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ report, errors }, null, 2));
  await browser.close();
}
