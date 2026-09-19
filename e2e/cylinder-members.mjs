// A cylinder is three things a reader can point at, not one.
//
// Stage 2c of docs/joint-type-and-cylinder-plan.md makes the square mid-skin
// joint S -- selectable, lettered, draggable -- and gives each member a
// selection of its own (decisions D9, S9, S11, S12). The unit suite checks the
// predicates; this is the gate that asks the *app*: what a click on each piece
// selects, what the drawing says about it, where S goes when it is dragged, and
// what letters a new cylinder and an old payload come up with.
//
// Structured as named sections because each package of Stage 2 appended its
// own. Sections 6 to 10 are the panel's: the Barrel and Rod panels and the
// slide's own (D12, D9), the one angle stated in three places (D10), and every
// rung of what gives when *Starts at* is typed (D11). Section 11 is an end
// joint as an ordinary pin (D13), and section 12 is a driven cylinder's full
// out-and-back cycle, frame by frame, with a contact sheet to read it on.
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
/**
 * Where the seal's own mark is photographed, next to the bare slider's.
 *
 * `phase4-marks.mjs` photographs the same mark on a plain slider into the same
 * directory: one mark, one folder, so the two are reviewed against each other
 * rather than in two places.
 */
const MARK_OUT = 'artifacts/slide-mark';

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
mkdirSync(MARK_OUT, { recursive: true });
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
    // `from` and `to` are for the two shapes the mark has to survive: a ram too
    // short to carry a full-size piston head, and one at an angle that is
    // neither of the two the axes hand you for free.
    m.createCylinderFrom(how.from ?? { x: -600, y: 0 }, how.to ?? { x: 600, y: 0 });
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

/**
 * Which of the three parts is drawn as picked.
 *
 * The two members say it with an outline round their own geometry; S says it
 * the way every other joint does, on its own mark. The head it rides is
 * furniture and is never outlined -- the `cylinder-seal-selected` path this
 * used to look for is gone with the weld cross the joint layer used to skip.
 */
const litUp = () =>
  page.evaluate(() => {
    const seal = ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.sealedStructures()[0].seal.id;
    return {
      barrel: !!document.querySelector('.cylinder-barrel-selected'),
      rod: !!document.querySelector('.cylinder-rod-selected'),
      seal: !!document.querySelector(`#joint_${seal}`)?.classList.contains('joint-selected'),
      head: document.querySelector('.cylinder-seal')?.getAttribute('fill'),
    };
  });

/** The seal's own mark, measured in the frame the head is drawn in. */
const sealMark = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const id = grid.mechanismSrv.sealedStructures()[0].seal.id;
    const mark = document.querySelector(`#joint_${id}`);
    const head = document.querySelector('.cylinder-seal');
    const turn = (node) => {
      const found = /rotate\(\s*(-?[\d.]+)/.exec(node?.getAttribute('transform') ?? '');
      return found ? Number(found[1]) : null;
    };
    const box = mark.getBBox();
    const rect = mark.getBoundingClientRect();
    const badge = mark.closest('svg')?.querySelector('.lockBadge');
    const badgeRect = badge?.getBoundingClientRect();
    return {
      id,
      tag: mark.tagName,
      classes: mark.getAttribute('class') ?? '',
      arcs: (mark.getAttribute('d').match(/A /g) ?? []).length,
      // `getBBox` is the element's own frame, and the turn onto the slot sits
      // on the group above it -- so "wider than tall, here" is "along the slot".
      along: box.width,
      across: box.height,
      turn: turn(mark.parentElement),
      // The skin's own frame, which the head is drawn in.
      headTurn: turn(document.querySelector('.cylinder-mark')),
      headAlong: head.getBBox().width,
      headAcross: head.getBBox().height,
      headFill: head.getAttribute('fill'),
      ring: !!mark.parentElement?.querySelector('.jointSelectionRing'),
      badge: !!badge,
      chip: !!mark.closest('svg')?.querySelector('.lockChip'),
      badgeOnMark:
        !!badgeRect &&
        badgeRect.x + badgeRect.width / 2 > rect.x &&
        badgeRect.x + badgeRect.width / 2 < rect.x + rect.width &&
        badgeRect.y + badgeRect.height / 2 > rect.y &&
        badgeRect.y + badgeRect.height / 2 < rect.y + rect.height,
      screen: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });

/** A clip round the whole ram, so the mark is read against the part it is on. */
const clipRam = async () => {
  const where = (await sealMark()).screen;
  return {
    x: Math.max(0, where.x + where.width / 2 - 380),
    y: Math.max(0, where.y + where.height / 2 - 150),
    width: 760,
    height: 300,
  };
};

