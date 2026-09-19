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
// theirs to this file. The panel's are sections 6 to 10: the Barrel and Rod
// panels and the slide's own (D12, D9), the one angle stated in three places
// (D10), and every rung of what gives when *Starts at* is typed (D11).
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

// --------------------------------------------- 6. the panels each piece opens
//
// The Edit Cylinder panel is gone (D12). Each piece of the part opens its own:
// a member is a named body with its own Length and the part's Angle, and the
// square between them is an ordinary joint panel with two rows of its own.
console.log('\neach piece opens its own panel');

/** Select a piece without hunting for its pixels; the click path is section 2. */
async function pick(which) {
  await page.evaluate((what) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    const target = what === 'seal' ? one.seal : what === 'barrel' ? one.barrel : one.rod;
    grid.activeObjService.updateSelectedObj(target);
  }, which);
  // The line above ran outside Angular's zone, so nothing has scheduled change
  // detection; a nudge across the canvas enters it and the DOM settles.
  await page.mouse.move(900, 300);
  await page.mouse.move(905, 305);
  await page.waitForTimeout(400);
}

/** What the open panel says, in the terms the spec is written in. */
const panelSays = () =>
  page.evaluate(() => {
    const card = document.querySelector('app-left-tabs');
    const text = (card?.innerText ?? '').replace(/\s+/g, ' ');
    const valueOf = (selector) => document.querySelector(selector)?.value ?? null;
    const disc = [...document.querySelectorAll('#toggle-block')].find((node) =>
      /Draw as a Disc/.test(node.innerText)
    );
    return {
      title:
        card
          ?.querySelector('#editable-title-block .titleRow')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() ?? '',
      text,
      length: valueOf('[data-hold-field="length"]'),
      angle: valueOf('[data-hold-field="angle"]'),
      sliderAngle: valueOf('[data-field="sliderAngle"]'),
      startsAt: valueOf('[data-field="cylinderStart"]'),
      padlocks: [...document.querySelectorAll('[data-hold-toggle]')].map((button) => ({
        which: button.getAttribute('data-hold-toggle'),
        on: button.classList.contains('on'),
      })),
      disc: disc ? { present: true, grayed: disc.className.includes('disabled') } : null,
      colors: [...document.querySelectorAll('color-picker')].map((node) =>
        node.innerText.replace(/\s+/g, ' ').trim()
      ),
      types: [...document.querySelectorAll('.jointType button')].map((button) => ({
        label: button.querySelector('.text')?.textContent?.trim(),
        chosen: button.classList.contains('chosen'),
        off: button.disabled,
        why: document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent,
      })),
      tracer: /Add tracer point/.test(text),
      force: /Add force/.test(text),
      grounded: /Grounded/.test(text),
      travel: /Travel/.test(text),
      input: /Add Input|Remove Input/.test(text),
      deleteHint: card?.querySelector('.mini-buttons.red')?.getAttribute('aria-label') ?? null,
    };
  });

ids = await oneCylinder();
await pick('barrel');
let card = await panelSays();
check(
  'the barrel opens as a named member, with a Length and an Angle',
  card.title === `Edit Barrel ${ids.a}${ids.s}` && !!card.length && !!card.angle,
  JSON.stringify({ title: card.title, length: card.length, angle: card.angle })
);
check(
  'its Visual Settings offer Barrel Color and a grayed Draw as a Disc',
  card.colors.some((label) => /Barrel Color/.test(label)) &&
    card.disc?.present === true &&
    card.disc?.grayed === true,
  JSON.stringify({ colors: card.colors, disc: card.disc })
);
check(
  'and there is no Add tracer point and no Add force on it at all',
  !card.tracer && !card.force,
  JSON.stringify({ tracer: card.tracer, force: card.force })
);
check(
  'its trash can says it takes the whole cylinder',
  card.deleteHint === 'Delete Cylinder',
  String(card.deleteHint)
);
await page.screenshot({
  path: `${OUT}/panel-barrel.png`,
  clip: { x: 0, y: 0, width: 300, height: 700 },
});

