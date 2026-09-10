// What a welded mount looks like, in every shape the plan named.
//
// `cylinder-mount.mjs` asks whether the app *does* the right thing. This asks
// whether it *draws* it: that a ram is one skin and a bracket welded to it is
// one more, that nothing inside the ram leaks onto the canvas, that no body is
// painted twice, and that the answer holds for both mounts, a mount two rams
// share, two blocks on one body, a short ram, an oblique slot, at either end of
// the stroke, at two zoom levels and on a narrow window.
//
// Structural facts are asserted. Everything else is what the contact sheets are
// for -- a seam, a bore showing through, a plate that vanished are not things a
// count can catch, so the sheets exist to be looked at.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-mount-render.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-mount-render';

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
const film = filmstrip(page, OUT);

/**
 * Draw one of the shapes, by name, through the service.
 *
 * One function rather than eight because every recipe needs the same three
 * helpers -- the far joint of a fresh bar, a weld through the selection, a
 * ground through the selection -- and passing those into the page once is
 * cheaper than repeating them in every evaluate.
 */
async function draw(recipe) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  const drawn = await page.evaluate((which) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const S = 200;
    const far = (link, anchor) => link.joints.find((j) => j.id !== anchor.id);
    const pick = (j) => grid.activeObjService.updateSelectedObj(j);
    const weld = (j) => {
      pick(j);
      m.weldJoint();
    };
    const ground = (j) => {
      pick(j);
      m.toggleGround();
    };
    const block = (j) => {
      pick(j);
      m.toggleSlider();
    };
    const ram = (from, to, at) => {
      m.createCylinderFrom(from, to, undefined, at);
      return m.sealedStructures()[m.sealedStructures().length - 1];
    };

    const note = {};
    if (which === 'rod-welded' || which === 'colors' || which === 'small-ram') {
      const span = which === 'small-ram' ? 1.6 : 6;
      const one = ram({ x: -4 * S, y: 0 }, { x: (-4 + span) * S, y: 0 });
      const bar = m.addBarFrom(one.rodFar, { x: one.rodFar.x + 2 * S, y: one.rodFar.y + 3 * S });
      note.tip = far(bar, one.rodFar).id;
      weld(one.rodFar);
    } else if (which === 'barrel-welded') {
      const one = ram({ x: -1 * S, y: 0 }, { x: 5 * S, y: 0 });
      const bar = m.addBarFrom(one.barrelFar, {
        x: one.barrelFar.x - 2 * S,
        y: one.barrelFar.y + 3 * S,
      });
      note.tip = far(bar, one.barrelFar).id;
      weld(one.barrelFar);
    } else if (which === 'both-welded') {
      const one = ram({ x: -3 * S, y: 0 }, { x: 3 * S, y: 0 });
      const left = m.addBarFrom(one.barrelFar, {
        x: one.barrelFar.x - 2 * S,
        y: one.barrelFar.y - 3 * S,
      });
      const right = m.addBarFrom(one.rodFar, { x: one.rodFar.x + 2 * S, y: one.rodFar.y + 3 * S });
      note.tip = far(right, one.rodFar).id;
      note.otherTip = far(left, one.barrelFar).id;
      weld(one.barrelFar);
      weld(one.rodFar);
    } else if (which === 'shared-mount') {
      // A boom and a stick: one ram's rod mount is the next one's barrel
      // mount, and the weld at it has to hold both.
      const boom = ram({ x: -5 * S, y: -1 * S }, { x: 0, y: 0 });
      const stick = ram({ x: 0, y: 0 }, { x: 4 * S, y: 3 * S }, boom.rodFar);
      const bar = m.addBarFrom(boom.rodFar, { x: -1 * S, y: 3 * S });
      note.tip = far(bar, boom.rodFar).id;
      note.shared = boom.rodFar.id;
      note.stickTip = stick.rodFar.id;
      weld(boom.rodFar);
    } else if (which === 'two-blocks') {
      const one = ram({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
      const bar = m.addBarFrom(one.rodFar, { x: one.rodFar.x + 2 * S, y: one.rodFar.y + 3 * S });
      const tip = far(bar, one.rodFar);
      note.tip = tip.id;
      weld(one.rodFar);
      // Two external blocks on one welded body: one at the mount, one at the
      // bracket's far end, each with its own plate to draw.
      block(one.rodFar);
      ground(one.rodFar);
      block(tip);
      ground(tip);
    } else if (which === 'oblique-slot') {
      const one = ram({ x: -1 * S, y: 1 * S }, { x: 5 * S, y: 1 * S });
      const bar = m.addBarFrom(one.rodFar, { x: one.rodFar.x + 1 * S, y: one.rodFar.y + 3 * S });
      note.tip = far(bar, one.rodFar).id;
      weld(one.rodFar);
      // A rail somewhere else in the drawing, running at 37 degrees to the
      // ram's own axis: an oblique guide rather than an axial one. It cannot
      // be the bracket -- a body the ram is already fixed to would only pull
      // the part shorter, and the drop refuses it.
      const rail = m.addBar({ x: -5 * S, y: -3 * S }, { x: 1 * S, y: 1.5 * S });
      note.cut = m.cutSlotOn(one.barrelFar, {
        carrier: rail,
        a: rail.joints[0],
        b: rail.joints[1],
        x: (rail.joints[0].x + rail.joints[1].x) / 2,
        y: (rail.joints[0].y + rail.joints[1].y) / 2,
      });
    } else if (which === 'running') {
      const one = ram({ x: -4 * S, y: 0 }, { x: 2 * S, y: 0 });
      const bar = m.addBarFrom(one.rodFar, { x: one.rodFar.x + 2 * S, y: one.rodFar.y + 3 * S });
      const tip = far(bar, one.rodFar);
      note.tip = tip.id;
      weld(one.rodFar);
      ground(one.barrelFar);
      block(tip);
      ground(tip);
      m.toggleCylinderInput(m.sealedStructures()[0]);
    }

    m.finishStructuralEdit(true);
    const rams = m.sealedStructures();
    const compound = m.links.find((l) => (l.subset ?? []).length > 0);
    return {
      ...note,
      rams: rams.length,
      mounts: rams.flatMap((r) => [r.barrelFar.id, r.rodFar.id]),
      compound: compound?.id,
      samples: m.masterMechanism()?.joints.length ?? 0,
    };
  }, recipe);
  // The service is done; the canvas is not. Every recipe draws at least one
  // ram, so its skin appearing is the signal that this pose has been painted
  // -- without it the facts below are read off the drawing before it exists,
  // and a shape comes back with nothing on it at all.
  await page.waitForFunction(
    (many) => document.querySelectorAll('.cylinder-mark .cylinder-barrel').length >= many,
    recipe === 'shared-mount' ? 2 : 1
  );
  await page.waitForTimeout(150);
  return drawn;
}

