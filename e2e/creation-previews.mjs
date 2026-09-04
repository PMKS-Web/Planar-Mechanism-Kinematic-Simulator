/**
 * What the creation gestures promise, and what they deliver.
 *
 * Drawing a link or a cylinder shows a ghost under the cursor. A ghost is a
 * promise about what the next click will make, so the color it wears has to be
 * the color the part turns out to be — otherwise the promise is broken at the
 * exact moment it is kept, which is the one moment a user is looking.
 *
 * The color comes from a cursor that advances every time a link is built, so
 * two things have to hold together: the ghost has to *peek* at that cursor
 * rather than take from it — a canceled gesture must not shuffle every color
 * after it — and consecutive parts have to come out in consecutive colors.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/creation-previews.mjs
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

const linkIds = () =>
  page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.links.map((l) => l.id)
  );

/** Run one creation gesture from a joint, and report what it promised and made. */
async function draw(kind, jointId, to) {
  const at = await page.evaluate((id) => {
    const box = document.querySelector('#joint_' + id).getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, jointId);

  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(600);
  await page.evaluate(
    (label) => {
      const item = [...document.querySelectorAll('#contextMenu .cm-row')].find(
        (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === label
      );
      item?.click();
    },
    kind === 'link' ? 'Link' : 'Cylinder'
  );
  await page.waitForTimeout(300);

  await page.mouse.move(at.x + to.dx, at.y + to.dy, { steps: 10 });
  await page.waitForTimeout(250);
  const promised = await page.evaluate((which) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return which === 'link' ? grid.linkPreview?.fill : grid.cylinderPreview?.fill;
  }, kind);

  const before = await linkIds();
  await page.mouse.click(at.x + to.dx, at.y + to.dy);
  await page.waitForTimeout(1200);
  // What the user actually sees a cylinder wearing is its *barrel's* color:
  // the rod is drawn in it too, because one part gets one color.
  const delivered = await page.evaluate((prev) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const fresh = grid.mechanismSrv.links.filter((link) => !prev.includes(link.id));
    return fresh.map((link) => link.fill).filter(Boolean);
  }, before);
  return { promised, delivered };
}

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// --- a gesture that is abandoned must not spend a color --------------------
const beforeCancel = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).nextLinkColor
);
const onJoint = await page.evaluate(() => {
  const box = document.querySelector('#joint_C').getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
await page.mouse.move(onJoint.x, onJoint.y);
await page.mouse.click(onJoint.x, onJoint.y, { button: 'right' });
await page.waitForTimeout(600);
await page.evaluate(() => {
  const item = [...document.querySelectorAll('#contextMenu .cm-row')].find(
    (node) => node.querySelector('.cm-row__label')?.textContent?.trim() === 'Link'
  );
  item?.click();
});
await page.waitForTimeout(300);
await page.mouse.move(onJoint.x - 200, onJoint.y + 160, { steps: 8 });
await page.waitForTimeout(200);
// Right-click cancels the gesture, as it does for every creation here.
await page.mouse.click(onJoint.x - 200, onJoint.y + 160, { button: 'right' });
await page.waitForTimeout(500);
const afterCancel = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).nextLinkColor
);
record('an abandoned gesture does not spend a color', beforeCancel === afterCancel, {
  beforeCancel,
  afterCancel,
});

// --- what is promised is what is made --------------------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

const firstLink = await draw('link', 'C', { dx: -300, dy: 260 });
record(
  'the link ghost wears the color the link is built with',
  !!firstLink.promised && firstLink.delivered.includes(firstLink.promised),
  firstLink
);

const secondLink = await draw('link', 'D', { dx: -180, dy: 170 });
record(
  'and the next one promises the next color, not the same one again',
  !!secondLink.promised &&
    secondLink.delivered.includes(secondLink.promised) &&
    secondLink.promised !== firstLink.promised,
  { firstLink, secondLink }
);

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const ram = await draw('cylinder', 'C', { dx: -300, dy: 260 });
record(
  'the cylinder ghost wears the color its barrel is built with',
  !!ram.promised && ram.delivered.includes(ram.promised),
  ram
);

// ---- and a placed joint lands where a dragged one would -------------------
//
// Snap to Grid governed dragging an existing joint and said nothing about
// placing a new one, so the same switch meant one thing to a joint that existed
// and nothing to a joint being made -- and a mechanism built on a grid came out
// on coordinates like 3.87. Both ends of the gesture are checked, because they
// are set in different places: the start at the right-click, the finish at the
// left one.
const drawBar = async ({ option, snap }) => {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('tutorialSeen', '1'));
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // Off by default -- it is remembered per machine rather than carried in the
  // URL -- so the suite says which state it is testing.
  await page.evaluate((on) => {
    ng.getComponent(document.querySelector('app-new-grid')).settings.isSnapToGrid.next(on);
  }, snap);
  await page.waitForTimeout(200);

  await page.mouse.move(620, 430);
  // Held rather than passed as a click modifier: a modifier on the click does
  // not reach the contextmenu event, and the gesture's start reads that one.
  if (option) await page.keyboard.down('Alt');
  await page.mouse.click(620, 430, { button: 'right' });
  if (option) await page.keyboard.up('Alt');
  await page.waitForTimeout(500);
  await page.locator('.cm-row:has(.cm-row__label:text-is("Link"))').first().click();
  await page.waitForTimeout(400);
  // The canvas places a joint from tracked movement, so move before the click.
  await page.mouse.move(800, 500);
  await page.waitForTimeout(150);
  await page.mouse.move(803, 507);
  if (option) await page.keyboard.down('Alt');
  await page.mouse.click(803, 507);
  if (option) await page.keyboard.up('Alt');
  await page.waitForTimeout(800);

  return page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const cell = grid.svgGrid.minorCellSize;
    const onGrid = (value) => Math.abs(value / cell - Math.round(value / cell)) < 1e-6;
    return grid.mechanismSrv.joints.map((joint) => ({
      id: joint.id,
      at: [Math.round(joint.x * 1e4) / 1e4, Math.round(joint.y * 1e4) / 1e4],
      onGrid: onGrid(joint.x) && onGrid(joint.y),
    }));
  });
};

const snapped = await drawBar({ option: false, snap: true });
record(
  'both ends of a new bar land on the grid',
  snapped.length === 2 && snapped.every((joint) => joint.onGrid),
  snapped
);

const held = await drawBar({ option: true, snap: true });
record(
  'and Option places them wherever the pointer is, both ends alike',
  held.length === 2 && held.every((joint) => !joint.onGrid),
  held
);

const free = await drawBar({ option: false, snap: false });
record(
  'while with the switch off Option changes nothing, because nothing was snapping',
  free.length === 2 &&
    JSON.stringify(free.map((j) => j.at)) === JSON.stringify(held.map((j) => j.at)),
  { free, held }
);

record('nothing threw', errors.length === 0, errors.slice(0, 2));
await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
