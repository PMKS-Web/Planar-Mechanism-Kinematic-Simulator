// A cylinder is three things a reader can point at, not one.
//
// Stage 2c of docs/joint-type-and-cylinder-plan.md makes the square mid-skin
// joint S -- selectable, lettered, draggable -- and gives each member a
// selection of its own (decisions D9, S9, S11, S12). The unit suite checks the
// predicates; this is the gate that asks the *app*: what a click on each piece
// selects, what the drawing says about it, where S goes when it is dragged, and
// what letters a new cylinder and an old payload come up with.
//
// Structured as named sections because the panel and menu packages append
// theirs to this file.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-members.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-members';

const results = [];
const consoleErrors = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });
// One filmstrip for the whole run: `filmstrip()` clears its directory when it
// is made, so a second one on the same directory throws away the first's frames.
const film = filmstrip(page, OUT);

/**
 * A bare grid holding one cylinder, drawn through the same service call the
 * canvas's creation gesture makes.
 *
 * `groundB` anchors the rod's end joint instead of the barrel's, which is what
 * makes a drag of the seal move A rather than B (decision S7).
 */
async function oneCylinder(options = {}) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  return page.evaluate((how) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    m.createCylinderFrom({ x: -600, y: 0 }, { x: 600, y: 0 });
    const ram = m.sealedStructures()[0];
    if (how.groundA || how.groundB) {
      for (const end of [how.groundA && ram.mountA, how.groundB && ram.mountB].filter(Boolean)) {
        grid.activeObjService.updateSelectedObj(end);
        m.toggleGround();
      }
    }
    grid.settings.isShowID.next(true);
    grid.activeObjService.updateSelectedObj(null);
    return {
      a: ram.mountA.id,
      b: ram.mountB.id,
      s: ram.seal.id,
      n: ram.inner.id,
      barrel: ram.barrel.id,
      rod: ram.rod.id,
    };
  }, options);
}

/** What the drawing says about the part right now. */
const ram = () =>
  page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const one = m.sealedStructures()[0];
    const at = (joint) => ({ x: joint.x, y: joint.y });
    return {
      start: one.start,
      a: at(one.mountA),
      n: at(one.inner),
      s: at(one.seal),
      b: at(one.mountB),
      barrelLength: Math.hypot(one.inner.x - one.mountA.x, one.inner.y - one.mountA.y),
      rodLength: Math.hypot(one.mountB.x - one.seal.x, one.mountB.y - one.seal.y),
    };
  });

/** What the app has selected, and what the mode panel is headed. */
const selection = () =>
  page.evaluate(() => {
    const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
    return {
      type: active.objType,
      link: active.selectedLink?.id,
      joint: active.selectedJoint?.id,
      // The Edit panel's heading, which is the block's own words plus the
      // selected object's name.
      title:
        document
          .querySelector('app-left-tabs #editable-title-block .titleRow')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? '',
    };
  });

/** The screen point a model point sits at, so a click can be aimed by geometry. */
const screenAt = (model) =>
  page.evaluate((point) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const at = grid.svgGrid.modelToScreen(point);
    return { x: at.x, y: at.y };
  }, model);

/** Halfway along the exposed barrel, clear of the seal's square and of joint A. */
async function barrelPoint(part) {
  return screenAt({ x: (part.a.x + part.s.x) / 2 - 150, y: (part.a.y + part.s.y) / 2 });
}

/** Halfway along the exposed rod, clear of the square and of joint B. */
async function rodPoint(part) {
  return screenAt({ x: (part.s.x + part.b.x) / 2 + 150, y: (part.s.y + part.b.y) / 2 });
}

async function clickAt(point) {
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(250);
}

// ------------------------------------------------- 1. the square is joint S
console.log('\nthe square is joint S');
let ids = await oneCylinder();
check(
  'a new cylinder letters its two ends and its seal, and only those',
  ids.a === 'A' && ids.b === 'B' && ids.s === 'C' && ids.n === 'A1',
  JSON.stringify(ids)
);

