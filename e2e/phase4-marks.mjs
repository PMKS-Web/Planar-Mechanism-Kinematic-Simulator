// Phase 4.2 — the eight base marks, drawn on real mechanisms.
//
// Loads each of the four reference linkages and checks that the mark system
// actually reaches the canvas: a channel cut from each carrier, a black block
// per slider, a weld plate only where a joint is welded, rails only where the
// slot is grounded. Screenshots land in artifacts/ for eyes-on inspection --
// element counts alone would pass on a mark drawn in the wrong place.
//
//   NODE_PATH=<playwright>/node_modules node e2e/phase4-marks.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

// ESM ignores NODE_PATH, so the out-of-tree Playwright is resolved by path.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/phase4-marks';
/**
 * Where the slide's own mark is photographed, next to the cylinder's.
 *
 * `cylinder-members.mjs` photographs the same mark on a ram into the same
 * directory: one mark, one folder, so the two are reviewed against each other
 * rather than in two places.
 */
const MARK_OUT = 'artifacts/slide-mark';

const MECHANISMS = [
  {
    name: 'scotch-yoke',
    note: 'a grounded Slide driven by a floating Slot',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.OC,C,Fe,0VG,0.GD,D,Fe,Fe,0.HE,E,Fe,0,0,CD,C,D.LF,F,Fe,0VG,0..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,Fe,07q,303e9f,C,D,,.YPBE,BE,Fe,0,0,0,,B,E,,.YPCF,CF,Fe,0,0,0,,C,F,,...N_V',
    expect: { blocks: 2, plates: 1, rails: 1, channels: 1 },
  },
  {
    name: 'inverted-slider-crank',
    note: 'one floating Slot, nothing welded',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,0,Fe,0.KC,C,ku,0,0.GD,D,0RF,Oj,0.HP,P,0,Fe,0,CD,C,D..YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9q,CN,303e9f,C,D,,.YPBP,BP,Fe,0,0,0,,B,P,,...N_r',
    expect: { blocks: 1, plates: 0, rails: 0, channels: 1 },
  },
  {
    name: 'four-bar-slotted-coupler',
    note: 'a slot cut into a moving coupler',
    query:
      '?2P.Fe.K,0.1011.MA,A,0,0,0.GB,B,Fe,0,0.GC,C,d4,ec,0.KD,D,_W,0,0.KE,E,VG,7q,0.GF,F,bo,cO,0.HP,P,bo,cO,0,BC,B,C..YRAB,AB,Fe,Fe,7q,0,c5cae9,A,B,,.YRBC,BC,Fe,Fe,RM,KJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,KJ,0d125a,C,D,,.YREF,EF,Fe,Fe,YX,N6,B2DFDB,E,F,,.YPFP,FP,Fe,0,0,0,,F,P,,...N_L',
    expect: { blocks: 1, plates: 0, rails: 0, channels: 1 },
  },
  {
    name: 'elliptical-trammel',
    note: 'two grounded guides at once',
    query:
      '?2P.Fe.K,0.1011.GA,A,Fe,0,0.GB,B,0,Fe,0.LC,C,Fe,0,0.LD,D,0,Fe,OZ..YRAB,AB,Fe,Fe,7q,7q,c5cae9,A,B,,.YPAC,AC,Fe,0,0,0,,A,C,,.YPBD,BD,Fe,0,0,0,,B,D,,...N_Q',
    expect: { blocks: 2, plates: 0, rails: 2, channels: 0 },
  },
];

const results = [];