/** And a tight one on the head, where the mark's own proportions are readable. */
const clipHead = async (half = 90) => {
  const where = (await sealMark()).screen;
  return {
    x: Math.max(0, where.x + where.width / 2 - half),
    y: Math.max(0, where.y + where.height / 2 - half / 2),
    width: half * 2,
    height: half,
  };
};

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

// ------------------------------------------- 1b. the mark S wears
//
// S is a slider whose riders cannot turn, so it wears the cream bar every such
// slider wears, lying along its own axis on the black piston head. The head is
// furniture: it takes the gesture and none of the state.
console.log("\nthe seal's own mark, and the head it rides");
// Section 1 left S picked and the pointer parked on it, and a picked or
// pointed-at joint is drawn in amber: the mark at rest is what the reference
// drawing shows, so this starts from nothing picked and nothing under the mouse.
await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).activeObjService.updateSelectedObj(null)
);
await page.mouse.move(8, 8);
await page.waitForTimeout(400);
let mark = await sealMark();
check(
  'S wears a rounded cream bar along its own axis, inside the head',
  mark.tag === 'path' &&
    mark.classes.includes('slideMark') &&
    mark.arcs === 4 &&
    mark.along > mark.across * 1.6 &&
    mark.turn === mark.headTurn &&
    // A visible band of black at each end and along each side, which is what
    // makes it read as a mark *on* the head rather than as a smaller head.
    mark.along < mark.headAlong - 8 &&
    mark.across < mark.headAcross - 8,
  JSON.stringify(mark)
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-idle.png`, clip: await clipRam() });
await page.screenshot({ path: `${MARK_OUT}/cylinder-idle-detail.png`, clip: await clipHead() });

await page.mouse.move(sealPoint.x, sealPoint.y);
await page.waitForTimeout(400);
mark = await sealMark();
check(
  'pointing at the head lights the bar and leaves the head black',
  mark.classes.includes('joint-highlight') && mark.headFill === '#000000',
  JSON.stringify({ classes: mark.classes, headFill: mark.headFill })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-hovered.png`, clip: await clipRam() });

await clickAt(sealPoint);
mark = await sealMark();
check(
  'and selecting it says so on the bar, with nothing outlined on the head',
  mark.classes.includes('joint-selected') &&
    mark.headFill === '#000000' &&
    !(await page.evaluate(() => !!document.querySelector('.cylinder-seal-selected'))),
  JSON.stringify({ classes: mark.classes, headFill: mark.headFill })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-selected.png`, clip: await clipRam() });

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const seal = grid.mechanismSrv.sealedStructures()[0].seal;
  grid.activeObjService.updateSelectedObj(seal);
  grid.mechanismSrv.toggleLock(seal);
});
await page.waitForTimeout(500);
mark = await sealMark();
check(
  'a locked seal wears its padlock on the bar, with no chip under it',
  mark.badge && mark.badgeOnMark && !mark.chip,
  JSON.stringify({ badge: mark.badge, on: mark.badgeOnMark, chip: mark.chip })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-locked.png`, clip: await clipRam() });

// A ram too short to carry a full-size head shrinks the head, and the mark
// shrinks with it rather than filling the black it is supposed to be marked on.
// The span clamps to the smallest a creation gesture will draw, which is also
// the one that puts the head at its own floor: a square.
await oneCylinder({ from: { x: -70, y: 0 }, to: { x: 70, y: 0 } });
await page.waitForTimeout(500);
const small = await sealMark();
check(
  'on the shortest ram the head shrinks and the mark shrinks inside it',
  small.headAlong < mark.headAlong &&
    small.along < mark.along &&
    small.along < small.headAlong - 8 &&
    Math.abs(small.along / small.across - mark.along / mark.across) < 0.01,
  JSON.stringify({ small, was: { along: mark.along, head: mark.headAlong } })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-min.png`, clip: await clipRam() });

// Neither of the two angles the axes hand you for free.
await oneCylinder({ from: { x: -300, y: -520 }, to: { x: 300, y: 520 } });
await page.waitForTimeout(500);
const steep = await sealMark();
check(
  'and at 60 degrees the bar lies along the ram, not along the screen',
  Math.abs(Math.abs(steep.turn) - 60) < 0.5 &&
    steep.turn === steep.headTurn &&
    steep.along > steep.across * 1.6,
  JSON.stringify({ turn: steep.turn, headTurn: steep.headTurn })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-60deg.png`, clip: await clipRam() });