let part = await ram();
let sealPoint = await screenAt(part.s);
await clickAt(sealPoint);
let picked = await selection();
check(
  'clicking the square selects joint S, and the panel is headed with it',
  picked.type === 'Joint' && picked.joint === ids.s && /Edit Joint\s+C\b/.test(picked.title),
  JSON.stringify(picked)
);
await page.screenshot({
  path: `${OUT}/seal-selected.png`,
  clip: { x: sealPoint.x - 320, y: sealPoint.y - 140, width: 740, height: 300 },
});

const seenOnCanvas = await page.evaluate((where) => {
  const letters = [...document.querySelectorAll('#jointTagHolder text')].map((node) =>
    node.textContent.trim()
  );
  return {
    letters,
    sealHitbox: !!document.querySelector(`#joint_${where.s}`),
    innerHitbox: !!document.querySelector(`#joint_${where.n}`),
  };
}, ids);
check(
  'S wears its letter and has a hitbox; N has neither',
  seenOnCanvas.letters.includes(ids.s) &&
    seenOnCanvas.sealHitbox &&
    !seenOnCanvas.letters.includes(ids.n) &&
    !seenOnCanvas.innerHitbox,
  JSON.stringify(seenOnCanvas)
);

// The letter has to be readable, which means off the metal: its offset runs
// across the part's own axis rather than straight up, so an upright cylinder
// does not write its own name on its barrel.
const letterClear = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const one = grid.mechanismSrv.sealedStructures()[0];
  const anchor = grid.jointTagAnchor(one.seal);
  return {
    across: Math.abs(-anchor.y - one.seal.y),
    barrelHalf: 2.6 * 0.15 * grid.settings.objectScale,
  };
});
check(
  'the letter stands clear of the barrel, across the axis',
  letterClear.across > letterClear.barrelHalf,
  JSON.stringify(letterClear)
);

// -------------------------------------------- 2. each member selects itself
console.log('\nclicking a member selects that member');
const barrelAt = await barrelPoint(part);
await clickAt(barrelAt);
picked = await selection();
check(
  'the barrel path selects the barrel link',
  picked.type === 'Link' && picked.link === ids.barrel,
  JSON.stringify(picked)
);
const barrelOutline = await page.evaluate(() => ({
  barrel: !!document.querySelector('.cylinder-barrel-selected'),
  rod: !!document.querySelector('.cylinder-rod-selected'),
  seal: !!document.querySelector('.cylinder-seal-selected'),
}));
check(
  'and the barrel alone is outlined',
  barrelOutline.barrel && !barrelOutline.rod && !barrelOutline.seal,
  JSON.stringify(barrelOutline)
);
await page.screenshot({
  path: `${OUT}/barrel-selected.png`,
  clip: { x: sealPoint.x - 320, y: sealPoint.y - 140, width: 740, height: 300 },
});

const rodAt = await rodPoint(part);
await clickAt(rodAt);
picked = await selection();
const rodOutline = await page.evaluate(() => ({
  barrel: !!document.querySelector('.cylinder-barrel-selected'),
  rod: !!document.querySelector('.cylinder-rod-selected'),
  seal: !!document.querySelector('.cylinder-seal-selected'),
}));
check(
  'the rod path selects the rod link, and the rod alone is outlined',
  picked.type === 'Link' &&
    picked.link === ids.rod &&
    rodOutline.rod &&
    !rodOutline.barrel &&
    !rodOutline.seal,
  JSON.stringify({ picked, rodOutline })
);
await page.screenshot({
  path: `${OUT}/rod-selected.png`,
  clip: { x: sealPoint.x - 320, y: sealPoint.y - 140, width: 740, height: 300 },
});

await clickAt(sealPoint);
const sealOutline = await page.evaluate(() => ({
  barrel: !!document.querySelector('.cylinder-barrel-selected'),
  rod: !!document.querySelector('.cylinder-rod-selected'),
  seal: !!document.querySelector('.cylinder-seal-selected'),
}));
check(
  'and with S picked, neither member is outlined',
  sealOutline.seal && !sealOutline.barrel && !sealOutline.rod,
  JSON.stringify(sealOutline)
);

