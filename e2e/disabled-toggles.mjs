/**
 * A toggle block told it is disabled looks disabled.
 *
 * The switch's own `disabled` input loses to the reactive form directive
 * driving it, so "Draw as a Disc" on a link with no fixed pin looked live and
 * snapped back when pressed. The block grays itself now, switch and label,
 * and the switch takes no pointer. Checked on what a reader sees: the
 * computed opacity of the switch on a coupler, and on a crank.
 *
 * And the Elliptical Crank card's trace, which sat on D -- a rocker pin that
 * draws a circle -- and belongs on C, the coupler point that draws the
 * ellipse the mechanism is named for.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/disabled-toggles.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';

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

/** The Draw as a Disc block's look for the selected link. */
const discToggle = () =>
  page.evaluate(() => {
    const block = [...document.querySelectorAll('toggle-block')].find((node) =>
      /Draw as a Disc/.test(node.textContent ?? '')
    );
    const toggle = block?.querySelector('mat-slide-toggle');
    return {
      link: ng.getComponent(document.querySelector('app-new-grid')).activeObjService.selectedLink
        ?.id,
      present: !!block,
      grayed: !!block?.querySelector('.toggle-block--disabled'),
      switchOpacity: toggle ? Number(getComputedStyle(toggle).opacity) : undefined,
      switchPointer: toggle ? getComputedStyle(toggle).pointerEvents : undefined,
    };
  });

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(300);

// The coupler turns about no fixed pin, so it cannot be a disc.
await page.locator('#linkHolder path').nth(1).click({ force: true });
await page.waitForTimeout(400);
const coupler = await discToggle();
record('the coupler is selected', coupler.link === 'BC' && coupler.present, coupler);
record(
  'its Draw as a Disc switch is grayed, and takes no pointer',
  coupler.grayed && coupler.switchOpacity < 0.5 && coupler.switchPointer === 'none',
  coupler
);

// The crank turns about its ground pin, so it can.
await page.locator('#linkHolder path').nth(0).click({ force: true });
await page.waitForTimeout(400);
const crank = await discToggle();
record('the crank is selected', crank.link === 'AB' && crank.present, crank);
record(
  'and its switch is live',
  !crank.grayed && crank.switchOpacity === 1 && crank.switchPointer !== 'none',
  crank
);

// --- the Elliptical Crank traces its ellipse ---------------------------------
await page.goto(`${BASE}/?${payloads['Elliptical_Crank']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const traced = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return Object.fromEntries(srv.joints.map((joint) => [joint.id, joint.showCurve === true]));
});
record('the Elliptical Crank traces C, the coupler point', traced['C'] === true, traced);
record('and not D, the rocker pin', traced['D'] === false, traced);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
