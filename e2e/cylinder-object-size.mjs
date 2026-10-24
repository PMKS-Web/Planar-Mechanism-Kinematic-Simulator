/**
 * Object Size, driven the way a reader drives it (decision S29).
 *
 * The maintainer's report was *"when I re-size objects, cylinders become weird
 * visually — try a fully expanded cylinder, then reduce the object size"*. The
 * head and the clearance behind it are measured in R and the joints are not, so
 * changing the size moves the travel out from under a head that stayed where it
 * was, and the part is drawn in two pieces with daylight between the barrel's
 * mouth and the head.
 *
 * So the size is changed through the three doors a reader actually has — the
 * Settings field, the Auto-size Objects button, and a drawing that adopts a
 * size when it opens — and after every one of them this asks the same four
 * questions of every cylinder on the grid: is the head inside its own travel,
 * is the silhouette one piece (measured off the drawn paths, not off the
 * model), did any joint a reader can see move, and is *Starts at* a percentage.
 *
 * Two more things ride along, because they are the same reader looking at the
 * same part: the driven arrows keep their proportions at every zoom, and the
 * transport says *Forward* of a slider and *Opening* of a cylinder.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-object-size.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-object-size';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

await page.evaluate(() => {}).catch(() => {});

// ---------------------------------------------------------------- what we read

/**
 * Every cylinder, twice over: what the model says and what the canvas drew.
 *
 * The gap is taken from the two paths rather than from the arithmetic, because
 * "two pieces" is a fact about the picture. Both live in the mark's own frame,
 * centred on the seal with +x toward the rod: the barrel path opens on its
 * mouth and the rod path opens on its own back edge, so the difference between
 * those two first numbers is the daylight between them.
 */
const survey = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const r = 0.15 * grid.settings.objectScale;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const firstNumber = (path) => Number((path.match(/-?\d+(\.\d+)?(e-?\d+)?/) ?? [NaN])[0]);
    return {
      scale: +grid.settings.objectScale.toFixed(4),
      cylinders: m.sealedStructures().map((one) => {
        const barrel = d(one.inner, one.mountA);
        // The head as the drawing sizes it: the block, or half the barrel on a
        // ram too short to hold one, floored square.
        const head = Math.max(1.525 * r, Math.min(3.84 * r, barrel / 2));
        const along = d(one.seal, one.mountA);
        const travel = { min: 1.4 * r + head, max: barrel + head };
        const group = document.querySelector(`g.cylinder-mark[data-cylinder="${one.seal.id}"]`);
        const barrelPath = group?.querySelector('path.cylinder-barrel')?.getAttribute('d');
        const rodPath = group?.querySelector('path.cylinder-rod')?.getAttribute('d');
        return {
          id: one.seal.id,
          barrel: +barrel.toFixed(6),
          rod: +d(one.mountB, one.seal).toFixed(6),
          along: +along.toFixed(6),
          inside: along >= travel.min - 1e-6 && along <= travel.max + 1e-6,
          start: +one.start.toFixed(6),
          // Positive is daylight between the barrel's mouth and the head's back
          // edge; zero or negative is one connected silhouette.
          drawnGap:
            barrelPath && rodPath
              ? +(firstNumber(rodPath) - firstNumber(barrelPath)).toFixed(4)
              : null,
          a: { x: +one.mountA.x.toFixed(6), y: +one.mountA.y.toFixed(6) },
          b: { x: +one.mountB.x.toFixed(6), y: +one.mountB.y.toFixed(6) },
          s: { x: +one.seal.x.toFixed(6), y: +one.seal.y.toFixed(6) },
        };
      }),
    };
  });

const visibleJointsOf = (state) =>
  state.cylinders.map((one) => ({ id: one.id, a: one.a, b: one.b, s: one.s }));

const sameJoints = (before, after) =>
  JSON.stringify(visibleJointsOf(before)) === JSON.stringify(visibleJointsOf(after));

/** Everything S29 promises, asked of one reading. */
function promises(state) {
  return {
    allInside: state.cylinders.every((one) => one.inside),
    onePiece: state.cylinders.every((one) => one.drawnGap !== null && one.drawnGap <= 0.5),
    startInRange: state.cylinders.every((one) => one.start >= 0 && one.start <= 1),
  };
}

// ------------------------------------------------------------ the three doors

const openSettings = async () => {
  if ((await page.locator('app-settings-panel').count()) > 0) return;
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.menuItem', { hasText: 'Settings' }).first().click();
  await page.waitForTimeout(600);
};

/** Type a size into the real field and commit it the way a reader does. */
const typeSize = async (text) => {
  await openSettings();
  const field = page
    .locator('app-settings-panel input-block', { hasText: 'Object Size' })
    .locator('input')
    .first();
  await field.click({ clickCount: 3 });
  await field.fill(text);
  await field.press('Enter');
  await page.waitForTimeout(900);
};

const pressAutoSize = async () => {
  await openSettings();
  await page.locator('button-block', { hasText: 'Auto-size Objects' }).first().click();
  await page.waitForTimeout(900);
};