// ...and it stays on the head while the head moves, which is the one thing a
// mark drawn in its own layer above the skin could get wrong.
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(250);
const drivenRam = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const pick = (j) => grid.activeObjService.updateSelectedObj(j);
  m.createCylinderFrom({ x: -800, y: 0 }, { x: 400, y: 0 });
  const one = m.sealedStructures()[0];
  const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 400, y: one.mountB.y + 600 });
  const tip = bar.joints.find((j) => j.id !== one.mountB.id);
  const tipId = tip.id;
  pick(one.mountB);
  m.weldJoint();
  pick(one.mountA);
  m.toggleGround();
  // By letter: gaining a slot exchanges the joint for a `PrisJoint` keeping its
  // id, so the object captured before that grounds nothing at all.
  pick(m.joints.find((j) => j.id === tipId));
  m.toggleSlider();
  pick(m.joints.find((j) => j.id === tipId));
  m.toggleGround();
  // The drive is the seal's own, through the ordinary input door.
  pick(m.sealedStructures()[0].seal);
  m.adjustInput();
  m.finishStructuralEdit(true);
  pick(null);
  return { samples: m.masterMechanism()?.joints.length ?? 0 };
});
await page.waitForTimeout(400);
const atRest = await sealMark();
await page.evaluate((samples) => {
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(
    Math.max(1, Math.round(samples * 0.35)),
    false
  );
}, drivenRam.samples);
await page.waitForTimeout(400);
const midCycle = await sealMark();
check(
  'the mark follows the head through playback, still turned with it',
  midCycle.turn === midCycle.headTurn &&
    midCycle.along === atRest.along &&
    // It actually went somewhere -- a mark that never moved would pass the
    // agreement above by standing still with the head.
    Math.hypot(midCycle.screen.x - atRest.screen.x, midCycle.screen.y - atRest.screen.y) > 4,
  JSON.stringify({ rest: atRest.screen, mid: midCycle.screen, turn: midCycle.turn })
);
await page.screenshot({ path: `${MARK_OUT}/cylinder-playback.png`, clip: await clipRam() });

// Back to the plain ram the sections below are written against -- and one pass
// over it close up, because the proportions of a mark drawn at 21 model units
// are not something a picture of the whole ram can be read for.
ids = await oneCylinder();
await page.waitForTimeout(500);
part = await ram();
sealPoint = await screenAt(part.s);
await page.evaluate((at) => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  for (let step = 0; step < 3; step += 1) grid.svgGrid.panZoomObject.zoomAtPointBy(1.6, at);
}, sealPoint);
await page.waitForTimeout(400);
await page.screenshot({ path: `${MARK_OUT}/cylinder-detail-idle.png`, clip: await clipHead(240) });
await clickAt(await screenAt((await ram()).s));
await page.screenshot({
  path: `${MARK_OUT}/cylinder-detail-selected.png`,
  clip: await clipHead(240),
});

ids = await oneCylinder();
part = await ram();
sealPoint = await screenAt(part.s);

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
const barrelOutline = await litUp();
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
const rodOutline = await litUp();
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
const sealOutline = await litUp();
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
const allThree = await litUp();
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
// The stack's host is `app-notification-stack`; `app-notification` matches
// nothing, and a count of nothing is indistinguishable from a count of zero.
// So the selector is proved before it is believed: something definitely
// refused has to make this number go up.
const notifications = () => page.locator('app-notification-stack .notification').count();
const quiet = await notifications();
// Grounding the slide is refused, says so, and changes nothing -- which makes
// it the cheapest proof that the selector above can find a message.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  grid.activeObjService.updateSelectedObj(m.sealedStructures()[0].seal);
  m.toggleGround();
});
await page.waitForTimeout(300);
const loud = await notifications();
check(
  'with both ends grounded the seal stays put, silently',
  Math.abs(after.s.x - part.s.x) < 1e-6 && quiet === 0 && loud > 0,
  JSON.stringify({ s: [part.s.x, after.s.x], quiet, loud })
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

// ----------------------------------------- 11. D13: an end joint is a pin
console.log('\nan end joint is a pin like any other');

/** The menu the app builds for whatever is under this model point. */
async function menuAt(model) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const at = await screenAt(model);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const menu = ng.getComponent(document.querySelector('app-new-grid')).cMenu;
    return {
      title: menu?.header?.title ?? null,
      subtitle: menu?.header?.subtitle ?? null,
      // A value's `refusal` *is* its disabled flag, and `chosen` is an index
      // on the choice rather than a flag on the value.
      choice: (menu?.choice?.options ?? []).map((one, at) => ({
        label: one.label,
        off: !!one.refusal,
        why: one.refusal?.short ?? '',
        on: at === menu.choice.chosen,
      })),
      rows: (menu?.groups ?? []).flatMap((group) =>
        group.rows.map((row) => ({
          label: row.label,
          off: !!row.refusal,
          why: row.refusal?.short ?? '',
        }))
      ),
    };
  });
}

