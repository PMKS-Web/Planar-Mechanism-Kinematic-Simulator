/**
 * Ending the cylinder gesture on a joint attaches the rod there.
 *
 * The second click of Add Cylinder used to land the rod's far end on the grid
 * wherever it fell, joint or no joint under it, so a ram aimed at a pin ended
 * standing on top of a pin it did not touch. Now a click on a joint folds the
 * rod's end into that joint, through the same merge a mount dragged onto a
 * joint goes through, so every refusal that merge has this has too.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-end-on-joint.mjs
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

/** Model-space point to screen, through the layer the mechanism is drawn in. */
const toScreen = (x, y) =>
  page.evaluate(
    ([modelX, modelY]) => {
      const m = document.querySelector('#linkHolder').getScreenCTM();
      return { x: modelX * m.a + modelY * m.c + m.e, y: modelX * m.b + modelY * m.d + m.f };
    },
    [x, y]
  );

const drawing = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const joint = (id) => srv.joints.find((one) => one.id === id);
    return {
      joints: srv.joints.map((one) => one.id),
      links: srv.links.map((one) => one.id),
      cylinders: srv.sealedStructures().map((sealed) => ({
        mount: sealed.barrelFar?.id,
        rodFar: sealed.rodFar?.id,
      })),
      linksAtC: joint('C')?.links.map((one) => one.id),
    };
  });

/** Start Add Cylinder from the grid at a screen point. */
async function startCylinderAt(on) {
  await page.mouse.move(on.x, on.y);
  await page.mouse.click(on.x, on.y, { button: 'right' });
  await page.waitForTimeout(600);
  const started = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#contextMenu .cm-row')];
    const item = rows.find(
      (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Cylinder'
    );
    if (!item || item.classList.contains('cm-row--off')) {
      return { ok: false, rows: rows.map((row) => row.textContent?.trim()) };
    }
    item.click();
    return { ok: true };
  });
  await page.waitForTimeout(300);
  return started;
}

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(400);

const before = await drawing();
const c = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const joint = srv.joints.find((one) => one.id === 'C');
  return { x: joint.x, y: joint.y };
});
// Well away from the four-bar, on empty grid below and to the right of C:
// measured on the screen, because the drawing's own units say nothing about
// how big a joint's hitbox is.
const onC = await toScreen(c.x, c.y);
// Below the lowest joint on the screen and a little left of C, clear of the
// bars and of the transport card along the bottom of the window.
const lowest = await page.evaluate(() =>
  Math.max(
    ...[...document.querySelectorAll('#jointHolder svg')].map(
      (node) => node.getBoundingClientRect().bottom
    )
  )
);
const from = { x: onC.x - 120, y: Math.min(lowest + 160, 780) };
const started = await startCylinderAt(from);
record('Add Cylinder starts from the grid', started.ok, { from, onC, started });
record(
  'and from the grid rather than a part',
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return !grid.cylinderCreateOn && !grid.cylinderCreateAt;
  })
);

// The second click, on joint C itself.
await page.mouse.move(onC.x, onC.y, { steps: 10 });
await page.waitForTimeout(200);
await page.locator('#jointHolder svg').nth(2).click({ force: true });
await page.waitForTimeout(900);

const after = await drawing();
record('a cylinder was made', after.cylinders.length === before.cylinders.length + 1, after);
const made = after.cylinders.find(
  (one) => !before.cylinders.some((was) => was.mount === one.mount && was.rodFar === one.rodFar)
);
record('its rod ends at joint C, the joint the click landed on', made?.rodFar === 'C', {
  made,
  after,
});
record(
  'so C holds one more link than it did, the rod',
  (after.linksAtC?.length ?? 0) === (before.linksAtC?.length ?? 0) + 1,
  { before: before.linksAtC, after: after.linksAtC }
);
record(
  'and no free end was left standing on top of it',
  after.joints.length === before.joints.length + 4,
  { before: before.joints, after: after.joints }
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