// A selection that closes over the whole part lights all three, as bars in a
// selection do.
const closed = await page.evaluate((where) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.replacePartSelection(
    grid.mechanismSrv.links.find((link) => link.id === where.barrel)
  );
  grid.activeObjService.togglePartSelection(
    grid.mechanismSrv.links.find((link) => link.id === where.rod)
  );
  grid.activeObjService.togglePartSelection(
    grid.mechanismSrv.joints.find((joint) => joint.id === where.s)
  );
  return grid.activeObjService.objType;
}, ids);
await page.waitForTimeout(250);
const allThree = await page.evaluate(() => ({
  barrel: !!document.querySelector('.cylinder-barrel-selected'),
  rod: !!document.querySelector('.cylinder-rod-selected'),
  seal: !!document.querySelector('.cylinder-seal-selected'),
}));
check(
  'a multi-selection over the whole part lights all three',
  allThree.barrel && allThree.rod && allThree.seal,
  JSON.stringify({ closed, allThree })
);
await page.screenshot({
  path: `${OUT}/whole-part-selected.png`,
  clip: { x: sealPoint.x - 320, y: sealPoint.y - 140, width: 740, height: 300 },
});

// ------------------------------------------------------- 3. dragging the seal
console.log('\ndragging the seal slides it between the stops');
ids = await oneCylinder({ groundA: true });
part = await ram();
sealPoint = await screenAt(part.s);
await page.mouse.move(sealPoint.x, sealPoint.y);
await page.mouse.down();
await film.during(60, 8, 'seal-drag', async () => {
  await page.mouse.move(sealPoint.x + 200, sealPoint.y + 60, { steps: 20 });
});
await page.mouse.up();
await page.waitForTimeout(350);
await film.shot('seal-drag-settled');
await contactSheet(`${OUT}/*seal-drag*.png`, `${OUT}/sheet-seal-drag.png`, 4);
let after = await ram();
check(
  'the seal slid open and carried B with it, changing no length',
  after.start > part.start + 0.1 &&
    Math.abs(after.a.x - part.a.x) < 1e-6 &&
    after.b.x > part.b.x + 1 &&
    Math.abs(after.barrelLength - part.barrelLength) < 1e-3 &&
    Math.abs(after.rodLength - part.rodLength) < 1e-3,
  JSON.stringify({ before: part.start, after: after.start, b: [part.b.x, after.b.x] })
);
check(
  'and it stayed on its own axis',
  Math.abs(after.s.y - part.s.y) < 1e-6 && Math.abs(after.b.y - part.b.y) < 1e-6,
  JSON.stringify({ s: after.s, b: after.b })
);