function check(scenario, label, actual, expected) {
  const ok = actual === expected;
  results.push({ scenario, label, actual, expected, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: ${actual} (expected ${expected})`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));

mkdirSync(OUT, { recursive: true });
mkdirSync(MARK_OUT, { recursive: true });

for (const mechanism of MECHANISMS) {
  console.log(`\n${mechanism.name} — ${mechanism.note}`);
  await page.goto(BASE + mechanism.query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForSelector('#sliderHolder', { timeout: 15000 });
  await page.waitForTimeout(600);

  // The dev server draws a compile error over the page and keeps serving the
  // last good bundle, so a screenshot taken through it shows stale pixels that
  // look fine. Fail on it rather than photograph the wrong build.
  const overlay = await page.evaluate(() => {
    const node = document.querySelector(
      'vite-error-overlay, .vite-error-overlay, #vite-error-overlay'
    );
    return node
      ? (node.shadowRoot?.textContent ?? node.textContent ?? 'compile error').slice(0, 200)
      : null;
  });
  if (overlay) {
    console.log(`  FAIL  dev-server compile overlay: ${overlay.trim()}`);
    results.push({
      scenario: mechanism.name,
      label: 'no compile overlay',
      actual: overlay.trim(),
      expected: 'none',
      ok: false,
    });
  }

  const counts = await page.evaluate(() => ({
    blocks: document.querySelectorAll('#sliderHolder .slider-block').length,
    plates: document.querySelectorAll('#sliderHolder .slider-plate').length,
    rails: document.querySelectorAll('#railHolder > g').length,
    // A channel is a subpath appended to its carrier's own outline and
    // subtracted by the even-odd fill, so it has no element of its own and an
    // extra subpath alone cannot tell it apart from a compound link.
    channels: [...document.querySelectorAll('#linkHolder path[data-channels]')].reduce(
      (total, path) => total + Number(path.getAttribute('data-channels')),
      0
    ),
    // The block is #000 in every slider cell — no color derivation anywhere.
    blockFills: [...document.querySelectorAll('#sliderHolder .slider-block path')].map((p) =>
      p.getAttribute('fill')
    ),
  }));

  check(mechanism.name, 'blocks', counts.blocks, mechanism.expect.blocks);
  check(mechanism.name, 'weld plates', counts.plates, mechanism.expect.plates);
  check(mechanism.name, 'grounded rails', counts.rails, mechanism.expect.rails);
  check(mechanism.name, 'cut channels', counts.channels, mechanism.expect.channels);

  const allBlack = counts.blockFills.every((fill) => fill === '#000000');
  results.push({
    scenario: mechanism.name,
    label: 'every block is #000',
    actual: counts.blockFills.join(','),
    expected: 'all #000000',
    ok: allBlack,
  });
  console.log(`  ${allBlack ? 'PASS' : 'FAIL'}  every block is #000: ${counts.blockFills}`);

  await page.screenshot({ path: `${OUT}/${mechanism.name}.png` });
}

// ------------------------------------------ the plate follows its rider's paint
console.log('\nrecoloring a rider repaints its weld plate');
// A Slide's plate is painted in the rider's own color -- that is the whole
// mechanism by which it reads as the same body. Recoloring a link changes a
// mark while moving nothing, so a glyph cache keyed only on positions leaves
// the plate showing a color the link no longer has.
await page.goto(BASE + MECHANISMS[0].query, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(600);

// The plate is one path inside its group now, so the paint is on the path.
const plateFill = () =>
  page.locator('#sliderHolder .slider-plate path').first().getAttribute('fill');
const wasFill = await plateFill();

// Driving the recolor needs Angular's debug globals, which exist only in a
// development build. Skipped rather than failed against a deploy preview: the
// check is about cache invalidation, and a production bundle cannot be asked.
const recolorable = await page.evaluate(() => typeof window.ng?.getComponent === 'function');
if (recolorable) {
  await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.getLinks().find((link) => link.id === 'CD').fill = '#00695C';
    window.ng.applyChanges(grid);
  });
  await page.waitForTimeout(500);
} else {
  console.log("  SKIP  the weld plate follows its rider's color (needs a dev build)");
}
const nowFill = recolorable ? await plateFill() : null;

// Recorded as skipped rather than passed when it could not be run: a check that
// reports success without executing turns a production regression green.
if (recolorable) {
  const repainted = wasFill !== nowFill && nowFill === '#00695C';
  results.push({
    scenario: 'scotch-yoke',
    label: 'the weld plate follows its rider\u2019s color',
    actual: `${wasFill} -> ${nowFill}`,
    expected: `${wasFill} -> #00695C`,
    ok: repainted,
  });
  console.log(
    `  ${repainted ? 'PASS' : 'FAIL'}  the weld plate follows its rider's color: ${wasFill} -> ${nowFill}`
  );
}
await page.screenshot({ path: `${OUT}/recolored-plate.png` });

// ------------------------------------------- the mark a slider's own joint wears
//
// A slider whose riders cannot turn is drawn as a cream bar lying along its
// slot, in place of the weld cross it used to wear; one that can turn keeps its
// circle, and a welded *revolute* keeps the cross. The black block underneath
// is furniture: every hover, selection and lock is drawn on the bar.
console.log("\nthe slide's mark, and what the block under it does not do");

/** What the drawing says about one joint's marker, in its own frame. */
const markOf = (id) =>
  page.evaluate((jointId) => {
    const turn = (node) => {
      const found = /rotate\(\s*(-?[\d.]+)/.exec(node?.getAttribute('transform') ?? '');
      return found ? Number(found[1]) : null;
    };
    const mark = document.querySelector(`#joint_${jointId}`);
    if (!mark) return null;
    // `getBBox` is the element's own frame, which for the bar is the slot's:
    // the turn onto the slot is on the group above it. So "wider than it is
    // tall, here" *is* "lies along the slot".
    const box = mark.getBBox();
    const rect = mark.getBoundingClientRect();
    const block = document.querySelector(`#sliderHolder g[data-slider="${jointId}"] path`);
    const badge = mark.closest('svg')?.querySelector('.lockBadge');
    const badgeRect = badge?.getBoundingClientRect();
    return {
      tag: mark.tagName,
      classes: mark.getAttribute('class') ?? '',
      arcs: (mark.getAttribute('d')?.match(/A /g) ?? []).length,
      along: box.width,
      across: box.height,
      turn: turn(mark.parentElement),
      blockTurn: turn(block?.closest('g[data-slider]')),
      blockFill: block ? getComputedStyle(block).fill : null,
      blockClasses: block ? (block.closest('g[data-slider]').getAttribute('class') ?? '') : '',
      ring: !!mark.parentElement?.querySelector('.jointSelectionRing'),
      badge: !!badge,
      chip: !!mark.closest('svg')?.querySelector('.lockChip'),
      // The badge sits on the mark, so its middle falls inside the mark's.
      badgeOnMark:
        !!badgeRect &&
        badgeRect.x + badgeRect.width / 2 > rect.x &&
        badgeRect.x + badgeRect.width / 2 < rect.x + rect.width &&
        badgeRect.y + badgeRect.height / 2 > rect.y &&
        badgeRect.y + badgeRect.height / 2 < rect.y + rect.height,
      screen: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  }, id);

const keep = (label, ok, detail = '') => {
  results.push({ scenario: 'slide-mark', label, actual: detail, expected: 'as described', ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** A clip round one joint, so the mark is readable rather than four pixels. */
const clipAround = async (id, half = 130) => {
  const mark = await markOf(id);
  return {
    x: Math.max(0, mark.screen.x + mark.screen.width / 2 - half),
    y: Math.max(0, mark.screen.y + mark.screen.height / 2 - half * 0.6),
    width: half * 2,
    height: half * 1.2,
  };
};

await page.goto(BASE + MECHANISMS[0].query, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForSelector('#sliderHolder', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(600);

// C is the grounded Slide the scotch-yoke is welded at; B rides the yoke's slot
// and is free to turn in it.
let grounded = await markOf('C');
let pinInSlot = await markOf('B');
keep(
  'a grounded Prismatic slider wears a rounded bar, along its slot and inside its block',
  grounded.tag === 'path' &&
    grounded.classes.includes('slideMark') &&
    grounded.arcs === 4 &&
    grounded.along > grounded.across * 1.6 &&
    grounded.turn === grounded.blockTurn,
  JSON.stringify(grounded)
);
keep(
  'a Pin-in-slot slider keeps its circle',
  pinInSlot.tag === 'circle' && pinInSlot.classes.includes('joint_circles'),
  JSON.stringify({ tag: pinInSlot.tag, classes: pinInSlot.classes })
);
await page.screenshot({
  path: `${MARK_OUT}/slider-grounded-idle.png`,
  clip: await clipAround('C'),
});
await page.screenshot({ path: `${MARK_OUT}/slider-pin-in-slot.png`, clip: await clipAround('B') });

// A Slot's block is exposed, and it is the handle: pointing at it lights the
// marker at its center and leaves its own paint at #000. (A Slide's block is
// covered by the weld plate that fuses its rider to it, so a Slide is pointed
// at through its own marker, below.)
const blockAt = async (id) => {
  const s = (await markOf(id)).screen;
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  // Out along the slot, past the marker and onto the block: the block runs
  // 3.84R each way and the largest marker here is 1.4R.
  return s.width >= s.height ? { x: cx + s.width * 1.1, y: cy } : { x: cx, y: cy + s.height * 1.1 };
};
const onBlock = await blockAt('B');
await page.mouse.move(onBlock.x, onBlock.y);
await page.waitForTimeout(400);
const blockHover = await markOf('B');
keep(
  "pointing at a Slot's block lights its marker and leaves the block black",
  blockHover.classes.includes('joint-highlight') && blockHover.blockFill === 'rgb(0, 0, 0)',
  JSON.stringify({ classes: blockHover.classes, blockFill: blockHover.blockFill })
);
await page.mouse.move(4, 4);
await page.waitForTimeout(300);

// The same joint, turned into a Slide: the mark is what changes.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((j) => j.id === 'B'));
  grid.mechanismSrv.weldJoint();
  grid.activeObjService.updateSelectedObj(null);
});
await page.waitForTimeout(600);
const floating = await markOf('B');
keep(
  'and turning it Prismatic swaps the circle for the bar, along the slot it floats in',
  floating.tag === 'path' &&
    floating.classes.includes('slideMark') &&
    floating.along > floating.across * 1.6 &&
    floating.turn === floating.blockTurn,
  JSON.stringify(floating)
);
await page.screenshot({
  path: `${MARK_OUT}/slider-floating-prismatic.png`,
  clip: await clipAround('B'),
});

// Every state the joint has is drawn on the bar, and the block under it is
// painted exactly as it was: it is furniture, not the joint.
const markCenter = async (id) => {
  const s = (await markOf(id)).screen;
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
};
const onMark = await markCenter('C');
await page.mouse.move(onMark.x, onMark.y);
await page.waitForTimeout(400);
const hovered = await markOf('C');
keep(
  "hovering a Slide lights its bar and leaves the block's own paint alone",
  hovered.classes.includes('joint-highlight') &&
    hovered.blockFill === 'rgb(0, 0, 0)' &&
    !/selected|hovered|pointed/.test(hovered.blockClasses),
  JSON.stringify({ classes: hovered.classes, blockFill: hovered.blockFill })
);
await page.screenshot({
  path: `${MARK_OUT}/slider-grounded-hovered.png`,
  clip: await clipAround('C'),
});

await page.mouse.click(onMark.x, onMark.y);
await page.waitForTimeout(400);
const picked = await markOf('C');
keep(
  'selecting it says so on the bar, and the block is painted no differently',
  picked.classes.includes('joint-selected') &&
    picked.blockFill === 'rgb(0, 0, 0)' &&
    !/selected|hovered|pointed/.test(picked.blockClasses),
  JSON.stringify({ classes: picked.classes, blockFill: picked.blockFill })
);
await page.screenshot({
  path: `${MARK_OUT}/slider-grounded-selected.png`,
  clip: await clipAround('C'),
});

// The lock badge stands on the bar, centered, with no chip of its own -- the
// cream is chip enough, exactly as a pin's circle is.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const c = grid.mechanismSrv.joints.find((j) => j.id === 'C');
  grid.activeObjService.updateSelectedObj(c);
  grid.mechanismSrv.toggleLock(c);
});
await page.waitForTimeout(500);
const locked = await markOf('C');
keep(
  'a locked slider wears its padlock on the bar, with no chip under it',
  locked.badge && locked.badgeOnMark && !locked.chip,
  JSON.stringify({ badge: locked.badge, on: locked.badgeOnMark, chip: locked.chip })
);
await page.screenshot({
  path: `${MARK_OUT}/slider-grounded-locked.png`,
  clip: await clipAround('C'),
});

// A joint in a color family of its own keeps that color when it is picked, and
// wears the amber as a ring inside its own edge instead. A bar has an inside
// edge -- which is exactly what a weld cross does not, and why the cross wears
// the amber as an outline. Taken after the cream screenshots so those show the
// mark in the color the reference drawing does.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const c = grid.mechanismSrv.joints.find((j) => j.id === 'C');
  grid.mechanismSrv.toggleLock(c);
  c.colorFamily = 'o';
  grid.activeObjService.updateSelectedObj(c);
  ng.applyChanges(grid);
});
await page.waitForTimeout(500);
const ringed = await markOf('C');
keep(
  'a colored slide keeps its own color and rings itself in amber inside its edge',
  ringed.ring && ringed.classes.includes('joint-selected'),
  JSON.stringify({ ring: ringed.ring, classes: ringed.classes })
);
await page.screenshot({
  path: `${MARK_OUT}/slider-grounded-ringed.png`,
  clip: await clipAround('C'),
});

// A welded *revolute* is untouched: only sliders changed.
await page.goto(BASE + MECHANISMS[0].query, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(600);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const d = m.joints.find((j) => j.id === 'D');
  // A weld needs two bodies to fuse, and D carries one.
  m.addBarFrom(d, { x: d.x + 400, y: d.y + 400 });
  grid.activeObjService.updateSelectedObj(m.joints.find((j) => j.id === 'D'));
  m.weldJoint();
  grid.activeObjService.updateSelectedObj(null);
});
await page.waitForTimeout(700);
const weldCross = await markOf('D');
keep(
  'a welded revolute still wears the plus',
  weldCross.tag === 'path' &&
    !weldCross.classes.includes('slideMark') &&
    weldCross.arcs === 0 &&
    Math.abs(weldCross.along - weldCross.across) < 1e-6,
  JSON.stringify({ tag: weldCross.tag, arcs: weldCross.arcs, classes: weldCross.classes })
);
await page.screenshot({ path: `${MARK_OUT}/welded-revolute.png`, clip: await clipAround('D') });

await browser.close();

const failed = results.filter((result) => !result.ok);
writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify({ results, consoleErrors, failed: failed.length }, null, 2)
);

console.log(`\nconsole errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((error) => console.log(`  ${error}`));
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 && consoleErrors.length === 0 ? 0 : 1);
