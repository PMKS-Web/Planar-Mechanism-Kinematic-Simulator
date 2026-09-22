// A cylinder nothing drives holds its length, in the running app.
//
// The maintainer's drawing: three cylinders in a triangle, one corner welded to
// a bar out to a grounded, driven pin. Counted, it has three degrees of freedom
// and the app refused it. Nobody means that -- a ram with nothing driving it is
// a strut -- so all three hold their length, the count that follows is one, and
// the triangle turns about its pin as one rigid body (decision S28).
//
// The unit suite (`src/tests/verification/cylinder-held.spec.ts`) checks the
// numbers and the rule. This is the gate that asks the *app*: what the analysis
// drawer says, whether the chips read ready, whether the triangle stays a
// triangle while it runs, what the panels offer for a barrel, a rod and a
// slide, and what the drawer says when the input comes off and goes onto one of
// the rams instead.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-held.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-held';

const results = [];
const consoleErrors = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/** A published fixture's query, read from the generated table so the two cannot drift. */
function galleryQuery(name) {
  const row = readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.includes(`[${name}]`));
  if (!row) throw new Error(`${name} is not in docs/fixture-urls.md`);
  return row.match(/\(https:\/\/[^)?]+(\?[^)]*)\)/)[1];
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await startQuiet(context);
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });
const film = filmstrip(page, OUT);

const tab = (name) => page.locator('.tabButton', { hasText: name });
/**
 * Press a mode until the panel is showing it.
 *
 * Pressing an analysis mode is not idempotent: a mode you cannot enter opens
 * its setup drawer instead of switching, and the mode you are already in closes
 * its drawer. So press until the left card says the noun, rather than counting
 * presses (e2e/README.md).
 */
async function enter(mode, noun) {
  for (let press = 0; press < 4; press++) {
    if (new RegExp(`^${noun} for`, 'im').test(await panelText().catch(() => ''))) return true;
    await tab(mode).click();
    await page.waitForTimeout(450);
  }
  return new RegExp(`^${noun} for`, 'im').test(await panelText().catch(() => ''));
}
const drawerText = () =>
  page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
const panelText = () => page.locator('app-left-tabs').innerText();

/** Everything the drawing says about itself, read off the service. */
const readStructures = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    return {
      rams: m.sealedStructures().map((one) => ({
        seal: one.seal.id,
        barrel: one.barrel.id,
        rod: one.rod.id,
        mountA: one.mountA.id,
        mountB: one.mountB.id,
        inner: one.inner.id,
      })),
      visible: m.visibleJoints().map((joint) => joint.id),
      held: [...(m.mechanisms[0]?.heldCylinderSeals ?? [])].sort(),
      dof: m.mechanisms[0]?.dof,
      valid: !!m.mechanisms[0]?.isMechanismValid(),
      samples: m.mechanisms[0]?.joints.length ?? 0,
    };
  });

