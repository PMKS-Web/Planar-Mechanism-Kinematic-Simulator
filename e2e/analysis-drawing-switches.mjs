/**
 * The four switches under an analysis panel's graphs -- trace, velocity,
 * force and acceleration vectors, drawn on the mechanism itself.
 *
 * They are the part's right-click Traces rows, reachable without the
 * right-click: the same service builds both, so a switch the panel grays is
 * one the menu grays, in the menu's own words. Checked on what a reader sees:
 * the switch is there, flipping it draws the arrows, a pin bolted to the
 * frame has its velocity refused, and a link keeps its trace and force
 * switches in place but gray.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/analysis-drawing-switches.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';

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

/** Select a part by clicking its element in Edit, then open the mode named. */
async function selectIn(selector, index, mode) {
  await page.locator('.tabButton', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  await page.locator(selector).nth(index).click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('.tabButton', { hasText: mode }).click();
  await page.waitForTimeout(900);
}

/** What the panel's chips say: their order, which are gray, and why on hover. */
const switches = () =>
  page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-analysis-panel'));
    const rows = panel.drawingSwitches;
    return [...document.querySelectorAll('app-analysis-panel .drawingChip')].map((node) => {
      const key = node.getAttribute('data-switch');
      const one = rows.find((row) => row.key === key);
      return {
        key,
        label: node.querySelector('.drawingChipLabel')?.textContent?.trim(),
        off: node.classList.contains('drawingChip--off'),
        why: one?.row.refusal?.short,
        tip: one ? panel.drawingSwitchTip(one) : undefined,
        on: node.getAttribute('aria-pressed') === 'true',
      };
    });
  });

const selectedId = () =>
  page.evaluate(() => {
    const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
    return active.selectedJoint?.id ?? active.selectedLink?.id;
  });

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// --- a moving pin: four switches, all available -----------------------------
await selectIn('#jointHolder svg', 1, 'Kinematic');
const onB = await switches();
record('a joint’s panel ends in four chips', onB.length === 4, onB);
record(
  'under the heading asked for',
  (
    await page.evaluate(
      () => document.querySelector('app-analysis-panel .drawingSwitchesHead')?.textContent ?? ''
    )
  ).includes('Show Vectors on Drawing')
);
record(
  'in the menu’s order, under the menu’s names',
  onB.map((one) => one.label).join('|') === 'Path|Velocity|Acceleration|Force',
  onB.map((one) => one.label)
);
record(
  'path, velocity and acceleration available on a moving pin two links meet at',
  onB.filter((one) => one.key !== 'force').every((one) => !one.off),
  { selected: await selectedId(), onB }
);
// Nothing loads this four-bar, so Force Analysis cannot be entered, and the
// Force chip says so rather than offering a reaction nobody may read yet.
const forceChip = onB.find((one) => one.key === 'force');
record(
  'and Force grayed while the force analysis is not set up, saying why',
  !!forceChip && forceChip.off && /not ready/.test(forceChip.tip ?? ''),
  forceChip
);

// --- flipping one draws the arrows ------------------------------------------
const noArrowsYet = await page.evaluate(() => !document.querySelector('#vectorTraceHolder'));
// Pressed through the element: the chips sit at the bottom of a scrolling
// panel under a sticky head, where a pointer click can land a row off.
await page.evaluate(() =>
  document.querySelector('app-analysis-panel .drawingChip[data-switch="velocity"]').click()
);
await page.waitForTimeout(600);
const arrows = await page.evaluate(() => ({
  holder: !!document.querySelector('#vectorTraceHolder'),
  on: ng
    .getComponent(document.querySelector('app-new-grid'))
    .mechanismSrv.isVectorTraceOn(
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.selectedJoint,
      'velocity'
    ),
}));
record(
  'flipping Velocity Vectors draws them on the mechanism',
  noArrowsYet && arrows.holder && arrows.on,
  {
    noArrowsYet,
    arrows,
  }
);
const afterFlip = await switches();
record('and the chip reads as on', afterFlip[1].on === true, afterFlip);
// Off again, through the menu's own switch: the panel follows the drawing.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.toggleVectorTrace(grid.activeObjService.selectedJoint, 'velocity');
});
await page.waitForTimeout(400);
const afterMenu = await switches();
record('a flip made elsewhere shows on the chip', afterMenu[1].on === false, afterMenu);

// --- a pin bolted to the frame: velocity refused in the menu's words ---------
await selectIn('#jointHolder svg', 0, 'Kinematic');
const onA = await switches();
const velocity = onA.find((one) => one.key === 'velocity');
record(
  'a grounded pin has its velocity chip grayed, with the reason on hover',
  !!velocity &&
    velocity.off &&
    velocity.why === 'it never moves' &&
    /never moves/.test(velocity.tip ?? ''),
  { selected: await selectedId(), onA }
);
record(
  'while its trace switch stays available',
  onA.find((one) => one.key === 'traces')?.off === false,
  onA
);

// --- a link: trace and force belong to joints ------------------------------
await selectIn('#linkHolder path', 1, 'Kinematic');
const onLink = await switches();
record(
  'a link keeps its trace switch in place, grayed as joints-only',
  onLink.find((one) => one.key === 'traces')?.why === 'joints only',
  { selected: await selectedId(), onLink }
);
record(
  'and its force switch the same, with velocity and acceleration available',
  onLink.find((one) => one.key === 'force')?.off === true &&
    onLink.find((one) => one.key === 'velocity')?.off === false &&
    onLink.find((one) => one.key === 'acceleration')?.off === false,
  onLink
);

// --- and the same rows in Force Analysis ------------------------------------
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.links.forEach((link) => {
    link.mass = 1;
    link.massMoI = 1;
  });
  srv.updateMechanism(true);
});
await page.waitForTimeout(400);
await selectIn('#jointHolder svg', 1, 'Force');
const inForce = await switches();
record(
  'the Force Analysis panel carries the same four switches',
  inForce.length === 4 &&
    inForce.map((one) => one.key).join('|') === 'traces|velocity|acceleration|force',
  inForce
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