ids = await oneCylinder();
part = await ram();
const endMenu = await menuAt(part.a);
const endRow = (label) => endMenu.rows.find((row) => row.label === label);
check(
  'the end joint opens a joint card named after itself',
  endMenu.title === `Joint ${ids.a}`,
  JSON.stringify({ title: endMenu.title, subtitle: endMenu.subtitle })
);
// Nothing about being a cylinder's attachment point closes a value here. The
// slide's own card refuses three of the four "inside a cylinder" (section 7);
// this card refuses nothing for that reason, and Welded only because a bare
// end joint has one link on it and a weld needs two -- arithmetic, not a rule
// about cylinders.
check(
  'and no joint type is refused there for being on a cylinder',
  endMenu.choice.length === 4 && endMenu.choice.every((one) => !/cylinder/i.test(one.why)),
  JSON.stringify(endMenu.choice)
);
check(
  'the three that need no neighbor are live, and Welded wants a second link',
  ['Revolute', 'Prismatic', 'Pin-in-slot'].every(
    (label) => !endMenu.choice.find((one) => one.label === label)?.off
  ) && endMenu.choice.find((one) => one.label === 'Welded')?.why === 'needs 2 links',
  JSON.stringify(endMenu.choice.map((one) => [one.label, one.why]))
);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// Give it that second link and all four are live: an end joint is a pin, and
// welding a cylinder into a bracket is the ordinary thing to want (D13).
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const end = m.sealedStructures()[0].mountA;
  m.addBarFrom(end, { x: end.x - 300, y: end.y + 500 });
  m.finishStructuralEdit(true);
  grid.activeObjService.updateSelectedObj(null);
});
await page.waitForTimeout(350);
const withNeighbor = await menuAt((await ram()).a);
check(
  'with a neighbor bar on it, all four are offered',
  withNeighbor.choice.length === 4 && withNeighbor.choice.every((one) => !one.off),
  JSON.stringify(withNeighbor.choice.map((one) => [one.label, one.why]))
);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ids = await oneCylinder();
part = await ram();
check(
  'its delete row names the cascade rather than hiding it',
  endMenu.rows.some((row) => /^Delete Joint \(and Cylinder/.test(row.label)),
  JSON.stringify(endMenu.rows.map((row) => row.label))
);
// Attaching at an end joint is the whole point of an end joint, and it is the
// rule the slide refuses with "inside a cylinder" -- so the two cards read as
// opposites on the same three rows.
const attachable = ['Link', 'Cylinder', 'Force'].map((label) => endRow(label));
check(
  'Link, Cylinder and Force are all offered there',
  attachable.every((row) => row && !row.off),
  JSON.stringify(attachable)
);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);

// And it grounds like any pin, which the slide's card refuses outright.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.sealedStructures()[0].mountA);
  grid.mechanismSrv.toggleGround();
});
await page.waitForTimeout(300);
check(
  'grounding an end joint is allowed and takes',
  await page.evaluate(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.sealedStructures()[0]
        .mountA.ground === true
  )
);

// ------------------------------- 12. a full out-and-back cycle, frame by frame
console.log('\na driven cylinder, out and back');

/**
 * The machine section 1b drives, rebuilt here because the sections between
 * have been working on a plain cylinder.
 *
 * A cylinder anchored at its barrel end, a bracket welded to its rod end, and
 * that bracket's far end riding a grounded slot: one freedom, driven by the
 * slide, so extending the cylinder walks the block along its rail.
 */
async function drivenCylinder() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  const built = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const choose = (joint) => grid.activeObjService.updateSelectedObj(joint);
    m.createCylinderFrom({ x: -800, y: 0 }, { x: 400, y: 0 });
    const one = m.sealedStructures()[0];
    const bar = m.addBarFrom(one.mountB, { x: one.mountB.x + 400, y: one.mountB.y + 600 });
    const tipId = bar.joints.find((joint) => joint.id !== one.mountB.id).id;
    choose(one.mountB);
    m.weldJoint();
    choose(one.mountA);
    m.toggleGround();
    // By letter between the two calls: gaining a slot exchanges the joint for
    // a `PrisJoint` keeping its id, so the object captured before grounds
    // nothing at all.
    choose(m.joints.find((joint) => joint.id === tipId));
    m.toggleSlider();
    choose(m.joints.find((joint) => joint.id === tipId));
    m.toggleGround();
    choose(m.sealedStructures()[0].seal);
    m.adjustInput();
    m.finishStructuralEdit(true);
    grid.settings.isShowID.next(true);
    choose(null);
    const live = m.sealedStructures()[0];
    return { samples: m.masterMechanism()?.joints.length ?? 0, n: live.inner.id, s: live.seal.id };
  });
  await page.waitForTimeout(400);
  return built;
}