const pressUndo = async () => {
  await page.locator('button', { hasText: 'Undo' }).first().click();
  await page.waitForTimeout(900);
};

/** Where the reader stands in the history, and how deep it goes. */
const historyDepth = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const store = grid.saveHistoryService;
    return { index: store.index, length: store.history.length };
  });

// ------------------------------------------- a fully open cylinder, then halve

/** Draw one cylinder along +x and open it fully — the maintainer's own scene. */
const drawFullyOpenCylinder = async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    m.resetMechanism();
    m.createCylinderFrom({ x: -600, y: 0 }, { x: 600, y: 0 });
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    grid.gridUtils.setCylinderStart(one, 1);
    grid.mechanismSrv.updateMechanism(true);
  });
  await page.waitForTimeout(600);
};

await drawFullyOpenCylinder();
const open = await survey();
record('a cylinder drawn and opened fully starts whole', promises(open).allInside, open);

const beforeSizing = await historyDepth();
await typeSize('0.35');
const afterSizing = await historyDepth();
const halved = await survey();
record('halving Object Size leaves the head inside its travel', promises(halved).allInside, halved);
record(
  'and the part is still one silhouette — no gap at the mouth',
  promises(halved).onePiece,
  halved.cylinders.map((one) => one.drawnGap)
);
record('no joint a reader can see moved', sameJoints(open, halved), {
  before: visibleJointsOf(open),
  after: visibleJointsOf(halved),
});
record(
  'the barrel is what gave',
  halved.cylinders[0].barrel > open.cylinders[0].barrel &&
    Math.abs(halved.cylinders[0].rod - open.cylinders[0].rod) < 1e-6,
  { before: open.cylinders[0], after: halved.cylinders[0] }
);
record(
  'Starts at is still a percentage, and still 100%',
  promises(halved).startInRange && Math.abs(halved.cylinders[0].start - 1) < 1e-6,
  halved.cylinders[0].start
);
await page.screenshot({ path: `${OUT}-halved.png` });

record(
  'a size change that repaired something is exactly one undo entry',
  afterSizing.index === beforeSizing.index + 1,
  { beforeSizing, afterSizing }
);

// One undo, and both the size and the barrel come back together. To a fifth of
// a model unit, because a history entry is a URL and a URL rounds a coordinate
// onto a grain of about a thousandth of a user unit.
await pressUndo();
const undone = await survey();
const undoneDepth = await historyDepth();
record(
  'one Undo puts back the size and the barrel it repaired',
  Math.abs(undone.scale - open.scale) < 1e-3 &&
    Math.abs(undone.cylinders[0].barrel - open.cylinders[0].barrel) < 0.2,
  { open: open.cylinders[0], undone: undone.cylinders[0], scale: undone.scale }
);
record(
  'and it takes exactly one — nothing re-saved behind the restore',
  undoneDepth.index === beforeSizing.index,
  { beforeSizing, undoneDepth }
);
record(
  'the restored drawing is whole at the restored size',
  promises(undone).allInside && promises(undone).onePiece,
  undone
);

// Applying the same size twice changes nothing the second time.
await typeSize('0.35');
const once = await survey();
await typeSize('0.35');
const twice = await survey();
record(
  'typing the same size twice changes nothing the second time',
  JSON.stringify(once.cylinders) === JSON.stringify(twice.cylinders),
  { once: once.cylinders[0], twice: twice.cylinders[0] }
);

// And up again: not a round trip, but whole at every step.
await typeSize('1.4');
const grown = await survey();
record('growing the size keeps the part whole', promises(grown).allInside, grown);
record('and keeps Starts at inside 0–100%', promises(grown).startInRange, grown.cylinders[0].start);
record(
  'it does not pretend the trip back up undoes the repair',
  Math.abs(grown.cylinders[0].barrel - once.cylinders[0].barrel) < 1e-6,
  { down: once.cylinders[0].barrel, up: grown.cylinders[0].barrel }
);

// ------------------------------------------------- the button, and a template

await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['Cylinder_Boom']}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(700);
const boom = await survey();
record(
  'a shipped cylinder template opens whole',
  promises(boom).allInside && promises(boom).onePiece && promises(boom).startInRange,
  boom
);
record(
  'and opening it adds no undo entry of its own',
  (await historyDepth()).index === 0,
  await historyDepth()
);

await pressAutoSize();
const autoSized = await survey();
record(
  'the Auto-size Objects button leaves every cylinder whole',
  promises(autoSized).allInside && promises(autoSized).onePiece,
  autoSized
);
record('and moves no visible joint', sameJoints(boom, autoSized), {
  before: visibleJointsOf(boom),
  after: visibleJointsOf(autoSized),
});