// Grounded at the rod's end instead, the other end is what gives.
ids = await oneCylinder({ groundB: true });
part = await ram();
sealPoint = await screenAt(part.s);
await page.mouse.move(sealPoint.x, sealPoint.y);
await page.mouse.down();
await page.mouse.move(sealPoint.x + 200, sealPoint.y, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(350);
after = await ram();
check(
  'with B grounded, the seal slides and A moves instead',
  Math.abs(after.b.x - part.b.x) < 1e-6 && Math.abs(after.a.x - part.a.x) > 1,
  JSON.stringify({ a: [part.a.x, after.a.x], b: [part.b.x, after.b.x] })
);

// Both ends held: a drag never changes a length, so there is nowhere to go and
// nothing is said about it (decision S7).
ids = await oneCylinder({ groundA: true, groundB: true });
part = await ram();
sealPoint = await screenAt(part.s);
await page.mouse.move(sealPoint.x, sealPoint.y);
await page.mouse.down();
await page.mouse.move(sealPoint.x + 200, sealPoint.y, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(350);
after = await ram();
const quiet = await page.locator('app-notification .notification').count();
check(
  'with both ends grounded the seal stays put, silently',
  Math.abs(after.s.x - part.s.x) < 1e-6 && quiet === 0,
  JSON.stringify({ s: [part.s.x, after.s.x], notifications: quiet })
);

// --------------------------------------------- 4. dragging a member moves all
console.log('\ndragging a member still drags the whole cylinder');
ids = await oneCylinder();
part = await ram();
const grabBarrel = await barrelPoint(part);
await page.mouse.move(grabBarrel.x, grabBarrel.y);
await page.mouse.down();
await page.mouse.move(grabBarrel.x + 90, grabBarrel.y - 120, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(350);
after = await ram();
const moved = (was, now) => ({ dx: now.x - was.x, dy: now.y - was.y });
const shifts = [
  moved(part.a, after.a),
  moved(part.n, after.n),
  moved(part.s, after.s),
  moved(part.b, after.b),
];
check(
  'grabbing the barrel translates the whole part rigidly',
  Math.hypot(shifts[0].dx, shifts[0].dy) > 10 &&
    shifts.every(
      (shift) =>
        Math.abs(shift.dx - shifts[0].dx) < 1e-3 && Math.abs(shift.dy - shifts[0].dy) < 1e-3
    ),
  JSON.stringify(shifts)
);

ids = await oneCylinder();
part = await ram();
const grabRod = await rodPoint(part);
await page.mouse.move(grabRod.x, grabRod.y);
await page.mouse.down();
await page.mouse.move(grabRod.x - 70, grabRod.y + 110, { steps: 16 });
await page.mouse.up();
await page.waitForTimeout(350);
after = await ram();
const rodShifts = [
  moved(part.a, after.a),
  moved(part.n, after.n),
  moved(part.s, after.s),
  moved(part.b, after.b),
];
check(
  'and grabbing the rod does the same, rather than stretching the part',
  Math.hypot(rodShifts[0].dx, rodShifts[0].dy) > 10 &&
    rodShifts.every(
      (shift) =>
        Math.abs(shift.dx - rodShifts[0].dx) < 1e-3 && Math.abs(shift.dy - rodShifts[0].dy) < 1e-3
    ) &&
    Math.abs(after.start - part.start) < 1e-6,
  JSON.stringify(rodShifts)
);

// ------------------------------------------------------ 5. an old payload's S
console.log('\nan old payload opens with its seal lettered');
// `Excavator_Bucket` was drawn in the app and pasted in as the URL it wrote,
// back when a seal was hidden and took an interior name (`A2`). Opening it is
// the whole of decision S9 seen from the reader's side: the name a panel title,
// a canvas label and an export column would otherwise have shown.
await page.goto(`${BASE}?${payloads['Excavator_Bucket']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
const legacy = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  grid.settings.isShowID.next(true);
  const one = m.sealedStructures()[0];
  if (!one) return { rams: m.sealedStructures().length };
  return {
    rams: 1,
    seal: one.seal.id,
    sealName: one.seal.name,
    inner: one.inner.id,
    rod: one.rod.id,
    barrel: one.barrel.id,
    ids: m.joints.map((joint) => joint.id),
    // The payload's own interior name, which nothing on the canvas may show.
    interiorShown: [...document.querySelectorAll('#jointTagHolder text')]
      .map((node) => node.textContent.trim())
      .filter((text) => /\d/.test(text)),
  };
});
check(
  "an old payload's seal opens with a letter, and its buried end keeps its name",
  legacy.rams === 1 &&
    /^[A-Za-z]+$/.test(legacy.seal ?? '') &&
    legacy.seal === legacy.sealName &&
    !/^[A-Za-z]+$/.test(legacy.inner ?? ''),
  JSON.stringify(legacy)
);
check(
  'and the rod it is on is named after it, with no interior name drawn anywhere',
  (legacy.rod ?? '').includes(legacy.seal) && legacy.interiorShown.length === 0,
  JSON.stringify({ rod: legacy.rod, shown: legacy.interiorShown })
);
await page.screenshot({ path: `${OUT}/legacy-payload.png` });

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