const cycle = await drivenCylinder();
check(
  'the driven cylinder solves every sample of its cycle',
  cycle.samples > 8,
  `${cycle.samples}`
);

/**
 * Where the slide stands, and whether N is drawn, at one sample.
 *
 * `start` is the record's own reading -- the seal's place in its travel, 0
 * shut to 1 open -- which is the number the part is actually posed by. N is
 * asked for by id in the drawing, because "no hitbox, no letter" is a claim
 * about the DOM and not about the record.
 */
const frameFacts = (n) =>
  page.evaluate((hidden) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    const labels = [...document.querySelectorAll('#tagHolder text, .jointTag')].map((node) =>
      (node.textContent ?? '').trim()
    );
    return {
      start: one.start,
      drawn: !!document.querySelector(`#joint_${hidden}`),
      labelled: labels.includes(hidden),
    };
  }, n);

/**
 * A box round the whole machine, with room for it to swing.
 *
 * Its own filmstrip in a subdirectory of this suite's, because the frames are
 * worth looking at and a full 1600×1000 window tiled twelve ways is mostly
 * empty grid. `filmstrip()` empties the directory it is given, so it has to be
 * a directory of its own or it would throw away every frame taken above.
 */
const machineClip = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const points = grid.mechanismSrv.joints.map((joint) => grid.svgGrid.modelToScreen(joint));
  const xs = points.map((at) => at.x);
  const ys = points.map((at) => at.y);
  const pad = 150;
  const x = Math.max(0, Math.min(...xs) - pad);
  const y = Math.max(0, Math.min(...ys) - pad);
  return {
    x,
    y,
    width: Math.min(window.innerWidth - x, Math.max(...xs) - x + pad),
    height: Math.min(window.innerHeight - y, Math.max(...ys) - y + pad),
  };
});
const cycleFilm = filmstrip(page, `${OUT}/cycle`, machineClip);

const FRAMES = 12;
const cycleFrames = [];
for (let i = 0; i < FRAMES; i++) {
  // Across the whole cycle rather than through playback: `animate(index)` from
  // outside is a seek, so the frames land on sample boundaries this can name
  // instead of wherever a timer happened to fire.
  const sample = Math.round((i * (cycle.samples - 1)) / (FRAMES - 1));
  await page.evaluate(
    (at) => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(at, false),
    sample
  );
  await page.waitForTimeout(160);
  cycleFrames.push({ sample, ...(await frameFacts(cycle.n)) });
  await cycleFilm.shot(`cycle-${String(i).padStart(2, '0')}`);
}
const sheet = await contactSheet(`${OUT}/cycle/*cycle-*.png`, `${OUT}/sheet-cycle.png`, 4);
console.log(`  contact sheet: ${sheet || `${OUT}/sheet-cycle.png`}`);

const starts = cycleFrames.map((frame) => frame.start);
const peakAt = starts.indexOf(Math.max(...starts));
check(
  'the slide goes closed, open and closed again over one cycle',
  // Out and back: the extreme is somewhere in the middle, both ends are near
  // the pose it was drawn in, and the last sample is the first again -- which
  // is what a cylinder's cycle means (a pin's comes back by turning on).
  peakAt > 0 &&
    peakAt < FRAMES - 1 &&
    Math.max(...starts) - Math.min(...starts) > 0.2 &&
    Math.abs(starts.at(-1) - starts[0]) < 0.02,
  JSON.stringify(starts.map((one) => Math.round(one * 1000) / 1000))
);
check(
  'and it really travels, one sample to the next',
  starts.slice(1).some((one, i) => Math.abs(one - starts[i]) > 0.05),
  JSON.stringify({ peakAt, peak: Math.round(Math.max(...starts) * 1000) / 1000 })
);
check(
  'N is drawn in no frame of it, and lettered in none',
  cycleFrames.every((frame) => !frame.drawn && !frame.labelled),
  JSON.stringify({ n: cycle.n, drawn: cycleFrames.filter((frame) => frame.drawn).length })
);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