await pick('rod');
card = await panelSays();
check(
  'the rod opens as the member at the other end of the slide',
  card.title === `Edit Rod ${ids.s}${ids.b}` && !!card.length && !!card.angle,
  JSON.stringify({ title: card.title, length: card.length })
);
check(
  'with no color field of its own — one part, one color — and the disc grayed',
  card.colors.length === 0 && card.disc?.grayed === true,
  JSON.stringify({ colors: card.colors, disc: card.disc })
);
await page.screenshot({
  path: `${OUT}/panel-rod.png`,
  clip: { x: 0, y: 0, width: 300, height: 700 },
});

// --------------------------------------------------------- 7. D9: S's panel
console.log("\nthe slide's own panel");
await pick('seal');
card = await panelSays();
check(
  'the slide opens as an ordinary joint, with Slider Angle and Starts at',
  /^Edit Joint /.test(card.title) && card.sliderAngle !== null && card.startsAt !== null,
  JSON.stringify({ title: card.title, sliderAngle: card.sliderAngle, startsAt: card.startsAt })
);
check(
  'with no Grounded row and no Travel field',
  !card.grounded && !card.travel,
  JSON.stringify({ grounded: card.grounded, travel: card.travel })
);
const chosenType = card.types.find((one) => one.chosen);
check(
  'Prismatic is chosen and the other three are refused, in the model’s own words',
  chosenType?.label === 'Prismatic' &&
    card.types.filter((one) => one.off).length === 3 &&
    card.types.every((one) => one.chosen || /cylinder/.test(one.why ?? '')),
  JSON.stringify(card.types)
);
check('and Add Input is offered', card.input, card.text.slice(0, 120));
await page.screenshot({
  path: `${OUT}/panel-slide.png`,
  clip: { x: 0, y: 0, width: 300, height: 760 },
});

// Live, not decorative: pressing it puts the drive on S, and the settings that
// follow are a cylinder's — it opens and closes, at a length per second.
await page.locator('button', { hasText: 'Add Input' }).first().click();
await page.waitForTimeout(600);
const driven = await page.evaluate(() => ({
  input: ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.sealedStructures()[0]
    .seal.input,
  panel: document.querySelector('app-edit-panel').innerText.replace(/\s+/g, ' '),
}));
check(
  'Add Input puts the drive on the slide, and names its two directions',
  driven.input === true &&
    /Remove Input/.test(driven.panel) &&
    /Opening|Closing/.test(driven.panel) &&
    /cm\/s|m\/s|in\/s/.test(driven.panel),
  driven.panel.slice(0, 160)
);
await page.screenshot({
  path: `${OUT}/panel-slide-driven.png`,
  clip: { x: 0, y: 0, width: 300, height: 760 },
});

