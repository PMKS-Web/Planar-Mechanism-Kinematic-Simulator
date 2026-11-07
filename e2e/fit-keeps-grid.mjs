/**
 * Pressing Fit to view or Fit full motion never leaves the canvas blank.
 *
 * A fit hides the grid for the render it measures in, then shows it again. The
 * showing ran from a timer Angular's zone never saw, so nothing redrew the
 * grid: over a drawing the view's own move happened to, but over an empty grid
 * nothing moves, and the canvas stayed blank until the pointer next stirred.
 * The pointer is kept still here for exactly that reason.
 *
 * Every animation frame after the press logs whether the grid is in the page;
 * the grid may be gone for the measuring render and no longer.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/fit-keeps-grid.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
/** The grid may be away for the render the fit measures in, a frame or two. */
const MOST_HIDDEN_MS = 250;
/** Long enough to see the grid come back on a slow runner, if it is coming. */
const WATCH_MS = 1500;

const results = [];
const errors = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

function watchGrid() {
  const log = (window.__gridFrames = []);
  const t0 = performance.now();
  const tick = () => {
    log.push({
      t: Math.round(performance.now() - t0),
      grid: !!document.getElementById('backgroundAndGrid'),
    });
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function pressAndWatch(what, query, button) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('whatsNewSeen', '2026.09');
    localStorage.setItem('tutorialSeen', '1');
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}/${query ? '?' + query : ''}`);
  await page.locator('#backgroundAndGrid').waitFor();
  await page.waitForTimeout(2500);
  // Pressed from the keyboard, so no pointer event follows the click and
  // wakes change detection on the fit's behalf.
  await page.locator(`app-view-controls button[aria-label="${button}"]`).first().focus();
  await page.evaluate(watchGrid);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(WATCH_MS);
  const frames = await page.evaluate(() => window.__gridFrames);
  const hidden = frames.filter((frame) => !frame.grid);
  const span = hidden.length ? hidden.at(-1).t - hidden[0].t : 0;
  record(
    `${what}, ${button}: the grid is back within ${MOST_HIDDEN_MS} ms`,
    frames.at(-1)?.grid === true && span <= MOST_HIDDEN_MS,
    { hiddenFrames: hidden.length, spanMs: span, last: frames.at(-1) }
  );
  await page.close();
}

const browser = await chromium.launch();
for (const button of ['Fit to view', 'Fit full motion']) {
  await pressAndWatch('an empty grid', '', button);
  await pressAndWatch('a Watt six-bar', payloads['Watt_I'], button);
}
await browser.close();

record('nothing threw', errors.length === 0, errors.slice(0, 5));
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
