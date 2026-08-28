/**
 * Squaring a drag up with its neighbours -- and only where it is asked for.
 *
 * A joint dragged nearly level with another one is pulled level, with a guide
 * line saying which one. A whole body dragged by its middle is not: both helps
 * act on the joint the body is named from rather than on the point under the
 * hand, so the guide named a neighbour the reader had not aimed at and the body
 * stepped sideways to put one of its several joints on a grid corner.
 *
 * What must hold:
 *
 *   - Dragging a bar by its body lands it where the cursor let go, with no
 *     guide drawn and no grid corner sought.
 *   - Dragging a ram by its body does the same.
 *   - A mount, which is a joint the reader has hold of, still squares up --
 *     against its own far mount included, which is what stands a ram at a
 *     right angle.
 *   - Option suspends that, and the settings toggle turns it off entirely.
 *
 *   PMKS_BASE_URL=<origin> node e2e/snap-alignment.mjs
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const load = async (payload) => {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
};

const joints = () =>
  page.evaluate(() =>
    Object.fromEntries(
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.joints.map((joint) => [joint.id, { x: joint.x, y: joint.y }])
    )
  );

/** Model units to screen pixels, so a drag can be aimed at an axis. */
const perUnit = () =>
  page.evaluate(() => {
    const svg = document.querySelector('#canvas') ?? document.querySelector('svg');
    return Math.abs(svg.querySelector('g').getScreenCTM().a);
  });

/**
 * Drag a body so its reference joint arrives a whisker off a target's axis.
 *
 * Aimed rather than arbitrary: this is the drag that used to be caught, so it
 * is the one that proves it no longer is. Three model units short of level is
 * well inside what the snap's reach used to be.
 */
const dragBodyToward = async (grabSelector, referenceId, targetId, axis, { holdOption } = {}) => {
  const before = await joints();
  const scale = await perUnit();
  const reference = before[referenceId];
  const target = before[targetId];
  const box = await page.locator(grabSelector).first().boundingBox();
  // Land three model units short of level, well inside the snap's reach.
  const wantX = axis === 'x' ? target.x - 3 : reference.x;
  const wantY = axis === 'y' ? target.y - 3 : reference.y;
  const dx = (wantX - reference.x) * scale;
  const dy = -(wantY - reference.y) * scale;

  if (holdOption) await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let guides = 0;
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(
      box.x + box.width / 2 + (dx * step) / 12,
      box.y + box.height / 2 + (dy * step) / 12
    );
    await page.waitForTimeout(35);
    guides = Math.max(
      guides,
      await page.evaluate(
        () => ng.getComponent(document.querySelector('app-new-grid')).axisSnapGuides.length
      )
    );
  }
  await page.mouse.up();
  if (holdOption) await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  const after = await joints();
  return {
    guides,
    landed: after[referenceId][axis],
    target: target[axis],
    off: Math.abs(after[referenceId][axis] - target[axis]),
  };
};

/** Turn a snapping option on or off through the panel, the way a reader would. */
const setOption = async (control, on) => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(400);
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
  await page.waitForTimeout(800);
  const listed = /Snap to Alignment/.test(await page.locator('app-settings-panel').innerText());
  await page.evaluate(
    ([control, on]) => {
      const panel = ng.getComponent(document.querySelector('app-settings-panel'));
      panel.settingsForm.controls[control].setValue(on);
    },
    [control, on]
  );
  await page.waitForTimeout(400);
  await page.locator('.closeDrawer').click({ force: true });
  await page.waitForTimeout(400);
  return listed;
};

// --- a bar dragged by its body ----------------------------------------------
await load(payloads['4-Bar']);
record('the settings panel offers it', await setOption('snapToAlignment', true));
const bar = await dragBodyToward('#linkHolder path', 'A', 'D', 'y');
record('dragging a bar by its body draws no guide', bar.guides === 0, bar);
record('and leaves it where the cursor let go, not level with a neighbour', bar.off > 1e-6, bar);
// The drag is aimed three units short of level, so a body that has not been
// pulled anywhere is three units short of level. Anything else -- a nudge onto
// a grid corner included -- moves it off that. The tolerance is a fiftieth of a
// unit: the drag arrives in whole screen pixels, which is worth a few
// hundred-thousandths, while the two snaps this rules out are worth half a grid
// square and the whole three units respectively.
record('and not onto a grid corner either', Math.abs(bar.off - 3) < 0.02, bar);

// --- a ram dragged by its body ----------------------------------------------
await load(payloads['Cylinder_Boom']);
const ram = await dragBodyToward('.cylinder-barrel', 'G', 'O', 'y');
record('dragging a ram by its body is free the same way', ram.guides === 0, ram);
record('and lands where it was let go', Math.abs(ram.off - 3) < 0.02, ram);

// --- a ram squared against its own far mount --------------------------------
/**
 * Drag one mount of a ram to a whisker off level with the other.
 *
 * This is what puts a ram at 0, 90 or 180, and it is what a bar has always
 * been able to do against its own far joint. The ram's other joints travel
 * with the drag and are rightly ignored; the far mount does not, and was being
 * ignored with them.
 */
const squareTheRam = async ({ holdOption, alreadyLoaded } = {}) => {
  if (!alreadyLoaded) await load(payloads['Cylinder_Boom']);
  const mounts = await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const ram = srv.cylinderAt(srv.links.find((link) => srv.cylinderAt(link)));
    return {
      dragged: ram.barrelFar.id,
      fixed: ram.rodFar.id,
      draggedAt: { x: ram.barrelFar.x, y: ram.barrelFar.y },
      fixedAt: { x: ram.rodFar.x, y: ram.rodFar.y },
    };
  });
  const scale = await perUnit();
  const box = await page.locator(`#joint_${mounts.dragged}`).boundingBox();
  const dy = -(mounts.fixedAt.y - 4 - mounts.draggedAt.y) * scale;

  if (holdOption) await page.keyboard.down('Alt');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let guides = 0;
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (dy * step) / 12);
    await page.waitForTimeout(35);
    guides = Math.max(
      guides,
      await page.evaluate(
        () => ng.getComponent(document.querySelector('app-new-grid')).axisSnapGuides.length
      )
    );
  }
  await page.mouse.up();
  if (holdOption) await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  const after = await joints();
  const a = after[mounts.dragged];
  const b = after[mounts.fixed];
  return {
    guides,
    outOfLevel: Math.abs(a.y - b.y),
    angle: +Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toFixed(3),
  };
};

const squared = await squareTheRam();
record('a ram squares up against its own far mount', squared.guides > 0, squared);
record(
  'and stands at exactly 0, 90 or 180 rather than near it',
  squared.outOfLevel < 1e-4 && [0, 90, 180].some((right) => Math.abs(squared.angle - right) < 1e-3),
  squared
);

const ramLoose = await squareTheRam({ holdOption: true });
record('unless Option is held', ramLoose.guides === 0 && ramLoose.outOfLevel > 1e-4, ramLoose);

// --- turned off entirely -----------------------------------------------------
await load(payloads['Cylinder_Boom']);
await setOption('snapToAlignment', false);
const off = await squareTheRam({ alreadyLoaded: true });
record('and the toggle turns it off entirely', off.guides === 0 && off.outOfLevel > 1e-4, off);
record(
  'which is remembered on this machine',
  (await page.evaluate(() => localStorage.getItem('snapToAlignment'))) === 'false'
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