// And a cylinder already driven this way runs: the boom's ram is one, so
// pressing Play moves the rod along its own stroke.
await page.goto(`${BASE}?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
await pick('seal');
const beforePlay = await ram();
await page.locator('.playButton').first().click();
await page.waitForTimeout(1200);
const running = await ram();
await page.locator('.playButton').first().click();
await page.waitForTimeout(400);
check(
  "and a driven cylinder animates, with the slide's panel open over it",
  Math.abs(running.start - beforePlay.start) > 0.01 &&
    /Edit Joint /.test(await page.locator('app-edit-panel').innerText()),
  JSON.stringify({ before: beforePlay.start, running: running.start })
);
await page.screenshot({ path: `${OUT}/slide-driven.png` });

// ------------------------------------- 8. D12: lengths, padlocks, one undo
console.log('\na member’s Length, its padlocks, and one undo entry each');

/** Type into a field and let it commit, the way a reader does. */
async function typeInto(selector, text) {
  const field = page.locator(selector).first();
  await field.click({ clickCount: 3 });
  await field.fill(text);
  await field.press('Enter');
  await page.waitForTimeout(700);
}

ids = await oneCylinder();
await pick('barrel');
part = await ram();
// Short of the ceiling decision S6 sets: a barrel may not grow past the rod's
// own floor, which is the stroke.
const longer = ((part.barrelLength + 20) / 200).toFixed(2);
await typeInto('[data-hold-field="length"]', longer);
after = await ram();
check(
  "typing a Length moves the barrel's buried end and nothing else",
  after.barrelLength > part.barrelLength + 10 &&
    Math.abs(after.rodLength - part.rodLength) < 1e-6 &&
    Math.abs(after.a.x - part.a.x) < 1e-6,
  JSON.stringify({
    barrel: [part.barrelLength, after.barrelLength],
    rod: [part.rodLength, after.rodLength],
  })
);
await page.locator('button', { hasText: 'Undo' }).first().click();
await page.waitForTimeout(900);
const undone = await ram();
check(
  'and one Undo takes exactly that back',
  Math.abs(undone.barrelLength - part.barrelLength) < 0.5,
  JSON.stringify({ was: part.barrelLength, after: after.barrelLength, undone: undone.barrelLength })
);

// The two padlocks hold two different things (S5), and both panels say so.
ids = await oneCylinder();
await pick('rod');
await page.locator('[data-hold-toggle="length"]').click();
await page.waitForTimeout(500);
await page.locator('[data-hold-toggle="angle"]').click();
await page.waitForTimeout(500);
const rodCard = await panelSays();
await pick('barrel');
const barrelCard = await panelSays();
check(
  "fixing the rod's length and then the angle leaves both of the rod's rows held",
  rodCard.padlocks.every((one) => one.on),
  JSON.stringify(rodCard.padlocks)
);
check(
  "and the barrel's panel shows the same angle held, with its own length free",
  barrelCard.padlocks.find((one) => one.which === 'angle')?.on === true &&
    barrelCard.padlocks.find((one) => one.which === 'length')?.on === false,
  JSON.stringify(barrelCard.padlocks)
);
const written = await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const one = m.sealedStructures()[0];
  return { barrel: one.barrel.hold, rod: one.rod.hold };
});
check(
  'written as one H entry per member, the angle on the free one',
  written.barrel === 'angle' && written.rod === 'length',
  JSON.stringify(written)
);
// Releasing from either panel clears the part's angle (S5).
await page.locator('[data-hold-toggle="angle"]').click();
await page.waitForTimeout(500);
const released = await page.evaluate(() => {
  const one = ng
    .getComponent(document.querySelector('app-new-grid'))
    .mechanismSrv.sealedStructures()[0];
  return { barrel: one.barrel.hold, rod: one.rod.hold };
});
check(
  'and releasing it from the other panel clears it for both',
  released.barrel === undefined && released.rod === 'length',
  JSON.stringify(released)
);

// ------------------------------------------- 9. D10: one angle, three fields
console.log('\none angle, stated in three places');
ids = await oneCylinder();
await pick('barrel');
const barrelAngle = (await panelSays()).angle;
await pick('rod');
const rodAngle = (await panelSays()).angle;
await pick('seal');
const slideAngle = (await panelSays()).sliderAngle;
check(
  "the barrel's Angle, the rod's Angle and the slide's Slider Angle are one number",
  barrelAngle === rodAngle && rodAngle === slideAngle,
  JSON.stringify({ barrelAngle, rodAngle, slideAngle })
);

part = await ram();
await pick('barrel');
await typeInto('[data-hold-field="angle"]', '30');
after = await ram();
check(
  'typing it on a member turns the part about the slide by default',
  Math.abs(after.s.x - part.s.x) < 1e-6 &&
    Math.abs(after.s.y - part.s.y) < 1e-6 &&
    Math.abs(after.a.y - part.a.y) > 1,
  JSON.stringify({ s: [part.s, after.s], a: [part.a, after.a] })
);
await pick('seal');
check(
  'and the slide states the number that landed',
  Math.round(Number(String((await panelSays()).sliderAngle).replace(/[^\d.-]/g, ''))) === 30,
  String((await panelSays()).sliderAngle)
);

// Grounded at one end, that end is the pivot.
ids = await oneCylinder({ groundA: true });
part = await ram();
await pick('rod');
await typeInto('[data-hold-field="angle"]', '25');
after = await ram();
check(
  'with an end joint grounded, it turns about that joint instead',
  Math.abs(after.a.x - part.a.x) < 1e-6 &&
    Math.abs(after.a.y - part.a.y) < 1e-6 &&
    Math.abs(after.b.y - part.b.y) > 1,
  JSON.stringify({ a: [part.a, after.a], b: [part.b, after.b] })
);

// Grounded at both, the bearing is not the part's to change.
ids = await oneCylinder({ groundA: true, groundB: true });
part = await ram();
await pick('barrel');
await typeInto('[data-hold-field="angle"]', '40');
after = await ram();
const said = await page.locator('.notification').allInnerTexts();
check(
  'with both ends grounded the angle is refused, and something is said',
  Math.abs(after.a.y - part.a.y) < 1e-6 &&
    Math.abs(after.b.y - part.b.y) < 1e-6 &&
    said.some((text) => /grounded/.test(text)),
  JSON.stringify({ a: [part.a.y, after.a.y], b: [part.b.y, after.b.y], said })
);

// ---------------------------------------------- 10. D11: Starts at, and what gives
console.log('\nStarts at, and what gives');

/** Type a percentage into the slide's own field. */
async function setStart(value) {
  await pick('seal');
  await typeInto('[data-field="cylinderStart"]', value);
}

ids = await oneCylinder();
part = await ram();
await setStart('80');
after = await ram();
check(
  "by default the rod's end joint moves along the axis",
  after.b.x > part.b.x + 1 &&
    Math.abs(after.a.x - part.a.x) < 1e-6 &&
    Math.abs(after.barrelLength - part.barrelLength) < 1e-6 &&
    Math.abs(after.rodLength - part.rodLength) < 1e-6,
  JSON.stringify({ a: [part.a.x, after.a.x], b: [part.b.x, after.b.x] })
);

ids = await oneCylinder({ groundB: true });
part = await ram();
await setStart('80');
after = await ram();
check(
  "with the rod's end grounded, the barrel's end joint moves",
  Math.abs(after.b.x - part.b.x) < 1e-6 && Math.abs(after.a.x - part.a.x) > 1,
  JSON.stringify({ a: [part.a.x, after.a.x], b: [part.b.x, after.b.x] })
);

ids = await oneCylinder({ groundA: true, groundB: true });
part = await ram();
// Toward the barrel's own mount, which lengthens the rod: the other way asks
// for a rod shorter than the travel, which decision S3's floor refuses.
await setStart('20');
after = await ram();
check(
  "with both grounded, the rod's length changes instead",
  Math.abs(after.a.x - part.a.x) < 1e-6 &&
    Math.abs(after.b.x - part.b.x) < 1e-6 &&
    Math.abs(after.rodLength - part.rodLength) > 1,
  JSON.stringify({ rod: [part.rodLength, after.rodLength] })
);

// The rod holding its length hands the change to the barrel.
ids = await oneCylinder({ groundA: true, groundB: true });
await pick('rod');
await page.locator('[data-hold-toggle="length"]').click();
await page.waitForTimeout(500);
part = await ram();
await setStart('80');
after = await ram();
check(
  "and with the rod's length fixed, the barrel's changes",
  Math.abs(after.rodLength - part.rodLength) < 1e-6 &&
    Math.abs(after.barrelLength - part.barrelLength) > 1,
  JSON.stringify({ barrel: [part.barrelLength, after.barrelLength] })
);

// Both fixed, and there is nothing left to give.
await pick('barrel');
await page.locator('[data-hold-toggle="length"]').click();
await page.waitForTimeout(500);
part = await ram();
await setStart('30');
after = await ram();
const refused = await page.locator('.notification').allInnerTexts();
check(
  'with both lengths fixed the edit is refused and nothing moves',
  Math.abs(after.start - part.start) < 1e-6 &&
    Math.abs(after.barrelLength - part.barrelLength) < 1e-6 &&
    Math.abs(after.rodLength - part.rodLength) < 1e-6 &&
    refused.some((text) => /fixed/.test(text)),
  JSON.stringify({ start: [part.start, after.start], refused })
);
await page.screenshot({ path: `${OUT}/starts-at-refused.png` });

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
