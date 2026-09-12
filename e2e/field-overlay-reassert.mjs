/**
 * A dimension comes back when you point at the same field again.
 *
 * Pointing at a number in the Edit panel draws that number on the grid. The
 * canvas clears its overlays whenever the selected object announces itself,
 * and a committed edit makes it do exactly that for the object being edited --
 * so after typing a value and pressing Enter, the dimension is gone while the
 * pointer is still sitting on the field.
 *
 * A block that tells the canvas only when its own hover *changes* never
 * recovers from that: the pointer has not left, so there is no change to
 * report, and the dimension stays gone until the reader selects something else
 * and comes back. `input-block` had learned this and re-asserted; the other
 * three field blocks had not, which is what `BLOCKS/field-overlay.ts` now
 * settles for all four.
 *
 * This drives the sequence that used to fail -- hover, type, commit, hover
 * again -- and checks the dimension is drawn at the end of it.
 *
 *   PMKS_BASE_URL=<origin> PMKS_PLAYWRIGHT_DIR=.. node e2e/field-overlay-reassert.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/field-overlay-reassert';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (what, ok, detail = '') => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok || !detail ? '' : ' — ' + detail}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** How many dimension chips the canvas is drawing right now. */
const dimensions = () => page.evaluate(() => document.querySelectorAll('.dimensionPill').length);

await openMechanism(page, `${BASE}/?${payloads['4-Bar']}`);
await page.waitForTimeout(400);
await page.locator('.tabStrip .tabButton').nth(1).click();
await page.waitForTimeout(400);

/**
 * Select a part through the service rather than by clicking the drawing: the
 * canvas picks from tracked pointer movement, and a click at a computed
 * coordinate is the flakiest thing any suite here can do.
 */
const select = async (what) => {
  await page.evaluate((kind) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv ?? grid.mechanism;
    grid.activeObjService.updateSelectedObj(kind === 'link' ? mech.links[0] : mech.joints[0]);
    ng.applyChanges(grid);
  }, what);
  await page.waitForTimeout(700);
};

/**
 * Hover a field, commit an edit without leaving it, then hover it again.
 *
 * The commit is what clears the canvas's overlays under a pointer that has not
 * moved. A block that reports only its own *changes* has nothing to say at
 * that point, so the dimension never comes back.
 */
const survivesACommit = async (label, part, selector, nudge) => {
  await select(part);
  const field = page.locator(selector).first();
  if ((await field.count()) === 0) {
    check(`${label}: a field to point at`, false, `no match for ${selector}`);
    return;
  }
  const idle = await dimensions();

  await field.hover();
  await page.waitForTimeout(450);
  const hovered = await dimensions();
  check(
    `${label}: pointing at it draws a dimension`,
    hovered > idle,
    `idle=${idle} hovered=${hovered}`
  );

  // A *real* edit: the clear happens when the selected object announces
  // itself, and it only does that when a value actually changed.
  await field.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(String(nudge));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);

  // Leave and come back, the way a reader would after watching it vanish.
  await page.mouse.move(20, 20);
  await page.waitForTimeout(250);
  await field.hover();
  await page.waitForTimeout(500);
  const again = await dimensions();
  await page.screenshot({ path: `${OUT}/${label.replace(/\W+/g, '-')}.png` });
  check(
    `${label}: and draws it again after a committed edit cleared it`,
    again > idle,
    `idle=${idle} after=${again} — the re-assert rule in BLOCKS/field-overlay.ts`
  );
};

// `hold-field-block` is the one of the four whose dimension can be driven
// reliably from here: its fields are near the top of the link panel and do not
// scroll out from under the pointer.
//
// The other three are not covered, and the reason is worth writing down rather
// than leaving as a gap someone rediscovers. `input-block`'s dimension is
// wired only on some panels, and the `dual-input-block` that carries one --
// "Distance to other joints" -- sits far enough down a 250px scrolling card
// that Playwright's hover lands on the card instead of the field. Reaching it
// wants a panel that can be scrolled to a named field, which is a change to
// the app, not to this suite.
await survivesACommit('hold-field-block', 'link', 'hold-field-block input', 3.5);

check('nothing threw', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
