/** Recovered target-path workflow: shapes, editing, gestures, history and shared URLs. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/path-synthesis';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const report = [];
const pass = (name) => {
  report.push(name);
  console.log('PASS ' + name);
};
const samePoints = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((p, i) => {
    // The document codec rounds to 0.001 user units (0.2 model units).
    assert.ok(
      Math.abs(p.x - expected[i].x) < 0.101,
      JSON.stringify({ i, p, expected: expected[i] })
    );
    assert.ok(
      Math.abs(p.y - expected[i].y) < 0.101,
      JSON.stringify({ i, p, expected: expected[i] })
    );
  });
};
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      points: grid.synthesisBuilder.path.points.map((p) => ({ ...p })),
      stage: grid.synthesisBuilder.stage,
      poses: grid.synthesisBuilder.getAllPoses().length,
      joints: grid.mechanismSrv.joints.length,
    };
  });
const tab = (name) => page.locator('.tabButton').filter({ hasText: name }).click();
const button = (name) => page.getByRole('button', { name, exact: true });
const undo = async () => {
  await button('Undo').click();
  await page.waitForTimeout(200);
};
const redo = async () => {
  await button('Redo').click();
  await page.waitForTimeout(200);
};
try {
  await page.goto(BASE);
  await waitForReady(page);
  await tab('Synthesis');
  await page.locator('.kindCard--path').click();
  await button('Use Shape').click();
  assert.equal((await state()).points.length, 12);
  assert.equal((await state()).joints, 0);
  assert.ok((await page.locator('#pathSynthesisTarget path').getAttribute('d')).includes('C'));
  pass('Bean preset creates a target curve without inserting a mechanism');
  await page.screenshot({ path: `${OUT}/desktop.png` });

  for (const name of [
    'Horizontal Line',
    'Vertical Line',
    'Rising Line',
    'Falling Line',
    'Figure Eight',
    'Infinity',
  ]) {
    await page.getByLabel('Starting shape', { exact: true }).selectOption(name);
    await button('Replace Path with Shape').click();
    assert.equal((await state()).points.length, name.endsWith('Line') ? 3 : 12);
  }
  pass('All recovered shape choices create editable points');
  await button('Open').click();
  await button('Straight').click();
  let curve = await page.locator('#pathSynthesisTarget path').getAttribute('d');
  assert.ok(!curve.endsWith('Z') && !curve.includes('C'));
  await button('Closed').click();
  await button('Smooth').click();
  assert.ok((await page.locator('#pathSynthesisTarget path').getAttribute('d')).endsWith('Z'));
  pass('Open/closed and straight/smooth change the curve');

  const original = await state();
  const point = page.getByLabel('Path point 1 X', { exact: true });
  await point.fill('not a number');
  await point.press('Tab');
  samePoints((await state()).points, original.points);
  assert.ok(await page.getByRole('alert').isVisible());
  await point.fill('2.5');
  await point.press('Tab');
  const changed = await state();
  assert.notEqual(changed.points[0].x, original.points[0].x);
  await undo();
  samePoints((await state()).points, original.points);
  await redo();
  samePoints((await state()).points, changed.points);
  pass('Coordinates reject invalid input; one edit is one undo and redo');

  await button('Move path point 2 earlier').click();
  samePoints([(await state()).points[0]], [changed.points[1]]);
  await undo();
  await button('Delete path point 2').click();
  assert.equal((await state()).points.length, 11);
  await undo();
  assert.equal((await state()).points.length, 12);
  pass('Point order and deletion are undoable');

  await page.getByLabel('Starting shape', { exact: true }).selectOption('Bean');
  await button('Replace Path with Shape').click();
  const beforeDrag = await state();
  const hit = page.locator('[data-path-point="1"]');
  const box = await hit.boundingBox();
  assert.ok(box);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const film = filmstrip(page, `${OUT}/drag`);
  await film.shot('before');
  await film.during(35, 7, 'drag', async () => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(start.x + 12 * i, start.y - 6 * i);
      await page.waitForTimeout(45);
    }
    await page.mouse.up();
  });
  await film.shot('settled');
  assert.ok((await state()).points[0].x > beforeDrag.points[0].x);
  assert.ok((await state()).points[0].y > beforeDrag.points[0].y);
  await undo();
  samePoints((await state()).points, beforeDrag.points);
  await redo();
  pass('Dragging follows y-up model coordinates and makes one undo entry');

  const beforeCancel = await state();
  const cancelBox = await hit.boundingBox();
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelBox.x + 40, cancelBox.y + 40);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  samePoints((await state()).points, beforeCancel.points);
  pass('Escape cancels a provisional drag');

  await button('Place Points on Canvas').click();
  await page.mouse.move(850, 700);
  await page.mouse.click(850, 700);
  assert.equal((await state()).points.length, 13);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('g[appPathSynthesisCanvas] .placement').count(), 0);
  pass('Canvas placement adds a point and Escape finishes placement');

  const beforeReload = await state();
  await page.reload();
  await waitForReady(page);
  await tab('Synthesis');
  samePoints((await state()).points, beforeReload.points);
  assert.equal((await state()).stage, 'path');
  pass('Reload restores the complete target and opens its editor');

  const url = await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  const shared = await browser.newPage();
  await shared.goto(BASE + '/?' + url);
  await waitForReady(shared);
  const restored = await shared.evaluate(
    () => ng.getComponent(document.querySelector('app-new-grid')).synthesisBuilder.path.points
  );
  samePoints(restored, (await state()).points);
  await shared.close();
  pass('A shared URL restores the target in a fresh browser context');
  const saved = await state();
  await button('Back to synthesis choices').click();
  await page.locator('.kindCard--on').click();
  assert.equal((await state()).stage, 'working');
  await page.locator('.work__head [aria-label="Back"]').click();
  await page.locator('.kindCard--path').click();
  samePoints((await state()).points, saved.points);
  pass('Switching synthesis types preserves the target');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const handle = button('Expand the panel');
  if (await handle.count()) await handle.click();
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
  const targetBox = await page.locator('#pathSynthesisTarget').boundingBox();
  assert.ok(targetBox && targetBox.x >= 0 && targetBox.x + targetBox.width <= 390);
  await page.screenshot({ path: `${OUT}/phone.png` });
  assert.ok(await page.locator('app-path-synthesis-panel').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByLabel('Path point 1 X', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/phone-points.png` });
  const fieldBox = await page.getByLabel('Path point 1 X', { exact: true }).boundingBox();
  assert.ok(fieldBox && fieldBox.x >= 0 && fieldBox.x + fieldBox.width <= 390);
  pass('Phone layout and reduced motion retain the path editor without page overflow');
  assert.deepEqual(errors, []);
  pass('No browser errors');
  await contactSheet(`${OUT}/drag/*.png`, `${OUT}/drag-sheet.png`, 3, 0.5);
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ passed: report, errors }, null, 2));
  await browser.close();
}