/** The structural facts a drawing has to satisfy, whatever it is of. */
const renderFacts = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const rams = m.sealedStructures();
    const count = (id) => document.querySelectorAll(`[id="${id}"]`).length;
    const interiors = rams.flatMap((r) => [r.barrelNear.id, r.pin.id, r.slider.id]);
    // Only a RealLink gets a path carrying its own id; a block is drawn in the
    // block layer with no id of its own, so it is counted separately below.
    const bodies = m.links.filter((l) => grid.gridUtils.typeOfLink(l) === 'R');
    return {
      // Nothing inside a ram is on the canvas: not as a joint, not as a body.
      interiorsDrawn: interiors.filter((id) => count(`joint_${id}`) > 0 || count(id) > 0),
      // Every root body is painted exactly once. A compound painted beside its
      // own leaves, or a leaf painted beside its compound, is the double-alpha
      // seam this is here to catch.
      bodiesDrawnTwice: bodies.filter((l) => count(l.id) > 1).map((l) => l.id),
      bodiesNotDrawn: bodies.filter((l) => count(l.id) === 0).map((l) => l.id),
      // One block on the canvas per block a reader put there. A ram's own
      // sliding pair is sealed inside it, so its bore must never be one.
      blocksDrawn: document.querySelectorAll('.slider-block').length,
      blocksExpected: m.joints.filter((j) => j.constructor?.name === 'PrisJoint' && !j.isSealed)
        .length,
      // A compound's leaves are never bodies of their own on the canvas.
      leavesDrawnAsBodies: m.links
        .flatMap((l) => l.subset ?? [])
        .filter((leaf) => count(leaf.id) > 0)
        .map((leaf) => leaf.id),
      // Every joint a reader can point at has exactly one marker.
      jointsDrawnTwice: m.joints
        .filter((j) => !j.isSealed && count(`joint_${j.id}`) > 1)
        .map((j) => j.id),
      mountsDrawn: rams
        .flatMap((r) => [r.barrelFar.id, r.rodFar.id])
        .filter((id) => count(`joint_${id}`) === 1),
      // The skin is still there to draw them: one barrel path per ram.
      skinsDrawn: document.querySelectorAll('.cylinder-mark .cylinder-barrel').length,
      // And no compound's outline covers the middle of a ram. A compound that
      // holds a barrel or a rod must leave it to the skin; drawing it too puts
      // the bracket's color over the part, which the random palette hides more
      // often than not -- so this asks the geometry rather than the pixels.
      compoundsOverARam: (() => {
        const over = [];
        const middle = (one, two) => new DOMPoint((one.x + two.x) / 2, (one.y + two.y) / 2);
        bodies
          .filter((l) => (l.subset ?? []).length > 0)
          .forEach((root) => {
            const drawn = document.querySelector(`[id="${root.id}"]`);
            if (!drawn?.isPointInFill) return;
            rams.forEach((ram) => {
              [
                ['barrel', middle(ram.barrelFar, ram.barrelNear)],
                ['rod', middle(ram.pin, ram.rodFar)],
              ].forEach(([what, point]) => {
                if (drawn.isPointInFill(point)) over.push(`${root.id} covers a ${what}`);
              });
            });
          });
        return over;
      })(),
      rams: rams.length,
      links: bodies.map((l) => l.id),
    };
  });

