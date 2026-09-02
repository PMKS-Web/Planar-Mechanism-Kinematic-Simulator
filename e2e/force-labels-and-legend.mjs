/**
 * What a force graph is called, and where its legend sits.
 *
 * Two of these are the same complaint. A link's id is the letters of its
 * joints, which is a fine key and a poor name: a cylinder's rod is named after
 * the pin buried inside it, and a slider block after the sliding joint
 * underneath it. Neither joint has a marker, a hitbox, or a row in any panel,
 * so a graph titled after one offered a part the reader had never been shown.
 *
 * The third: a cylinder is one body to the reader and three links to the
 * solver, and its two mounts sit on different ones -- so asking only the link
 * the canvas hands over listed one mount and silently dropped the other.
 *
 * The fourth: the legend is also the row of switches for the lines, and a
 * switch that moves when the number beside it gains a minus sign is one the
 * reader has to re-aim at every frame.
 *
 *   PMKS_BASE_URL=<origin> node e2e/force-labels-and-legend.mjs
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
const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** Load a template and stand in Force Analysis, where these graphs live. */
const openForce = async (name) => {
  await page.goto(`${BASE}/?${payloads[name]}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(700);
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(3)
  );
  await page.waitForTimeout(900);
};

const select = async (id) => {
  await page.evaluate((wanted) => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    const part =
      c.mechanismSrv.joints.find((joint) => joint.id === wanted) ??
      c.mechanismSrv.links.find((link) => link.id === wanted);
    c.activeObjService.updateSelectedObj(part);
  }, id);
  await page.waitForTimeout(800);
};

const titles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.graphTitle')].map((el) => el.textContent.trim())
  );

// --- A slider names the bodies a reader can point at -------------------------
//
// This used to expect a graph called "Force on Block at C". The block is not
// named at all any more: a pin, its block and its slot are three bodies to the
// solver and one thing to a reader, the block's force at the pin is the bar's
// force negated, so the pin carries both numbers and nothing is named after a
// body nobody has seen. `export-flow` asserts the same rule from the other
// side, that no row offered for a slider says "Block".
//
// What is left of the original sentence is the half that still holds: the
// hidden joint does not appear either.
await openForce('Slider_Crank');
await select('C');
const atBlock = await titles();
record(
  'a slider names the bodies a reader can point at, and not the hidden ones',
  atBlock.includes('Force on Link BC') &&
    atBlock.length > 0 &&
    !atBlock.some((one) => /Block/.test(one)) &&
    !atBlock.some((one) => /\bC?D\b/.test(one)),
  atBlock
);

// --- A cylinder's parts are named by the part and the cylinder ---------------
await openForce('Cylinder_Boom');
await select('C');
const atRod = await titles();
record(
  "a cylinder's rod is named as the rod of its cylinder",
  atRod.includes('Force on Rod GC') && !atRod.some((one) => /Link PC/.test(one)),
  atRod
);

// --- Both of a cylinder's mounts get a graph --------------------------------
// The mounts sit on different member links, and the reader selected one body.
for (const member of ['GN', 'PC']) {
  await select(member);
  const rows = await titles();
  record(
    `selecting ${member} graphs the force at both of the cylinder's mounts`,
    rows.includes('Force at Joint C') && rows.includes('Force at Joint G'),
    rows
  );
}

// --- A ram's own drive is graphed where the ram is ---------------------------
// The one input whose joint the reader cannot select: it is buried inside the
// part, with no marker and no hitbox, so its effort belongs on the part.
for (const member of ['GN', 'PC', 'PS']) {
  await select(member);
  const rows = await titles();
  record(
    `selecting ${member} offers the effort its drive has to supply`,
    rows.includes('Input Force'),
    rows
  );
}
await select('OC');
const unrelated = await titles();
record(
  'and a link that is not the driven part is not offered it',
  !unrelated.some((one) => /^Input /.test(one)),
  unrelated
);

// The graph is the drive's own, not a new number: the joint panel has carried
// it all along on a joint nobody can click, and the two must agree.
const readingOf = async (id, title) => {
  await select(id);
  return page.evaluate((wanted) => {
    const section = [...document.querySelectorAll('.graphSection')].find(
      (one) => one.querySelector('.graphTitle')?.textContent.trim() === wanted
    );
    return section ? section.querySelector('.graphValue')?.textContent.trim() : null;
  }, title);
};
const onThePart = await readingOf('GN', 'Input Force');
const onTheJoint = await readingOf('S', 'Input Force');
record('and reads exactly what the buried joint reads', onThePart === onTheJoint && !!onThePart, {
  onThePart,
  onTheJoint,
});

// --- The legend holds its columns whatever the numbers read ------------------
// Watched on a kinematic graph, not a force one: a static reaction can hold
// one formatted value all the way round the cycle, which starves the "numbers
// really do change" check of its premise. The position of the crank pin
// cannot hold still -- moving is what it is for.
await openForce('Slider_Crank');
await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(2)
);
await page.waitForTimeout(600);
await select('B');
// The row's value is set flush right in tabular figures, so what must hold
// still as the digits change is its right-hand edge.
const legendAt = () =>
  page.evaluate(() => {
    const first = document.querySelector('.graphValue');
    if (!first) return null;
    return [
      {
        text: first.textContent.trim().replace(/\s+/g, ' '),
        right: Math.round(first.getBoundingClientRect().right * 10) / 10,
      },
    ];
  });

const frames = [];
for (const step of [0, 12, 25, 37, 48]) {
  await page.evaluate((at) => {
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.animate(at, false);
  }, step);
  await page.waitForTimeout(400);
  frames.push(await legendAt());
}
record('the row states both components', /,/.test(frames[0]?.[0]?.text ?? ''), frames[0]);
const readings = new Set(frames.map((frame) => (frame ?? []).map((one) => one.text).join('|')));
record('the numbers really do change across the cycle', readings.size > 1, [...readings]);
const columns = new Set(frames.map((frame) => (frame ?? []).map((one) => one.right).join(',')));
record('and the value keeps its right edge while they do', columns.size === 1, [...columns]);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
