/**
 * Snap to grid, dragged with a real mouse.
 *
 * The setting is the reader's own -- remembered on their machine, not written
 * into the URL -- so this drives the panel and the pointer rather than the
 * service, and checks where things actually landed.
 *
 * What must hold:
 *
 *   - On, a dragged joint lands on a corner of the grid the reader can see.
 *   - A rigid body cannot put every joint on the grid, so a dragged link lands
 *     its reference joint there and the rest keep their places around it.
 *   - A capture beats the grid: dropped onto another joint, a joint goes
 *     exactly onto it, not onto the nearest grid corner.
 *   - Off, nothing is rounded.
 *
 *   PMKS_BASE_URL=<origin> node e2e/snap-to-grid.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** Every joint's position measured in grid squares, so a whole number is a corner. */
const inCells = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const cell = grid.svgGrid.minorCellSize;
    return {
      cell,
      snapOn: grid.settings.isSnapToGrid.value,
      joints: grid.mechanismSrv.joints.map((joint) => ({
        id: joint.id,
        x: +(joint.x / cell).toFixed(4),
        y: +(joint.y / cell).toFixed(4),
      })),
    };
  });

const onCorner = (joint) =>
  Math.abs(joint.x - Math.round(joint.x)) < 1e-6 && Math.abs(joint.y - Math.round(joint.y)) < 1e-6;

/** A real press, a real path, a real release. Optionally with Option held. */
const dragFrom = async (box, dx, dy, { holdOption = false } = {}) => {
  if (holdOption) await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      box.x + box.width / 2 + (dx * step) / 8,
      box.y + box.height / 2 + (dy * step) / 8,
      { steps: 2 }
    );
  }
  await page.mouse.up();
  if (holdOption) await page.keyboard.up('Alt');
  await page.waitForTimeout(500);
};

/** Back to the template's own geometry, so each check starts from the same place. */
const fresh = async () => {
  await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
};

/** Turn the option on or off through the panel, the way a reader would. */
const setSnap = async (on) => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(400);
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
  await page.waitForTimeout(800);
  const listed = /Snap to Grid/.test(await page.locator('app-settings-panel').innerText());
  await page.evaluate((on) => {
    const panel = ng.getComponent(document.querySelector('app-settings-panel'));
    panel.settingsForm.controls['snapToGrid'].setValue(on);
  }, on);
  await page.waitForTimeout(400);
  await page.locator('.closeDrawer').click({ force: true });
  await page.waitForTimeout(400);
  return listed;
};

await fresh();

// Off until asked for: dragging has always put a joint exactly where the cursor
// let go, and that is not a thing to change out from under anyone.
record('it is off until asked for', (await inCells()).snapOn === false);
record('and the settings panel offers it', await setSnap(true));
record('turning it on takes effect', (await inCells()).snapOn === true);

// --- a joint lands on a corner ----------------------------------------------
await dragFrom(await page.locator('#joint_B').boundingBox(), 63, -41);
const dragged = (await inCells()).joints.find((joint) => joint.id === 'B');
record('a dragged joint lands on a corner of the grid', onCorner(dragged), dragged);

// --- Option suspends it for the length of a gesture -------------------------
// The same key that already means "no help from the app" while dragging: it is
// what turns off capturing a joint you drop on.
await fresh();
await dragFrom(await page.locator('#joint_B').boundingBox(), 43, -29, { holdOption: true });
const withOption = (await inCells()).joints.find((joint) => joint.id === 'B');
record('holding Option drags free of the grid', !onCorner(withOption), withOption);
// And lets go of it again.
await dragFrom(await page.locator('#joint_B').boundingBox(), 31, 22);
const afterOption = (await inCells()).joints.find((joint) => joint.id === 'B');
record('and the next drag snaps again', onCorner(afterOption), afterOption);

// --- a link lands its reference joint there ---------------------------------
await fresh();
const before = await inCells();
await dragFrom(await page.locator('#linkHolder path').nth(1).boundingBox(), 53, -37);
const after = await inCells();
const moved = after.joints.filter(
  (joint, i) =>
    Math.abs(joint.x - before.joints[i].x) > 1e-6 || Math.abs(joint.y - before.joints[i].y) > 1e-6
);
record('dragging a link moves it', moved.length >= 2, moved);
record(
  "and lands the link's reference joint on a corner",
  moved.length > 0 && onCorner(moved[0]),
  moved
);
// The bar's length is what it is, so the far end cannot be on a corner too --
// and forcing it there would stretch the link.
const spanBefore = Math.hypot(
  before.joints[1].x - before.joints[2].x,
  before.joints[1].y - before.joints[2].y
);
const spanAfter = Math.hypot(
  after.joints[1].x - after.joints[2].x,
  after.joints[1].y - after.joints[2].y
);
record('without changing its length', Math.abs(spanBefore - spanAfter) < 1e-3, {
  spanBefore,
  spanAfter,
});

// --- a capture beats the grid ------------------------------------------------
// B onto D. Not onto C: the app deliberately refuses to merge a joint with the
// far end of its own link, so that pair can never capture whatever the grid is
// doing.
await fresh();
const from = await page.locator('#joint_B').boundingBox();
const onto = await page.locator('#joint_D').boundingBox();
await dragFrom(from, onto.x - from.x, onto.y - from.y);
const landing = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const b = srv.joints.find((joint) => joint.id === 'B');
  const d = srv.joints.find((joint) => joint.id === 'D');
  const cell = grid.svgGrid.minorCellSize;
  return {
    apart: b && d ? +Math.hypot(b.x - d.x, b.y - d.y).toFixed(6) : -1,
    // And that landing is not a grid corner, so it really is the target it
    // went to rather than a corner that happened to be there.
    onCorner: !!b && Math.abs(b.x / cell - Math.round(b.x / cell)) < 1e-6,
  };
});
record(
  'a joint dropped on another lands exactly on it, not on the grid',
  landing.apart === 0 && !landing.onCorner,
  landing
);

// --- turning it off --------------------------------------------------------
await fresh();
await setSnap(false);
await dragFrom(await page.locator('#joint_B').boundingBox(), 37, 29);
const free = (await inCells()).joints.find((joint) => joint.id === 'B');
record('with it off, a drag is not rounded at all', !onCorner(free), free);
record(
  'and the choice is remembered on this machine',
  (await page.evaluate(() => localStorage.getItem('snapToGrid'))) === 'false'
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