/** Click a thing on the canvas and say what got selected. */
async function selects(selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) return { type: 'missing', id: null };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
    // Both fields keep their last value, so the type is what says which one to
    // read; taking whichever is set answers with the previous selection.
    return {
      type: active.objType,
      id:
        active.objType === 'Link'
          ? (active.selectedLink?.id ?? null)
          : (active.selectedJoint?.id ?? null),
    };
  });
}

// ------------------------------------------------- every shape the plan named
const shapes = [
  'rod-welded',
  'barrel-welded',
  'both-welded',
  'shared-mount',
  'two-blocks',
  'oblique-slot',
  'small-ram',
];
console.log('\nevery shape, drawn once and only once');
const drawn = {};
for (const shape of shapes) {
  const ids = await draw(shape);
  drawn[shape] = ids;
  const facts = await renderFacts();
  check(
    `${shape}: nothing from inside a ram is on the canvas`,
    facts.interiorsDrawn.length === 0 && facts.rams === (shape === 'shared-mount' ? 2 : 1),
    JSON.stringify({ interiors: facts.interiorsDrawn, rams: facts.rams })
  );
  check(
    `${shape}: every body is painted once, and no leaf is painted beside its compound`,
    facts.bodiesDrawnTwice.length === 0 &&
      facts.bodiesNotDrawn.length === 0 &&
      facts.leavesDrawnAsBodies.length === 0,
    JSON.stringify({
      twice: facts.bodiesDrawnTwice,
      missing: facts.bodiesNotDrawn,
      leaves: facts.leavesDrawnAsBodies,
      links: facts.links,
    })
  );
  check(
    `${shape}: the skin draws each ram, and no compound draws one again`,
    facts.skinsDrawn === facts.rams && facts.compoundsOverARam.length === 0,
    JSON.stringify({
      skins: facts.skinsDrawn,
      rams: facts.rams,
      over: facts.compoundsOverARam,
    })
  );
  check(
    `${shape}: one block on the canvas per block a reader put there`,
    facts.blocksDrawn === facts.blocksExpected,
    JSON.stringify({ drawn: facts.blocksDrawn, expected: facts.blocksExpected })
  );
  check(
    `${shape}: both mounts are on the canvas, once each`,
    facts.mountsDrawn.length === facts.rams * 2 && facts.jointsDrawnTwice.length === 0,
    JSON.stringify({ mounts: facts.mountsDrawn, twice: facts.jointsDrawnTwice })
  );
  await film.shot(`shape-${shape}`);
}
await contactSheet(`${OUT}/*shape-*.png`, `${OUT}/sheet-shapes.png`, 3);

// ------------------------------------------------------------- hit targets
console.log('\nwhat each part of the drawing answers to');
let ids = await draw('two-blocks');
const onMount = await selects(`#joint_${ids.mounts[1]}`);
check(
  'the mount answers as its own joint',
  onMount.type === 'Joint' && onMount.id === ids.mounts[1],
  JSON.stringify(onMount)
);
const onSkin = await selects(`#${ids.compound}`);
check(
  'the welded body answers as the body',
  onSkin.type === 'Link' && onSkin.id === ids.compound,
  JSON.stringify(onSkin)
);
const onTip = await selects(`#joint_${ids.tip}`);
check(
  'and the bracket’s far end answers as itself, not as the body it is on',
  onTip.type === 'Joint' && onTip.id === ids.tip,
  JSON.stringify(onTip)
);

