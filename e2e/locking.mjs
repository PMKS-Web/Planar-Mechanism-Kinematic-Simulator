/**
 * The Lock feature, exercised the way a hand would: lock a link and watch its
 * drag refuse with an Unlock in the message; lock one joint and watch a link
 * drag become a swing about it; undo a lock, which proves the mark rides the
 * URL; leave Edit and watch the black marks stand down.
 *
 *   PMKS_BASE_URL=<origin> node e2e/locking.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4700';

const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const closeTour = async () => {
  const skip = page.locator('.introjs-skipbutton').first();
  if (await skip.isVisible().catch(() => false)) {
    await skip.click({ force: true });
    await page.waitForTimeout(300);
  }
};

const grid = () => `ng.getComponent(document.querySelector('app-new-grid'))`;

const jointOnScreen = (id) =>
  page.evaluate((jointId) => {
    const el = document.querySelector(`#joint_${jointId}`)?.closest('svg[x]');
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, id);

const jointModel = (id) =>
  page.evaluate((jointId) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = c.mechanismSrv.joints.find((j) => j.id === jointId);
    return { x: joint.x, y: joint.y };
  }, id);

const dragBy = async (from, dx, dy, steps = 10) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
    await page.waitForTimeout(15);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
};

await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForReady(page);
await closeTour();
await page.waitForTimeout(400);

// --- Lock a link from the service, as the menu item does -------------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.links.find((l) => l.id === 'BC'));
});
await page.waitForTimeout(200);

record(
  'a locked link puts a padlock badge on each of its joints',
  await page.evaluate(() => document.querySelectorAll('#jointHolder .lockBadge').length === 2)
);
record(
  'the held joints carry the state class for tooling',
  await page.evaluate(
    () =>
      document.querySelector('#joint_B').classList.contains('joint-locked') &&
      document.querySelector('#joint_C').classList.contains('joint-locked')
  )
);

// --- A plain click is a selection, not an offence ---------------------------

const bClick = await jointOnScreen('B');
await page.mouse.click(bClick.x, bClick.y);
await page.waitForTimeout(400);
record(
  'a plain click on a held joint selects it without a scolding',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    // The zoom warning may legitimately stand; what must NOT appear is a
    // lock refusal for a gesture that never tried to move anything.
    return (
      c.notify.live.every((one) => !one.id.startsWith('lock.')) &&
      c.activeObjService.getSelectedObj()?.id === 'B'
    );
  })
);

// --- A drag on a held joint refuses, and the message carries the way out ---

const bBefore = await jointModel('B');
await dragBy(await jointOnScreen('B'), 90, -60);
const bAfter = await jointModel('B');
record('dragging a held joint moves nothing', bBefore.x === bAfter.x && bBefore.y === bAfter.y, {
  bBefore,
  bAfter,
});
record(
  'the refusal stands in the stack with an Unlock button',
  await page.evaluate(() => {
    const action = [...document.querySelectorAll('.notificationAction')].find(
      (b) => b.textContent.trim() === 'Unlock'
    );
    return !!action;
  })
);

// --- The Unlock button clears exactly the mark that held the gesture -------
// One lock layer: "lock link BC" marked joints B and C, and freeing B is all
// this refusal's Unlock does — C stays held, which is the whole point of the
// marks living on joints.

await page.locator('.notificationAction', { hasText: 'Unlock' }).first().click();
await page.waitForTimeout(200);
record(
  'Unlock frees the refused joint and only it',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = (id) => c.mechanismSrv.joints.find((j) => j.id === id);
    return !joint('B').locked && joint('C').locked;
  })
);
await dragBy(await jointOnScreen('B'), 60, -40);
const bMoved = await jointModel('B');
record('the same drag now moves the joint', bMoved.x !== bBefore.x || bMoved.y !== bBefore.y, {
  bBefore,
  bMoved,
});

// --- Undo takes a lock back: the mark rides the URL ------------------------

const cBeforeToggle = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
const cAfterToggle = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
const cAfterUndo = await page.evaluate(
  () =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.find((j) => j.id === 'C').locked
);
record(
  'Ctrl+Z undoes a lock toggle, so the mark is really in the URL',
  cAfterToggle !== cBeforeToggle && cAfterUndo === cBeforeToggle,
  { cBeforeToggle, cAfterToggle, cAfterUndo }
);

// --- One held joint turns a link drag into a swing about it ----------------
// From a clean slate: exactly one mark, on B.

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.setAllLocks(false);
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'B'));
});
await page.waitForTimeout(200);

const before = { b: await jointModel('B'), c: await jointModel('C') };
const lengthBefore = Math.hypot(before.c.x - before.b.x, before.c.y - before.b.y);
// Grab the middle of the coupler BC and pull sideways.
const bScreen = await jointOnScreen('B');
const cScreen = await jointOnScreen('C');
const grab = { x: (bScreen.x + cScreen.x) / 2, y: (bScreen.y + cScreen.y) / 2 };
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.activeObjService.updateSelectedObj(c.mechanismSrv.links.find((l) => l.id === 'BC'));
});
await dragBy(grab, 0, 120, 14);
const after = { b: await jointModel('B'), c: await jointModel('C') };
const lengthAfter = Math.hypot(after.c.x - after.b.x, after.c.y - after.b.y);

record(
  'the held joint stays exactly still through the swing',
  before.b.x === after.b.x && before.b.y === after.b.y,
  {
    before: before.b,
    after: after.b,
  }
);
record(
  'the free end actually swung',
  Math.hypot(after.c.x - before.c.x, after.c.y - before.c.y) > 1,
  {
    before: before.c,
    after: after.c,
  }
);
record('the body kept its length through the swing', Math.abs(lengthAfter - lengthBefore) < 1e-3, {
  lengthBefore,
  lengthAfter,
});

// --- Two held joints leave the body nowhere to go --------------------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
const pinned = { b: await jointModel('B'), c: await jointModel('C') };
await dragBy(grab, 60, 60);
const pinnedAfter = { b: await jointModel('B'), c: await jointModel('C') };
record(
  'two held joints refuse the whole drag',
  pinned.b.x === pinnedAfter.b.x && pinned.c.x === pinnedAfter.c.x,
  { pinned, pinnedAfter }
);

// --- No back door: dragJoint itself holds a held joint ---------------------
// The canvas gate and the panel's greyed fields are UI; every route to "move
// this joint" — a neighbour's distance field, the linkage table — lands on
// dragJoint, so dragJoint is where the lock has to hold whoever asks.

const cHeld = await jointModel('C');
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.gridUtils.dragJoint(
    c.mechanismSrv.joints.find((j) => j.id === 'C'),
    { x: 999, y: 999 }
  );
});
const cStill = await jointModel('C');
record(
  'dragJoint itself refuses a held joint, whoever calls it',
  cHeld.x === cStill.x && cHeld.y === cStill.y,
  { cHeld, cStill }
);

// --- The marks are an Edit affordance: Analysis paints clean ---------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.tabService.setTab(2); // TabID.ANALYZE
});
await page.waitForTimeout(300);
record(
  'lock badges stand down outside Edit',
  await page.evaluate(
    () => document.querySelectorAll('.lockBadge, .joint-locked, .link-locked').length === 0
  )
);

record('no page errors the whole way through', errors.length === 0, errors);

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
