/**
 * Does the app still boot, and does it now see more than one machine?
 *
 * The model underneath was rebuilt: the drawing is split into components, each
 * solved on its own. A unit suite can say the partition is right without
 * saying the app starts, so this loads real templates in a real browser and
 * asks the running service what it found.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/multi-mechanism-smoke.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** What the running service says about the mechanisms it built. */
const report = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      count: srv.mechanisms.length,
      dofs: srv.mechanisms.map((m) => m.dof),
      valid: srv.mechanisms.map((m) => m.isMechanismValid()),
      ids: srv.partitions.map((p) => p.id),
      anyValid: srv.oneValidMechanismExists(),
      blockers: srv.blockerCount(),
      floating: srv.unassigned.floatingChains.length,
      loose: srv.unassigned.looseJoints.length,
      period: srv.cyclePeriod(),
    };
  });

// --- one template is still exactly one machine -----------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const fourBar = await report();
record(
  'a four-bar is one mechanism, 1 DoF, valid',
  fourBar.count === 1 && fourBar.dofs[0] === 1 && fourBar.valid[0] === true,
  fourBar
);
record(
  'and it names it M1 with nothing left over',
  fourBar.ids[0] === 'M1' && fourBar.floating === 0 && fourBar.loose === 0,
  fourBar
);
record('with no blockers to report', fourBar.blockers === 0, fourBar);

// --- a cylinder template still solves ---------------------------------------
await page.goto(`${BASE}/?${payloads['Slider_Crank']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const slider = await report();
record(
  'a slider-crank still solves as one machine',
  slider.count === 1 && slider.valid[0] === true,
  slider
);

// --- the animation still runs ----------------------------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const before = await page.evaluate(() => {
  const box = document.querySelector('#joint_B').getBoundingClientRect();
  return { x: box.x, y: box.y };
});
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.animate(srv.stepAtTime(srv.cyclePeriod() / 2));
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => {
  const box = document.querySelector('#joint_B').getBoundingClientRect();
  return { x: box.x, y: box.y };
});
record(
  'seeking half a cycle moves the crank pin',
  Math.hypot(after.x - before.x, after.y - before.y) > 5,
  { before, after }
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
