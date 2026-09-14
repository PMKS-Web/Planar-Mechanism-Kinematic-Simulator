import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openNative, nativeState, markCenter } from './native-editor.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const out = 'artifacts/bodies-and-joints/S5/mobile';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
};
const cdp = await context.newCDPSession(page);
try {
  await openNative(page, 'axial');
  const film = filmstrip(page, `${out}/sheet`);
  await film.shot('collapsed');
  const handle = page.getByRole('button', { name: 'Expand the panel', exact: true });
  check(
    'The phone panel starts collapsed',
    (await handle.getAttribute('aria-expanded')) === 'false'
  );
  await handle.click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(45);
    await film.shot(`opening-${i}`);
  }
  await page.getByRole('button', { name: 'Collapse the panel', exact: true }).click();
  await page.waitForTimeout(400);
  await film.shot('closed');
  const bounds = await page.evaluate(() => {
    const grip = document.querySelector('.sheetGrip'),
      panel = grip.getBoundingClientRect(),
      controls = document.querySelector('app-playback-bar .scrubCard').getBoundingClientRect();
    return {
      gap: controls.top - panel.bottom + parseFloat(getComputedStyle(grip).paddingBottom),
      outside: document.documentElement.scrollWidth > innerWidth,
    };
  });
  check(
    `Phone cards retain the shared 12-pixel gap without horizontal overflow (${JSON.stringify(bounds)})`,
    Math.abs(bounds.gap - 12) < 1 && !bounds.outside
  );
  const source = await nativeState(page);
  const p = await page
    .locator('[data-joint-kind="prismatic"]')
    .first()
    .evaluate((el) => {
      const p = new DOMPoint(0, 0).matrixTransform(el.getScreenCTM());
      return { x: p.x, y: p.y };
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: p.x, y: p.y, id: 1 }],
  });
  await page.waitForTimeout(620);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('menu').waitFor();
  check(
    'A held finger opens the cylinder menu without editing the drawing',
    JSON.stringify((await nativeState(page)).document) === JSON.stringify(source.document)
  );
  await film.shot('long-press-menu');
  await page.keyboard.press('Escape');
  const before = await nativeState(page);
  const view = await page.locator('#canvas .svg-pan-zoom_viewport').getAttribute('transform');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: 140, y: 360, id: 1 },
      { x: 250, y: 360, id: 2 },
    ],
  });
  for (let i = 1; i <= 5; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 140 - i * 6, y: 360, id: 1 },
        { x: 250 + i * 6, y: 360, id: 2 },
      ],
    });
    await film.shot(`pinch-${i}`);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(
    'Pinching changes the view without changing material or history',
    view !== (await page.locator('#canvas .svg-pan-zoom_viewport').getAttribute('transform')) &&
      JSON.stringify((await nativeState(page)).document) === JSON.stringify(before.document) &&
      (await nativeState(page)).history === before.history
  );
  await page.getByRole('button', { name: 'Show on the drawing', exact: true }).click();
  await film.shot('view-controls');
  check(
    'The shared view drawer stays inside the phone above its transport button',
    await page.evaluate(() => {
      const drawer = document.querySelector('.viewSheet').getBoundingClientRect(),
        button = document.querySelector('.viewSheetButton').getBoundingClientRect();
      return (
        drawer.top >= 0 &&
        drawer.left >= 0 &&
        drawer.right <= innerWidth &&
        drawer.bottom <= button.top
      );
    })
  );
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
  await page.waitForTimeout(400);
  const movedFrom = await nativeState(page);
  const grip = await page
    .locator('[data-joint-kind="prismatic"]')
    .first()
    .evaluate((el) => {
      const p = new DOMPoint(0, 0).matrixTransform(el.getScreenCTM());
      return { x: p.x, y: p.y };
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...grip, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: grip.x + 24, y: grip.y, id: 1 }],
  });
  await page.waitForTimeout(100);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(
    'A phone drag creates one undoable edit',
    (await nativeState(page)).history === movedFrom.history + 1
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  check(
    'Phone Undo restores the drawing',
    JSON.stringify((await nativeState(page)).document) === JSON.stringify(movedFrom.document)
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  check(
    'Phone Redo reapplies the edit',
    (await nativeState(page)).history === movedFrom.history + 1
  );
  await contactSheet(`${out}/sheet/*.png`, `${out}/sheet.png`, 3, 0.7);
  check('No browser errors', errors.length === 0);
} finally {
  await page.screenshot({ path: `${out}/last.png` });
  await writeFile(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
