/**
 * Holding a bar's length or angle, exercised the way a hand would.
 *
 * Right-click a bar and hold its length; drag one of its joints and watch it
 * ride the arc about the other, with the amber guide drawn; hover the Link
 * Length field and see the hairline dimension; click the angle padlock and
 * watch the hold move over with a message that offers the way back; hold a
 * second bar so a joint has nowhere to go, and watch that drag refuse with a
 * red ring and a Release button; undo, and watch the hold come off -- which
 * proves it rides the URL.
 *
 *   PMKS_BASE_URL=<origin> node e2e/link-holds.mjs
 */
import { mkdirSync } from 'node:fs';

const playwright = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const { chromium } = playwright;
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/link-holds';
mkdirSync(OUT, { recursive: true });

// The stock four-bar: ground A, crank AB, coupler BC, rocker CD, ground D.
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

const holdOf = (id) =>
  page.evaluate(
    (linkId) =>
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.links.find((l) => l.id === linkId)?.hold ?? null,
    id
  );

const linkOnScreen = (id) =>
  page.evaluate((linkId) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const link = c.mechanismSrv.links.find((l) => l.id === linkId);
    const [a, b] = link.joints.map((j) =>
      document.querySelector(`#joint_${j.id}`).closest('svg[x]').getBoundingClientRect()
    );
    return {
      x: (a.x + a.width / 2 + b.x + b.width / 2) / 2,
      y: (a.y + a.height / 2 + b.y + b.height / 2) / 2,
    };
  }, id);

const readMenu = () =>
  page.evaluate(() => {
    const card = document.querySelector('#contextMenu');
    if (!card || getComputedStyle(card).display === 'none') return null;
    return {
      subtitle: card.querySelector('.cm-header__subtitle')?.textContent?.trim() ?? null,
      rows: [...card.querySelectorAll('.cm-row')].map((one) => ({
        label: one.querySelector('.cm-row__label')?.textContent?.trim() ?? '',
        slot:
          one.querySelector('.cm-row__reason')?.textContent?.trim() ??
          one.querySelector('.cm-row__hint')?.textContent?.trim() ??
          (one.querySelector('.cm-row__check') ? 'check' : ''),
        off: one.classList.contains('cm-row--off'),
      })),
    };
  });

const clickRow = async (label) => {
  await page.locator('#contextMenu .cm-row__label', { hasText: label }).first().click();
  await page.waitForTimeout(300);
};

const dist = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);

const dragBy = async (from, dx, dy, during, steps = 12) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
    await page.waitForTimeout(15);
    if (during && step === Math.floor(steps / 2)) await during();
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
};

