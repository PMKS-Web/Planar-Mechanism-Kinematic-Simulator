/**
 * A part's panels keep what the reader folded, across mode switches.
 *
 * Alex's recording on #41: fold a joint's Basic Settings in Edit and its
 * Position graph in Kinematic Analysis, switch modes, and both came back open,
 * because every mode switch mounts a new panel. The machine panel already kept
 * its folds for the session; the part panels now do too.
 *
 * - A folded Edit section stays folded after a trip through Kinematic Analysis.
 * - A folded graph stays folded after a trip through Edit.
 * - A section opened that starts closed (Visual Settings) stays open.
 * - Selecting another joint keeps the same folds.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/panel-folds.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { inAngular } from './in-angular.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('whatsNewSeen', '2026.09');
  localStorage.setItem('tutorialSeen', '1');
});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const select = (id) =>
  inAngular(
    page,
    (id) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      grid.activeObjService.updateSelectedObj(
        grid.mechanismSrv.joints.find((one) => one.id === id)
      );
    },
    id
  );
const tab = (name) => page.locator('.tabButton', { hasText: name }).click();
const section = (title) =>
  page.locator('app-edit-panel collapsible-subsection', {
    has: page.locator('.panel-header__toggle', { hasText: title }),
  });
/** Whether an Edit section is open, read off its chevron. */
const sectionOpen = (title) =>
  section(title)
    .locator('.panel-header__toggle mat-icon')
    .evaluate((icon) => icon.classList.contains('rotate180'));
const graphToggle = (label) =>
  page
    .locator('app-analysis-graph-section', { hasText: label })
    .locator('button[aria-expanded]')
    .first();
const graphOpen = async (label) =>
  (await graphToggle(label).getAttribute('aria-expanded')) === 'true';

await select('A');
await page.waitForTimeout(400);
const startOpen = await sectionOpen('Basic Settings');
await section('Basic Settings').locator('.panel-header__toggle').click();
await section('Visual Settings').locator('.panel-header__toggle').click();
await page.waitForTimeout(300);

await tab('Kinematic');
await page.waitForTimeout(800);
const graphStartsOpen = await graphOpen('Position');
await graphToggle('Position').click();
await page.waitForTimeout(300);

await tab('Edit');
await page.waitForTimeout(800);
const basicAfterTrip = await sectionOpen('Basic Settings');
const visualAfterTrip = await sectionOpen('Visual Settings');

await select('B');
await page.waitForTimeout(400);
const basicOnB = await sectionOpen('Basic Settings');

await tab('Kinematic');
await page.waitForTimeout(800);
const graphAfterTrip = await graphOpen('Position');

const results = [
  ['Basic Settings starts open, and the Position graph too', startOpen && graphStartsOpen],
  ['a folded Edit section stays folded after Kinematic Analysis', basicAfterTrip === false],
  ['a section opened that starts closed stays open', visualAfterTrip === true],
  ['another joint keeps the same folds', basicOnB === false],
  ['a folded graph stays folded after Edit', graphAfterTrip === false],
  ['nothing threw', errors.length === 0],
];
for (const [what, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
if (results.some(([, ok]) => !ok)) {
  console.log(
    JSON.stringify(
      {
        startOpen,
        graphStartsOpen,
        basicAfterTrip,
        visualAfterTrip,
        basicOnB,
        graphAfterTrip,
        errors,
      },
      null,
      2
    )
  );
}
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
