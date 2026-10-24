/**
 * The first frame a reader sees after a cover lifts is the drawing already
 * framed, never the view it had before the fit.
 *
 * Two covers hide a load: the boot splash in `index.html`, over the first
 * decode, and the loading overlay, over a drawing opened from the library.
 * Each used to lift a frame or more before the fit that frames the drawing:
 * the splash on Angular's first render, showing svg-pan-zoom's own view (the
 * whole SVG fitted, a zoom of about 475) for a few frames on a four-bar and
 * for over a second on a Jansen leg; the overlay with the decode, showing the
 * new drawing at the old one's zoom for a frame.
 *
 * Every animation frame from the start is logged in the page -- the splash's
 * opacity, whether the overlay is up, the canvas matrix -- and every frame in
 * which a cover no longer hides the canvas must already carry the matrix the
 * canvas settles on.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/first-frame.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const DESKTOP = { width: 1500, height: 950 };
const PHONE = { width: 375, height: 812 };
/** Long enough for the slowest template's decode and fit on a slow runner. */
const SETTLE_MS = 6000;

const results = [];
const errors = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/**
 * Logs one entry per animation frame into `window.__frames`. Installed as an
 * init script for an arrival, so it is running before the splash is parsed;
 * evaluated in the page for a library open.
 */
function watchFrames() {
  const log = (window.__frames = []);
  const t0 = performance.now();
  const tick = () => {
    const splash = document.getElementById('bootSplash');
    const viewport = document.querySelector('.svg-pan-zoom_viewport');
    log.push({
      t: Math.round(performance.now() - t0),
      splash: splash ? Number(getComputedStyle(splash).opacity) : 0,
      cover: !!document.querySelector('.loadingScrim'),
      matrix: viewport?.getAttribute('transform') ?? null,
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const matrixOf = (text) => text?.match(/-?[\d.e+-]+/g)?.map(Number) ?? null;

/** Same zoom to 1%, same offset to two pixels. */
const sameView = (a, b) =>
  !!a &&
  !!b &&
  Math.abs(a[0] / b[0] - 1) < 0.01 &&
  Math.abs(a[4] - b[4]) < 2 &&
  Math.abs(a[5] - b[5]) < 2;

/**
 * Every frame the canvas could be seen in, from the first, against the view
 * the canvas ends on. `seen` says which frames count as uncovered.
 */
function judge(what, frames, seen) {
  const settled = matrixOf(frames.at(-1)?.matrix);
  const shown = frames.filter(seen);
  const wrong = shown.filter((frame) => !sameView(matrixOf(frame.matrix), settled));
  record(
    `${what}: the first uncovered frame is the framed drawing`,
    shown.length > 0 && wrong.length === 0,
    {
      settled: frames.at(-1)?.matrix,
      uncovered: shown.length,
      unframed: wrong.slice(0, 4).map((frame) => `${frame.t}ms ${frame.matrix}`),
    }
  );
}

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    localStorage.setItem('whatsNewSeen', '2026.09');
    localStorage.setItem('tutorialSeen', '1');
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return page;
}

/** Arriving on an address: the boot splash is the cover. */
async function arrival(what, query, viewport = DESKTOP) {
  const page = await newPage(viewport);
  await page.addInitScript(watchFrames);
  await page.goto(`${BASE}/?${query}`);
  await page.waitForTimeout(SETTLE_MS);
  const frames = await page.evaluate(() => window.__frames);
  judge(what, frames, (frame) => frame.splash < 1 && frame.matrix);
  await page.close();
}

/** Opening a card from the library: the loading overlay is the cover. */
async function libraryOpen(what, card) {
  const page = await newPage(DESKTOP);
  await page.goto(`${BASE}/?library`);
  const tile = page.locator(`.templateCard[data-template="${card}"]`);
  await tile.waitFor();
  await page.waitForTimeout(800);
  await page.evaluate(watchFrames);
  await tile.click();
  await page.waitForTimeout(SETTLE_MS);
  const frames = await page.evaluate(() => window.__frames);
  const raised = frames.findIndex((frame) => frame.cover);
  record(`${what}: the loading cover went up`, raised >= 0, frames.slice(0, 5));
  const after = frames.slice(raised);
  judge(what, after, (frame) => !frame.cover);
  await page.close();
}

const browser = await chromium.launch();
await arrival('an empty grid', '');
await arrival('a Watt six-bar', payloads['Watt_I']);
await arrival('a Jansen leg, which takes over a second to frame', payloads['Jansen_Leg']);
await arrival('a Watt six-bar on a phone', payloads['Watt_I'], PHONE);
await libraryOpen('opening a Jansen leg from the library', 'Jansen_Leg');
await libraryOpen('opening a Watt six-bar from the library', 'Watt_I');
await browser.close();

record('nothing threw', errors.length === 0, errors.slice(0, 5));
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
