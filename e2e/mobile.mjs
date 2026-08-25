/**
 * The phone layout, and the gesture that replaces the right button.
 *
 * PMKS+ used to greet a touch device with a dialog explaining what it could not
 * do. Everything that *makes* something is behind the right-click menu, so the
 * apology was accurate: without a right button the app could be panned and read
 * and never built in. This checks the three things that changed -- the page is
 * laid out at the size of the phone, a held finger opens the menu, and the mode
 * panel is a sheet that gets out of the way -- and, at the end, that a bar can
 * actually be drawn with nothing but taps.
 *
 *   PMKS_BASE_URL=http://127.0.0.1:4200 node e2e/mobile.mjs
 */

import { readFileSync } from 'node:fs';

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium, devices } = await import(playwright + '/node_modules/playwright/index.mjs');
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [
    id,
    p.replace(/\\\\/g, '\\'),
  ])
);

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** A finger held still on one spot, and lifted. */
async function hold(x, y, ms = 700) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(ms);
  const openWhileDown = await page.locator('#contextMenu').count();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(350);
  return { openWhileDown, openAfterLift: await page.locator('#contextMenu').count() };
}

/** A finger that travels, which is a pan and never a press. */
async function swipe(x, y, dx, dy) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let step = 1; step <= 6; step += 1) {
    await page.waitForTimeout(60);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * step) / 6, y: y + (dy * step) / 6, id: 1 }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(350);
}

const tap = async (x, y) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
};

const open = (query) =>
  page.goto(`${BASE}/${query ? '?' + query : ''}`, { waitUntil: 'domcontentloaded' });
const menuText = () =>
  page
    .locator('#contextMenu')
    .innerText()
    .catch(() => '');
const box = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { y: Math.round(rect.y), h: Math.round(rect.height), w: Math.round(rect.width) };
  }, selector);

// --- the page is laid out for the phone ------------------------------------
await open();
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(600);

const viewport = await page.evaluate(() => ({
  inner: window.innerWidth,
  scroll: document.body.scrollWidth,
}));
// Without the viewport meta a phone lays out at 980px and scales the result
// down, which is legible only in the sense that a photograph of an app is.
record('the page is laid out at the width of the phone', viewport.inner <= 440, viewport);
record('and nothing hangs off the side of it', viewport.scroll <= viewport.inner + 1, viewport);
record(
  'no dialog stands between the reader and the app',
  (await page.locator('app-touchscreen-warning').count()) === 0
);

// --- a held finger is the right button -------------------------------------
const onGrid = await hold(200, 480);
record('a held finger on the grid opens the menu', onGrid.openWhileDown === 1, onGrid);
// The browser sends a compatibility click after every touch, and the overlay
// closes on an outside click: the menu used to appear and vanish on the lift.
record('and it is still open once the finger lifts', onGrid.openAfterLift === 1, onGrid);
record('the menu offers the verb that makes something', /Link/.test(await menuText()));
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(300);

record('a tap opens nothing', (await hold(200, 480, 120)).openAfterLift === 0);
await swipe(200, 480, 90, 0);
record(
  'a swipe opens nothing, because it is a pan',
  (await page.locator('#contextMenu').count()) === 0
);

// --- the menu is about the part under the finger ----------------------------
await open(payloads['4-Bar']);
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(800);
const joint = await page.evaluate(() => {
  const rect = document.querySelector('[id^="joint_"]').getBoundingClientRect();
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
});
const onJoint = await hold(joint.x, joint.y);
record('a held finger on a joint opens that joint’s menu', onJoint.openWhileDown === 1, onJoint);
const jointRows = await menuText();
record('naming the joint', /Joint/.test(jointRows), jointRows.slice(0, 120));
record('and offering what can be done to it', /Grounded/.test(jointRows), jointRows.slice(0, 160));
await page.keyboard.press('Escape').catch(() => undefined);
await page.waitForTimeout(300);

// --- the sheet ---------------------------------------------------------------
const collapsed = await box('.panel');
record('the mode panel starts out of the way', collapsed.h === 0, collapsed);
record('with a handle to pull it up by', (await page.locator('.sheetHandle').count()) === 1);

await page.locator('.sheetHandle').click();
await page.waitForTimeout(600);
const expanded = await box('.panel');
record('the handle opens it', expanded.h > 100, expanded);
record(
  'across the whole width, not in a desktop column',
  expanded.w >= viewport.inner - 1,
  expanded
);
record(
  'and never taking more than half the window',
  expanded.h <= Math.round(0.5 * (await page.evaluate(() => window.innerHeight))) + 2,
  expanded
);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(600);
record('and shuts again', (await box('.panel')).h === 0);

// The transport and the view controls dock to the bottom too, so they have to
// stand on the sheet rather than inside it.
await page.locator('.tabButton').nth(2).click({ force: true });
await page.waitForTimeout(1200);
await page.locator('.sheetHandle').click();
await page.waitForTimeout(700);
const sheet = await box('.panel');
const cluster = await box('.playbackRow');
record(
  'the playback cluster stands clear of the open sheet',
  cluster.y + cluster.h <= sheet.y + 2,
  { cluster, sheet }
);

// --- and a bar can be drawn with nothing but taps ---------------------------
await open();
await waitForReady(page).catch(() => undefined);
await page.waitForTimeout(700);
const before = await page.evaluate(
  () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
);
await hold(150, 380);
await page.locator('#contextMenu').getByText('Link', { exact: false }).first().click();
await page.waitForTimeout(500);
// The far end follows the pointer and is set by the next press.
await tap(300, 300);
await page.waitForTimeout(800);
const after = await page.evaluate(
  () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
);
record('a link can be drawn with two taps and a hold', after - before === 2, { before, after });

record('nothing threw', errors.length === 0, errors.slice(0, 3));

console.log(`\n${results.filter(([, ok]) => ok).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