// A size the app adopts on load. `Jansen_Leg` is nearly two metres across and
// carries the default mark size, which is exactly the case
// `adoptScaleForDrawing` exists for; the cylinder templates are checked above
// for the part that matters here, that arriving writes no undo entry.
await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['Aircraft_Landing_Gear']}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(1200);
const arrived = await survey();
record(
  'a drawing that adopts a size on load arrives whole',
  promises(arrived).allInside && promises(arrived).onePiece && promises(arrived).startInRange,
  arrived
);
record(
  'and arriving is still not an edit: nothing to undo',
  (await historyDepth()).index === 0,
  await historyDepth()
);
await page.screenshot({ path: `${OUT}-arrived.png` });

// A barrel that holds its length does not give, and the app says so.
await drawFullyOpenCylinder();
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const one = grid.mechanismSrv.sealedStructures()[0];
  one.barrel.hold = 'length';
  grid.mechanismSrv.updateMechanism(true);
});
await page.waitForTimeout(400);
const held = await survey();
await typeSize('0.35');
const heldAfter = await survey();
record(
  'a barrel holding its length is left exactly as it is',
  Math.abs(heldAfter.cylinders[0].barrel - held.cylinders[0].barrel) < 1e-9 &&
    sameJoints(held, heldAfter),
  { before: held.cylinders[0], after: heldAfter.cylinders[0] }
);
const said = await page.locator('.notification').allInnerTexts();
record(
  'and the reader is told why, naming Object Size and no hidden joint',
  said.some((line) => /Object Size/.test(line) && /fixed at its length/.test(line)),
  said
);
record(
  'in the reader’s own nouns — a block is a joint, never a mount or a head',
  said.every((line) => !/\b(mount|head|seal|ram)\b/i.test(line)),
  said
);

// ------------------------------------------------ the arrows, at three zooms

await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['Cylinder_Boom']}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(600);

const arrowMeasure = () =>
  page.evaluate(() => {
    const zoom = ng.getComponent(document.querySelector('app-new-grid')).svgGrid.getZoom();
    const group =
      document.querySelector('g.slider-arrows') ??
      document.querySelector('g.cylinder-overlay g[pointer-events="none"]');
    if (!group) return null;
    const lines = [...group.querySelectorAll('line')];
    const heads = [...group.querySelectorAll('path')];
    return {
      zoom: +zoom.toFixed(4),
      widths: lines.map((line) => +Number(line.getAttribute('stroke-width')).toFixed(6)),
      headHeights: heads.map((path) => +path.getBBox().height.toFixed(6)),
    };
  });

const atZoom = async (factor) => {
  await page.evaluate((f) => {
    ng.getComponent(document.querySelector('app-new-grid')).svgGrid.panZoomObject.zoomBy(f);
  }, factor);
  await page.waitForTimeout(350);
  return arrowMeasure();
};

const zoomed = [await atZoom(1), await atZoom(0.25), await atZoom(16)];
record(
  'the driven arrows are measured in the drawing, not in screen pixels',
  zoomed.every((one) => one && JSON.stringify(one.widths) === JSON.stringify(zoomed[0].widths)) &&
    zoomed[0].zoom !== zoomed[1].zoom,
  zoomed
);
record(
  'so the shaft keeps its proportion against the arrowhead at every zoom',
  zoomed.every(
    (one) =>
      Math.abs(
        one.widths[0] / one.headHeights[0] - zoomed[0].widths[0] / zoomed[0].headHeights[0]
      ) < 1e-6
  ),
  zoomed.map((one) => one.widths[0] / one.headHeights[0])
);
record(
  'and the emphasised arrow is still the heavier of the two',
  zoomed[0].widths[0] !== zoomed[0].widths[1] &&
    Math.abs(Math.max(...zoomed[0].widths) / Math.min(...zoomed[0].widths) - 4.5 / 2.5) < 1e-6,
  zoomed[0].widths
);

// ------------------------------------------------------- the transport's words

const noteNow = () =>
  page.evaluate(() => {
    const bar = ng.getComponent(document.querySelector('app-playback-bar'));
    return (bar?.rows ?? []).filter((row) => row.isMechanism).map((row) => row.note);
  });

record(
  'a driven cylinder still opens and closes',
  (await noteNow()).every((note) => note === 'Opening' || note === 'Closing'),
  await noteNow()
);

await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['Slider_Crank']}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const block = m.joints.find((joint) => joint.slotAngle !== undefined);
  m.joints.forEach((joint) => (joint.input = false));
  block.input = true;
  m.updateMechanism(true);
});
await page.waitForTimeout(900);
const sliderNotes = new Set();
for (let step = 0; step < 24; step++) {
  (await noteNow()).forEach((note) => sliderNotes.add(note));
  await page.evaluate(() => {
    const bar = ng.getComponent(document.querySelector('app-playback-bar'));
    bar.stepBy?.(8);
  });
  await page.waitForTimeout(90);
}
record(
  'a driven bare slider runs forward and backward, never opens or closes',
  [...sliderNotes].every((note) => note === 'Forward' || note === 'Backward'),
  [...sliderNotes]
);
record(
  'and it says both of them over a whole cycle',
  sliderNotes.has('Forward') && sliderNotes.has('Backward'),
  [...sliderNotes]
);

record('no page errors', errors.length === 0, errors);

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