await page.goto(`${BASE}/?${FOUR_BAR}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await waitForReady(page);
await page.waitForTimeout(400);

// --- The menu offers both holds, carrying the value each would hold ----------

const abOn = await linkOnScreen('AB');
await page.mouse.click(abOn.x, abOn.y, { button: 'right' });
await page.waitForTimeout(350);
let menu = await readMenu();
const lengthRow = menu?.rows.find((r) => r.label === 'Fixed Length');
const angleRow = menu?.rows.find((r) => r.label === 'Fixed Angle');
record('the link menu offers Fixed Length and Fixed Angle', !!lengthRow && !!angleRow, menu?.rows);
record(
  'each row names the value it would hold',
  /\d/.test(lengthRow?.slot ?? '') && /\d/.test(angleRow?.slot ?? ''),
  { lengthRow, angleRow }
);

await clickRow('Fixed Length');
record('Fixed Length holds the bar', (await holdOf('AB')) === 'length');
await page.screenshot({ path: `${OUT}/01-length-held.png` });

record(
  'a chip with the padlock and the length rides the bar',
  await page.evaluate(() => {
    const chip = document.querySelector('[data-hold-chip="AB"]');
    return !!chip && /\d/.test(chip.textContent) && !!chip.querySelector('.holdChipGlyph');
  })
);
record(
  'the status strip names the hold',
  await page.evaluate(() => /Link AB: fixed length/.test(document.body.innerText))
);

// --- The panel: Link Length is held and read-only, Link Angle typeable -----

record(
  'the Link Length field says Locked on its padlock and stays typeable; the angle does not',
  await page.evaluate(() => {
    const length = document.querySelector('[data-hold-field="length"]');
    const angle = document.querySelector('[data-hold-field="angle"]');
    return (
      !!length &&
      !length.readOnly &&
      !!angle &&
      !/Locked/.test(document.querySelector('[data-hold-toggle="angle"]').textContent) &&
      /Locked/.test(document.querySelector('[data-hold-toggle="length"]').textContent)
    );
  })
);

// --- Hovering the field draws the hairline dimension on the canvas ---------

await page.hover('[data-hold-field="angle"]');
await page.waitForTimeout(300);
record(
  'hovering Link Angle draws the angle dimension as a hairline with a pill',
  await page.evaluate(() => {
    const dims = document.querySelectorAll('.hoverDimension');
    return dims.length === 1 && !!dims[0].querySelector('.dimensionPill rect');
  })
);
await page.hover('[data-hold-field="length"]');
await page.waitForTimeout(300);
record(
  'hovering the locked Link Length draws only the hairline: the chip is its label',
  await page.evaluate(() => {
    const dims = document.querySelectorAll('.hoverDimension');
    return (
      dims.length === 1 &&
      !dims[0].querySelector('.dimensionPill') &&
      !!document.querySelector('[data-hold-chip="AB"]')
    );
  })
);
await page.screenshot({ path: `${OUT}/02-angle-dimension.png` });
await page.mouse.move(700, 500);
await page.waitForTimeout(200);

// --- Dragging B rides the arc about A, with the guide drawn ----------------

const a = await jointModel('A');
const bBefore = await jointModel('B');
const radius = dist(a, bBefore);
const film = filmstrip(page, OUT);
let guideSeen = false;
await dragBy(await jointOnScreen('B'), 120, 40, async () => {
  guideSeen = await page.evaluate(() => !!document.querySelector('.holdGuide'));
  await film.shot('mid-drag');
});
const bAfter = await jointModel('B');
record('dragging B keeps AB at its held length', Math.abs(dist(a, bAfter) - radius) < 1e-3, {
  radius,
  after: dist(a, bAfter),
});
record('B actually moved along the arc', dist(bBefore, bAfter) > 0.05, { bBefore, bAfter });
record('the amber arc guide is drawn while dragging', guideSeen);
record('A did not move', (await jointModel('A')).x === a.x && (await jointModel('A')).y === a.y);
await page.screenshot({ path: `${OUT}/03-after-arc-drag.png` });

// --- Holding the angle moves the hold, and the message offers the way back --

// The drag left joint B selected, and moved the bar; the padlocks belong to
// the link's panel, so select the bar where it now is.
const abNow = await linkOnScreen('AB');
await page.mouse.click(abNow.x, abNow.y);
await page.waitForTimeout(300);
await page.click('[data-hold-toggle="angle"]');
await page.waitForTimeout(300);
record('the padlock on the angle moves the hold to the angle', (await holdOf('AB')) === 'angle');
record(
  'the locked angle field still shows its number, signed as the chip and the menu sign it',
  await page.evaluate(() => {
    const field = document.querySelector('[data-hold-field="angle"]').value;
    const chip = document.querySelector('[data-hold-chip="AB"]')?.textContent?.trim() ?? '';
    return /-?\d/.test(field) && field.replace(/\s+/g, '') === chip.replace(/\s+/g, '');
  })
);
record(
  'a message says the lock moved and offers the length instead',
  await page.evaluate(() => {
    const action = [...document.querySelectorAll('.notificationAction')].find((b) =>
      /Lock length instead/.test(b.textContent)
    );
    return !!action;
  })
);
await page.screenshot({ path: `${OUT}/04-hold-moved.png` });
await page.click('.notificationAction:has-text("Lock length instead")');
await page.waitForTimeout(300);
record('the way back puts the hold on the length again', (await holdOf('AB')) === 'length');

// --- Two holds on one joint, with nowhere to go ----------------------------

const bcOn = await linkOnScreen('BC');
await page.mouse.click(bcOn.x, bcOn.y, { button: 'right' });
await page.waitForTimeout(350);
await clickRow('Fixed Length');
// Lock C so BC's far end is fixed: B is then between two held lengths from two
// fixed points, a rigid triangle.
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
const bHeld = await jointModel('B');
let ringSeen = false;
await dragBy(await jointOnScreen('B'), 80, -50, async () => {
  ringSeen = await page.evaluate(() => !!document.querySelector('.holdRefused'));
});
const bStill = await jointModel('B');
record('a joint the holds fully determine does not move', dist(bHeld, bStill) < 1e-6, {
  bHeld,
  bStill,
});
record(
  'the refusal says Locked by both, and offers Unlock',
  await page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const one = c.notify.live.find((n) => n.id === 'hold.joint');
    return (
      !!one &&
      /^Locked by fixed length AB and fixed length BC/.test(one.text) &&
      one.actions.some((action) => action.label === 'Unlock')
    );
  })
);
await page.screenshot({ path: `${OUT}/05-refused.png` });

// --- The joint menu says what confines it ----------------------------------

await page.keyboard.press('Escape');
const bOn = await jointOnScreen('B');
await page.mouse.click(bOn.x, bOn.y, { button: 'right' });
await page.waitForTimeout(350);
menu = await readMenu();
const free = menu?.rows.find((r) => r.label === 'Free to Move');
record(
  'the joint menu has a grayed Free to Move row naming the holds',
  !!free && free.off && /AB/.test(free.slot),
  free
);
record(
  'the joint subtitle says it is on fixed bars',
  /on fixed/.test(menu?.subtitle ?? ''),
  menu?.subtitle
);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// --- Undo takes the last hold off: the hold rides the URL ------------------

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'C'));
});
await page.waitForTimeout(200);
record('BC still holds its length before the undo', (await holdOf('BC')) === 'length');
// Three edits since the hold: the lock on C, its release, and the hold itself.
for (let step = 0; step < 3; step++) {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
}
record('undo takes the hold off BC', (await holdOf('BC')) === null, await holdOf('BC'));
record('and AB still holds its length', (await holdOf('AB')) === 'length');

// --- One locked end keeps the padlocks, and a typed length solves about it --

await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'A'));
  c.activeObjService.updateSelectedObj(c.mechanismSrv.links.find((l) => l.id === 'AB'));
});
await page.waitForTimeout(400);
record(
  'a bar with one locked end keeps both padlocks and its fields live',
  await page.evaluate(
    () =>
      document.querySelectorAll('[data-hold-toggle]').length === 2 &&
      !document.querySelector('[data-hold-field="length"]').disabled &&
      !document.querySelector('[data-lock-banner]')
  )
);
const aLocked = await jointModel('A');
const lengthField = page.locator('[data-hold-field="length"]');
await lengthField.click({ clickCount: 3 });
await lengthField.type('3');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const aAfterTyping = await jointModel('A');
const bAfterTyping = await jointModel('B');
record(
  'typing a length on it moves the free end and leaves the locked one',
  // Joint positions are model pixels; the field spoke centimeters.
  Math.abs(dist(aAfterTyping, bAfterTyping) / 200 - 3) < 1e-3 &&
    aAfterTyping.x === aLocked.x &&
    aAfterTyping.y === aLocked.y,
  { aLocked, aAfterTyping, bAfterTyping }
);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.mechanismSrv.toggleLock(c.mechanismSrv.joints.find((j) => j.id === 'A'));
});
await page.waitForTimeout(300);

// --- Leaving Edit stands the chips down --------------------------------------

await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(600);
record(
  'the chips stand down outside Edit',
  await page.evaluate(() => document.querySelectorAll('[data-hold-chip]').length === 0)
);

await contactSheet(`${OUT}/*mid-drag*.png`, `${OUT}/sheet-mid-drag.png`, 2);
await browser.close();

if (errors.length) console.log('page errors:', errors.slice(0, 5));
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