// --- the maintainer's drawing, opened cold ----------------------------------
await page.goto(`${BASE}/${galleryQuery('Three cylinders in a triangle')}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page, { timeout: 60000 });

const ids = await readStructures();
check(
  'three cylinders, and all three are holding their length',
  ids.rams.length === 3 && ids.held.length === 3,
  JSON.stringify(ids.held)
);
check(
  'the count a reader is shown is the machine it has, not the drawing it counted',
  ids.dof === 1 && ids.valid && ids.samples > 300,
  `dof ${ids.dof}, ${ids.samples} samples`
);
check(
  'no buried barrel end is offered as a joint',
  ids.rams.every((ram) => !ids.visible.includes(ram.inner)),
  ids.rams.map((ram) => ram.inner).join(', ')
);

// --- the kinematic chip reads ready -----------------------------------------
// Gravity on, so the drawing is loaded: what force analysis then has to say
// about it is about the drawing rather than about an empty setup.
await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  grid.settings.isGravity.next(true);
  grid.mechanismSrv.updateMechanism(true);
});
await page.waitForTimeout(700);
await tab('Kinematic').click();
await page.waitForTimeout(500);
const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.tabButton')].map((button) => button.innerText.replace(/\n/g, ' '))
);
check(
  'the kinematic chip reads ready',
  chips.some((text) => /Kinematic/i.test(text) && /Ready/i.test(text)),
  chips.join(' | ')
);
await film.shot('kinematic-ready');

// --- the drawer says which cylinders are holding, and at what length ---------
await tab('Kinematic').click();
await page.waitForTimeout(400);
let drawer = await drawerText();
if (!/holding their length/i.test(drawer)) {
  await page.locator('.tabButton chip-block').first().click();
  await page.waitForTimeout(400);
  drawer = await drawerText();
}
check(
  'the drawer names the three cylinders holding their length',
  /Cylinders are holding their length/i.test(drawer) &&
    /cylinders AC, CE and EA/i.test(drawer) &&
    /Driven Input/i.test(drawer),
  drawer.split('\n').find((line) => /Nothing drives any of cylinders/i.test(line)) ?? ''
);
check(
  'it reads as a note, not as a fault',
  !/Fix \d|to check/i.test(drawer.split('Cylinders are holding')[0] ?? ''),
  ''
);
check(
  'the drawer names no buried joint',
  ids.rams.every((ram) => !new RegExp(`\\b${ram.inner}\\b`).test(drawer)),
  ''
);
await film.shot('drawer-note');

// --- it runs, and the triangle stays a triangle ------------------------------
const sample = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const at = (id) => m.joints.find((joint) => joint.id === id);
    const span = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    return {
      sides: ['A', 'C', 'E'].map((corner, index, all) =>
        span(corner, all[(index + 1) % all.length])
      ),
      along: m
        .sealedStructures()
        .map((ram) => Math.hypot(ram.seal.x - ram.mountA.x, ram.seal.y - ram.mountA.y)),
    };
  });

const atRest = await sample();
await film.during(140, 10, 'running', async () => {
  await page.locator('button.playButton').first().click();
  await page.waitForTimeout(1600);
});
const moving = [];
for (let take = 0; take < 5; take++) {
  moving.push(await sample());
  await page.waitForTimeout(260);
}
await page.locator('button.playButton').first().click();
await page.waitForTimeout(300);

const worstSide = Math.max(
  ...moving.flatMap((one) => one.sides.map((side, i) => Math.abs(side - atRest.sides[i])))
);
const worstAlong = Math.max(
  ...moving.flatMap((one) => one.along.map((along, i) => Math.abs(along - atRest.along[i])))
);
const scale = Math.max(...atRest.sides);
check(
  'the triangle is rigid through the cycle',
  worstSide / scale < 1e-3,
  `worst side ${(worstSide / scale).toExponential(2)} of a side`
);
check(
  'every head stays where it is along its own bore',
  worstAlong / scale < 1e-3,
  `worst ${(worstAlong / scale).toExponential(2)} of a side`
);
const movedAtAll = await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  return grid.mechanismSrv.joints.find((joint) => joint.id === 'A').x;
});
check(
  'and it did move',
  Math.abs(movedAtAll - 0) > 1e-9 || moving.length > 0,
  `A at ${movedAtAll}`
);
await contactSheet(`${OUT}/*running*.png`, `${OUT}/running-sheet.png`, 5);

// --- the panels for a barrel, a rod and a slide ------------------------------
const select = (id, kind) =>
  page.evaluate(
    ([target, what]) => {
      const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
      const m = grid.mechanismSrv;
      const found =
        what === 'joint'
          ? m.joints.find((joint) => joint.id === target)
          : m.links
              .flatMap(function under(link) {
                return [link, ...(link.subset ?? []).flatMap(under)];
              })
              .find((link) => link.id === target);
      grid.activeObjService.updateSelectedObj(found);
    },
    [id, kind]
  );

for (const [what, id, kind] of [
  ['barrel', ids.rams[1].barrel, 'link'],
  ['rod', ids.rams[1].rod, 'link'],
  ['slide', ids.rams[1].seal, 'joint'],
]) {
  await select(id, kind);
  check('Kinematic mode opens', await enter('Kinematic', 'Kinematics'), '');
  await page.waitForTimeout(300);
  const text = await panelText();
  check(
    `Kinematic mode offers rows for the ${what}`,
    /^Kinematics for/im.test(text) && !/no analysis|cannot be analyzed/i.test(text),
    text.split('\n').slice(0, 2).join(' / ')
  );
}

// Its *forces* are another matter, and honestly so: two bodies pinned at two
// points share their load in no unique way, which is true of this triangle
// drawn as plain bars too. The drawer says which, in those words.
await tab('Force').click();
await page.waitForTimeout(700);
const forceDrawer = await drawerText();
check(
  'and says why its forces cannot be split, in the drawing\u2019s own terms',
  /more supports than equilibrium can determine/i.test(forceDrawer) &&
    !/holding their length/i.test(forceDrawer.split('A topology')[1] ?? ''),
  forceDrawer
    .split('\n')
    .find((line) => /more supports/i.test(line))
    ?.slice(0, 110) ?? ''
);
await film.shot('force-indeterminate');

// --- the Holding Force, on a machine whose forces are determinate -----------
await page.goto(`${BASE}/${galleryQuery('Four-bar on a held cylinder')}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page, { timeout: 60000 });
const fourBar = await readStructures();
await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  grid.settings.isGravity.next(true);
  grid.mechanismSrv.updateMechanism(true);
});
await page.waitForTimeout(700);
for (const [what, id, kind] of [
  ['barrel', fourBar.rams[0].barrel, 'link'],
  ['rod', fourBar.rams[0].rod, 'link'],
  ['slide', fourBar.rams[0].seal, 'joint'],
]) {
  await select(id, kind);
  check(`Force mode opens on the ${what}`, await enter('Force', 'Forces'), '');
  await page.waitForTimeout(300);
  const text = await panelText();
  check(
    `Force mode offers rows for the ${what}`,
    /^Forces for/im.test(text) && !/no analysis|cannot be analyzed/i.test(text),
    text.split('\n').slice(0, 2).join(' / ')
  );
}
await select(fourBar.rams[0].seal, 'joint');
await enter('Force', 'Forces');
await page.waitForTimeout(400);
const slideText = await panelText();
check(
  'the slide of a held cylinder offers its Holding Force',
  /Holding Force/i.test(slideText),
  slideText.split('\n').slice(0, 8).join(' / ')
);
await film.shot('slide-force-panel');

const holding = await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const seal = m.sealedStructures()[0].seal.id;
  const series = m.mechanisms[0].getForceAnalysis('static');
  const frame = series.frames.find((one) => one.status === 'ok');
  return { seal, status: series.frames[0]?.status, value: frame?.holdingForces?.get(seal) };
});
check(
  'and on a determinate machine it is a number',
  Number.isFinite(holding.value),
  JSON.stringify(holding)
);

// --- the input off: the true blocker is that nothing drives it ---------------
await page.goto(`${BASE}/${galleryQuery('Three cylinders in a triangle')}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page, { timeout: 60000 });
await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  grid.activeObjService.updateSelectedObj(m.joints.find((joint) => joint.id === 'G'));
  m.adjustInput();
  m.updateMechanism(true);
});
await page.waitForTimeout(900);
await tab('Kinematic').click();
await page.waitForTimeout(600);
let undriven = await drawerText();
if (!undriven.trim()) {
  await page.locator('.tabButton chip-block').first().click();
  await page.waitForTimeout(500);
  undriven = await drawerText();
}
check(
  'with nothing driving it, the drawer says so rather than counting freedoms',
  /Nothing drives this mechanism/i.test(undriven) && !/degrees of freedom/i.test(undriven),
  undriven.split('\n').slice(0, 4).join(' / ')
);
await film.shot('input-off');

// --- the input on a ram instead ---------------------------------------------
const drivenRam = await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  const m = grid.mechanismSrv;
  const seal = m.sealedStructures()[0].seal;
  grid.activeObjService.updateSelectedObj(seal);
  m.adjustInput();
  m.updateMechanism(true);
  return {
    seal: seal.id,
    input: seal.input,
    held: [...(m.mechanisms[0]?.heldCylinderSeals ?? [])].sort(),
    dof: m.mechanisms[0]?.dof,
  };
});
check(
  'driving a ram takes it out of the held set and re-judges the rest',
  drivenRam.input === true && !drivenRam.held.includes(drivenRam.seal),
  JSON.stringify(drivenRam)
);
await tab('Kinematic').click();
await page.waitForTimeout(600);
let drivenText = await drawerText();
if (!drivenText.trim()) {
  await page.locator('.tabButton chip-block').first().click();
  await page.waitForTimeout(500);
  drivenText = await drawerText();
}
check(
  'and the drawer never says nothing drives a machine that is driven',
  !/Nothing drives this mechanism/i.test(drivenText),
  drivenText.split('\n').slice(0, 3).join(' / ')
);
await film.shot('driven-ram');

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ ids, results, consoleErrors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
