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

/** Select a part by clicking its element in Edit, then open the mode named. */
async function selectIn(selector, index, mode) {
  await page.locator('.tabButton', { hasText: 'Edit' }).click();
  await page.waitForTimeout(400);
  await page.locator(selector).nth(index).click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('.tabButton', { hasText: mode }).click();
  await page.waitForTimeout(900);
}

/** What the panel's switches say: their order, and which are gray, and why. */
const switches = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('app-analysis-panel .drawingSwitch')].map((node) => ({
      key: node.querySelector('[data-switch]')?.getAttribute('data-switch'),
      label: node.querySelector('span.label')?.textContent?.trim(),
      off: node.classList.contains('drawingSwitch--off'),
      why: node.querySelector('.drawingSwitchWhy')?.textContent?.trim(),
      on: node.querySelector('button[role="switch"]')?.getAttribute('aria-checked') === 'true',
    }))
  );

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
record('a joint’s panel ends in four switches', onB.length === 4, onB);
record(
  'in the menu’s order, under the menu’s names',
  onB.map((one) => one.label).join('|') ===
    'Trace path|Velocity Vectors|Force Vectors|Acceleration Vectors',
  onB.map((one) => one.label)
);
record(
  'every one available on a moving pin two links meet at',
  onB.every((one) => !one.off),
  { selected: await selectedId(), onB }
);

// --- flipping one draws the arrows ------------------------------------------
const noArrowsYet = await page.evaluate(() => !document.querySelector('#vectorTraceHolder'));
// At the bottom of a scrolling panel under a sticky head, where a pointer
// click can land a row off once the panel has scrolled to bring it in; the
// switch is pressed through the element itself, which is what a pointer
// would do if it were aimed truly.
await page.evaluate(() =>
  document.querySelector('[data-switch="velocity"] button[role="switch"]').click()
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
record('and the switch reads as on', afterFlip[1].on === true, afterFlip);
// Off again, through the menu's own switch: the panel follows the drawing.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.toggleVectorTrace(grid.activeObjService.selectedJoint, 'velocity');
});
await page.waitForTimeout(400);
const afterMenu = await switches();
record('a flip made elsewhere shows on the switch', afterMenu[1].on === false, afterMenu);

// --- a pin bolted to the frame: velocity refused in the menu's words ---------
await selectIn('#jointHolder svg', 0, 'Kinematic');
const onA = await switches();
const velocity = onA.find((one) => one.key === 'velocity');
record(
  'a grounded pin has its velocity switch grayed, saying it never moves',
  !!velocity && velocity.off && velocity.why === 'it never moves',
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
    inForce.map((one) => one.key).join('|') === 'traces|velocity|force|acceleration',
  inForce
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
