/**
 * Undoing a unit change must not move the view.
 *
 * A unit change rescales the stored geometry and compensates the viewport so
 * the drawing keeps its apparent size. Undo replays a URL, which carries the
 * unit but not the compensation — so the geometry came back at its old size
 * through a viewport still zoomed for the new one.
 *
 *   PMKS_BASE_URL=<origin> node e2e/unit-undo-view.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/**
 * How wide the linkage actually is on screen, which is what a reader sees.
 *
 * Measured joint centre to joint centre, not from the painted bounding box:
 * stroke width follows the object-scale setting, which a unit change also
 * moves, and that would show up here as a change in size that is not one.
 */
const onScreen = () =>
  page.evaluate(() => {
    const centres = [
      ...document.querySelectorAll('#jointHolder circle, [id^="joint_"] circle'),
    ].map((circle) => {
      const box = circle.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const xs = centres.map((c) => c.x);
    return {
      count: centres.length,
      span: +(Math.max(...xs) - Math.min(...xs)).toFixed(1),
      left: +Math.min(...xs).toFixed(1),
    };
  });

const flipUnit = () =>
  page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-settings-panel'));
    const control = panel.settingsForm.controls['globalunit'];
    control.setValue(control.value === '0' ? '1' : '0');
  });

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.topStrip .iconButton').first().click();
await page.waitForTimeout(400);
await page.locator('.menuItem', { hasText: 'Settings' }).click();
await page.waitForTimeout(900);

const before = await onScreen();
await flipUnit();
await page.waitForTimeout(1200);
const changed = await onScreen();
record(
  'changing the unit leaves the drawing the size it was',
  Math.abs(changed.span - before.span) < 3,
  { before, changed }
);

await page.locator('.historyButton').first().click();
await page.waitForTimeout(1400);
const undone = await onScreen();
record('and undoing it leaves the drawing where it was', Math.abs(undone.span - before.span) < 3, {
  before,
  undone,
});
record('down to where on screen it sits', Math.abs(undone.left - before.left) < 4, {
  before,
  undone,
});

await page.locator('.historyButton').nth(1).click();
await page.waitForTimeout(1400);
const redone = await onScreen();
record('and redoing it does too', Math.abs(redone.span - before.span) < 3, { before, redone });

// A plain undo never touched the view, and must still not.
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(600);
const settled = await onScreen();
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const joint = srv.joints.find((j) => !j.ground);
  joint.x += 40;
  srv.updateMechanism(true);
});
await page.waitForTimeout(900);
await page.locator('.historyButton').first().click();
await page.waitForTimeout(1200);
const afterPlainUndo = await onScreen();
record(
  'an undo with no unit in it still leaves the view alone',
  Math.abs(afterPlainUndo.span - settled.span) < 3,
  { settled, afterPlainUndo }
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