// ------------------------------------------------ both ends of the stroke
console.log('\neither end of the stroke');
ids = await draw('running');
const stroke = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const mount = () => m.joints.find((j) => j.id === where.mounts[1]);
  m.animate(0, false);
  // Asked here rather than carried from the fixture: the sample count is only
  // settled once the machine has been built, and it changes with input speed.
  return {
    retracted: { x: mount().x, y: mount().y },
    samples: m.masterMechanism()?.joints.length ?? 0,
    valid: m.mechanisms.some((one) => !!one?.isMechanismValid()),
  };
}, ids);
await film.shot('stroke-retracted');
// A cylinder's cycle runs out and back, so the last sample is the first one
// again; full extension is the sample furthest from the start, not the last.
const extended = await page.evaluate(
  (where) => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const mount = () => m.joints.find((j) => j.id === where.mounts[1]);
    const start = { x: mount().x, y: mount().y };
    let best = { step: 0, x: start.x, y: start.y, away: 0 };
    for (let step = 0; step < where.samples; step += Math.ceil(where.samples / 24)) {
      m.animate(step, false);
      const away = Math.hypot(mount().x - start.x, mount().y - start.y);
      if (away > best.away) best = { step, x: mount().x, y: mount().y, away };
    }
    m.animate(best.step, false);
    return best;
  },
  { ...ids, samples: stroke.samples }
);
await film.shot('stroke-extended');
let facts = await renderFacts();
check(
  'the ram is the same drawing at either end of its stroke',
  Math.hypot(extended.x - stroke.retracted.x, extended.y - stroke.retracted.y) > 1 &&
    facts.interiorsDrawn.length === 0 &&
    facts.bodiesDrawnTwice.length === 0 &&
    facts.leavesDrawnAsBodies.length === 0,
  JSON.stringify({
    retracted: stroke.retracted,
    extended,
    samples: stroke.samples,
    valid: stroke.valid,
  })
);

// ------------------------------------------------- two zooms, one narrow window
console.log('\ntwo zoom levels and a narrow window');
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.svgGrid.zoomIn();
  grid.svgGrid.zoomIn();
});
await page.waitForTimeout(400);
await film.shot('zoom-in');
facts = await renderFacts();
check(
  'zoomed in, nothing has doubled and nothing inside has appeared',
  facts.interiorsDrawn.length === 0 && facts.bodiesDrawnTwice.length === 0,
  JSON.stringify(facts.interiorsDrawn.concat(facts.bodiesDrawnTwice))
);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
  grid.svgGrid.zoomOut();
});
await page.waitForTimeout(400);
await film.shot('zoom-out');
facts = await renderFacts();
check(
  'zoomed out, the same',
  facts.interiorsDrawn.length === 0 && facts.bodiesDrawnTwice.length === 0,
  JSON.stringify(facts.interiorsDrawn.concat(facts.bodiesDrawnTwice))
);

await page.setViewportSize({ width: 420, height: 900 });
await page.waitForTimeout(600);
await film.shot('narrow');
facts = await renderFacts();
check(
  'and on a narrow window the drawing is still one of everything',
  facts.interiorsDrawn.length === 0 &&
    facts.bodiesDrawnTwice.length === 0 &&
    facts.bodiesNotDrawn.length === 0,
  JSON.stringify(facts)
);
await page.setViewportSize({ width: 1600, height: 1000 });
await contactSheet(`${OUT}/*stroke-*.png`, `${OUT}/sheet-stroke.png`, 2);
await contactSheet(`${OUT}/*zoom-*.png`, `${OUT}/sheet-zoom.png`, 2);

// ------------------------------------------------------------ bracket colors
console.log('\nthe bracket’s own color');
ids = await draw('colors');
for (const [name, fill] of [
  ['teal', '#1f8a80'],
  ['amber', '#c47f18'],
]) {
  await page.evaluate(
    (paint) => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const compound = m.links.find((l) => (l.subset ?? []).length > 0);
      compound.fill = paint.fill;
      m.updateMechanism(false);
    },
    { fill }
  );
  await page.waitForTimeout(400);
  await film.shot(`color-${name}`);
}
const colored = await page.evaluate((where) => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const compound = m.links.find((l) => (l.subset ?? []).length > 0);
  const ram = m.links.find((l) => l.id !== compound.id && (l.subset ?? []).length === 0);
  const skin = document.querySelector(`[id="${compound.id}"]`);
  return {
    compound: compound.fill,
    ram: ram.fill,
    painted: skin?.getAttribute('fill') ?? skin?.style?.fill ?? null,
  };
}, ids);
check(
  'a repainted bracket does not repaint the ram it is welded to',
  colored.compound === '#c47f18' && colored.ram !== colored.compound,
  JSON.stringify(colored)
);
await contactSheet(`${OUT}/*color-*.png`, `${OUT}/sheet-colors.png`, 2);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
