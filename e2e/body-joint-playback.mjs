import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/playback';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
try {
  await openNative(page, 'two-clocks');
  check(
    'The fixture exposes two independent machine rows',
    (await page.getByRole('slider').count()) === 1
  );
  await page.getByRole('button', { name: 'Control mechanisms independently', exact: true }).click();
  check(
    'Independent control exposes a row for each machine',
    (await page.getByRole('slider').count()) === 2
  );
  await page.getByRole('slider', { name: 'M2 position in its cycle', exact: true }).fill('25');
  const parked = await nativeState(page);
  check(
    'Seeking the second machine leaves the first at its anchor',
    parked.clocks[0].time === 0 && parked.clocks[1].time > 0
  );
  await page.getByRole('button', { name: 'Play M2', exact: true }).click();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Pause M2', exact: true }).click();
  const moved = await nativeState(page);
  check(
    'An unsynced machine runs without advancing the other clock',
    moved.clocks[0].time === 0 && moved.clocks[1].time > parked.clocks[1].time
  );
  check(
    'Clock operations never alter authored geometry or undo history',
    JSON.stringify(moved.document) === JSON.stringify(parked.document) &&
      moved.history === parked.history
  );
  await page.locator('.stopButton').click();
  await page.waitForTimeout(300);
  check(
    'Rewind resets both clocks',
    (await nativeState(page)).clocks.every((c) => c.time === 0)
  );

  await openNative(page, 'axial');
  await page.getByRole('button', { name: 'Fit full motion', exact: true }).click();
  await page.waitForTimeout(700);
  const source = await nativeState(page),
    film = filmstrip(page, `${out}/two-cycles`);
  await page.locator('.speedButton').click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  let prior = 0,
    wraps = 0,
    frames = 0;
  const deadline = Date.now() + source.paths[0].duration * 1100 + 4000;
  while (wraps < 2 && Date.now() < deadline) {
    const state = await nativeState(page),
      time = state.clocks[0].time;
    if (time < prior) wraps++;
    prior = time;
    if (frames++ % 6 === 0) await film.shot(`running-${frames}`);
    {
      const covered = await page.locator('[data-body-id]').evaluateAll((elements) =>
        elements.some((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight;
        })
      );
      assert.equal(covered, false, 'Full-cycle Fit keeps material on screen');
    }
    await page.waitForTimeout(180);
  }
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  check('Real-time playback completes two full out-and-back cycles', wraps === 2);
  check(
    'Playback preserves the authored document',
    JSON.stringify((await nativeState(page)).document) === JSON.stringify(source.document)
  );
  await contactSheet(`${out}/two-cycles/*.png`, `${out}/two-cycles-sheet.png`, 3, 0.45);
  check('No browser errors', errors.length === 0);
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await page.screenshot({ path: `${out}/last.png` });
  await browser.close();
}
