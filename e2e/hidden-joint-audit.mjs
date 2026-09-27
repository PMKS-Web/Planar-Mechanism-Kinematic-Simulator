/**
 * No reader ever sees a cylinder's hidden joint. Anywhere.
 *
 * A cylinder's inner end N is the simulation's alone (decisions D14, S11, S20 of
 * `docs/joint-type-and-cylinder-plan.md`): no marker, no hitbox, no letter. But
 * a link's id is the sorted ids of its joints, so N's interior name rides
 * *inside* the id of the barrel (`TT1`) and of every body the barrel is welded
 * into (`TT1T2W`) — and an id is what almost everything reaches for when it
 * wants a name. Stage 2 routed the canvas, the panels and the menus through
 * `visibleBodyName`; this walks the whole app and the files it writes and
 * checks that nothing was missed, including the places that were deliberately
 * left raw and are not any more.
 *
 * **It is a harvest, not a list of assertions.** Every surface is swept for
 * *text a reader could read* — `innerText`, `aria-label`, `title`, `alt`, SVG
 * `<text>` and `<title>` (a screen reader is a reader) — and the forbidden
 * tokens are derived from the drawing itself: `sealedStructures()` gives the N
 * ids, and every body id that carries one is forbidden with them. So a surface
 * nobody thought of is covered by walking to it rather than by naming it here,
 * and a rename of the fixture cannot make the check vacuous.
 *
 * A one-letter N (`Cylinder_Gripper`'s is `B`) is not checked as a bare token:
 * a single capital is the newton symbol, a series name and half the joint
 * letters in the drawing. The ids that carry it are, and those are the ones
 * that leaked.
 *
 * A **rod** welded into a bracket cannot leak, and is walked anyway: a rod's id
 * is its seal plus its end joint, neither of which is buried, so the compound
 * that swallows it is clean by construction. That is a fact worth a check
 * rather than a comment, because it is the barrel's asymmetry that makes the
 * whole problem.
 *
 *   PMKS_BASE_URL=<origin> node e2e/hidden-joint-audit.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/hidden-joint-audit';
mkdirSync(OUT, { recursive: true });

/** Two rams hanging off one bracket, so the bracket's own id holds two N's. */
const TWO_IN_ONE_BRACKET =
  '2v.4A,Fe.5,0.1011.8T,T,Ec,18D,0.0T1,T1,hw,1I-,0.0U,U,1PA,1Zf,0.fV,V,UW,1E3,0,TT1T2W,T,T1.' +
  '0W,W,3b,wE,0.0T2,T2,SK,wV,0.0X,X,az,nt,0.fY,Y,NE,-a,0,TT1T2W,T,T2..' +
  'ARUV,UV,0,0,xr,1Os,26A69A,V,U,,.ARXY,XY,0,0,U5,uj,0d125a,Y,X,,.' +
  'ARTT1T2W,TT1T2W,0,0,Jx,15O,26A69A,T,T1,W,T2,,TT1,TW,TT2.' +
  'aRTT1,TT1,0,0,TG,1Dc,26A69A,T,T1,,.aRTW,TW,0,0,95,11D,c5cae9,T,W,,.' +
  'aRTT2,TT2,0,0,LT,11M,0d125a,T,T2,,...N_9*2JUZvL';

/**
 * A cylinder grounded at one mount with a bar hanging free off the other.
 *
 * Two freedoms even after the ram holds its length, so it is the one drawing
 * here that reaches readiness's *surplus freedom* sentence -- which points at
 * "joints that hang on only one link", and a barrel's buried end is exactly
 * such a joint. It named it, on every drawing with a cylinder in it, until
 * that list was filtered through `shown` (decision S20).
 */
const FREE_END_WITH_A_RAM =
  '2v.Ay,1E8.5,0.1011.4A,A,0ku,0,0.0A1,A1,Ag,0,0.0C,C,ku,0,0.fB,B,0Ag,0,0,AA1,A,A1.0D,D,1E8,ku,0..' +
  'ARAA1,AA1,0,0,0I7,0,c5cae9,A,A1,,.ARBC,BC,0,0,I7,0,c5cae9,B,C,,.' +
  'ARCD,CD,0,0,_W,NS,0d125a,C,D,,...N_8*43odcc';

const FIXTURES = [
  { name: 'a plain cylinder', payload: TEMPLATE_LINKAGES['Excavator_Bucket'] },
  { name: 'two barrels welded into one bracket', payload: TWO_IN_ONE_BRACKET },
  { name: 'a rod welded into a bracket', payload: TWO_IN_ONE_BRACKET, weld: 'U' },
  { name: 'a driven cylinder with a load', payload: TEMPLATE_LINKAGES['Cylinder_Gripper'] },
  { name: 'a surplus freedom beside a ram', payload: FREE_END_WITH_A_RAM },
];

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 980 },
  acceptDownloads: true,
});
const errors = [];
/**
 * A tab per fixture.
 *
 * The walk opens a right-click card on every part, five drawer pages and two
 * modal exports, and doing that four times over in one tab left the renderer
 * in a state where the next fixture's first `evaluate` found no Angular at
 * all. A fresh tab costs a second and removes the whole class.
 */
let page = await context.newPage();
page.on('pageerror', (error) => errors.push(String(error)));
const freshPage = async () => {
  const old = page;
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await old.close();
};

/** Whether a token stands on its own in this text rather than inside a word. */
const saysToken = (text, token) =>
  new RegExp(`(^|[^A-Za-z0-9])${token}([^A-Za-z0-9]|$)`).test(text);

/** Everything on screen a reader could read, as one blob. */
async function sweep(where) {
  const text = await page.evaluate(() => {
    const bits = [document.body.innerText ?? ''];
    document.querySelectorAll('[aria-label],[title],[alt],[placeholder]').forEach((el) => {
      ['aria-label', 'title', 'alt', 'placeholder'].forEach((name) => {
        const value = el.getAttribute(name);
        if (value) bits.push(value);
      });
    });
    // SVG's own text, which `innerText` does not reach, and the `<title>` a
    // screen reader reads out over a shape.
    document.querySelectorAll('text, title, desc').forEach((el) => bits.push(el.textContent ?? ''));
    return bits.join('\n');
  });
  return { where, text };
}

/** The names this drawing forbids, read off the drawing rather than typed here. */
const forbiddenOf = () =>
  page.evaluate(() => {
    const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const bodies = [];
    const walk = (link) => {
      bodies.push(link);
      (link.subset ?? []).forEach(walk);
    };
    mech.links.forEach(walk);
    const tokens = new Set();
    mech.sealedStructures().forEach((cylinder) => {
      const buried = cylinder.inner.id;
      // A one-letter interior is not a token anything can be checked against:
      // `N` is the newton symbol. The ids carrying it are.
      if (buried.length > 1) tokens.add(buried);
      bodies.forEach((body) => {
        if (body.id.includes(buried)) tokens.add(body.id);
      });
    });
    return [...tokens];
  });

const select = (id) =>
  page.evaluate((wanted) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mech = grid.mechanismSrv;
    const part =
      mech.joints.find((joint) => joint.id === wanted) ??
      mech.links.find((link) => link.id === wanted);
    if (part) grid.activeObjService.updateSelectedObj(part);
  }, id);

const setTab = async (tab) => {
  await page.evaluate((at) => {
    ng.getComponent(document.querySelector('app-new-grid')).tabService.setTab(at);
  }, tab);
  await page.waitForTimeout(350);
};

/** Every part a reader can point at, plus every top-level body. */
const selectableIds = () =>
  page.evaluate(() => {
    const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return [...mech.visibleJoints().map((joint) => joint.id), ...mech.links.map((link) => link.id)];
  });

for (const fixture of FIXTURES) {
  if (process.env.ONLY && !fixture.name.includes(process.env.ONLY)) continue;
  await freshPage();
  await page.goto(`${BASE}/?${fixture.payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(500);
  const skip = page.getByText('No thanks', { exact: true });
  if ((await skip.count()) > 0 && (await skip.first().isVisible())) await skip.first().click();

  if (fixture.weld) {
    // Through the service rather than the menu. What is under audit is the
    // names a welded body answers to, not the gesture that welds it -- and
    // `joint-type.mjs` is where the gesture itself is checked.
    await page.evaluate((id) => {
      const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      const joint = mech.joints.find((one) => one.id === id);
      if (joint) mech.weldJoint(joint);
    }, fixture.weld);
    await page.waitForTimeout(700);
  }

  const forbidden = await forbiddenOf();
  record(`${fixture.name}: the drawing really does bury a joint`, forbidden.length > 0, forbidden);
  // A check that can never fail is not a check. The token match is run against
  // a sentence that does hold the name, so a regex that stopped matching --
  // or a fixture whose cylinder quietly went away -- is caught here rather
  // than reported as a clean sweep.
  record(
    `${fixture.name}: the sweep can tell when a name is there`,
    forbidden.every((token) => saysToken(`Edit Link ${token} is selected`, token)) &&
      !saysToken('Edit Link ZZZZ is selected', forbidden[0]),
    forbidden
  );

  const sweeps = [];
  const parts = await selectableIds();

  // --- the four modes, and every part in each ------------------------------
  for (const [tab, mode] of [
    [0, 'Synthesis'],
    [1, 'Edit'],
    [2, 'Kinematic Analysis'],
    [3, 'Force Analysis'],
  ]) {
    await setTab(tab);
    sweeps.push(await sweep(`${mode}, nothing selected`));
    // The whole machine as well as its parts: the mechanism panel lists every
    // body by name, with its role and its length beside it, and that list is
    // reached from nothing else.
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-new-grid')).activeObjService.selectMechanism(0)
    );
    await page.waitForTimeout(500);
    // Any section of it still shut, opened -- a shut section holds no text to
    // sweep, and its Links list is exactly where a body's name is printed with
    // its role and its length beside it. Only the shut ones: clicking every
    // header shut the list that was already open.
    await page.evaluate(() => {
      document.querySelectorAll('app-mechanism-panel .sectionHeader').forEach((head) => {
        if (head.textContent?.includes('expand_more')) head.click();
      });
    });
    await page.waitForTimeout(300);
    sweeps.push(await sweep(`${mode}, the machine selected`));
    for (const id of parts) {
      await select(id);
      await page.waitForTimeout(160);
      sweeps.push(await sweep(`${mode}, ${id} selected`));
    }
  }

  // --- the right-click card on every part ----------------------------------
  //
  // A real right-click at the thing itself: the card is built from what was
  // under the pointer, so reaching it any other way would be auditing a
  // different code path from the one a reader takes.
  await setTab(1);
  for (const id of parts) {
    const at = await page.evaluate((wanted) => {
      const node = document.getElementById(`joint_${wanted}`) ?? document.getElementById(wanted);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return null;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, id);
    if (!at) continue;
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.waitForTimeout(220);
    sweeps.push(await sweep(`right-click card on ${id}`));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  }

  // --- the right drawer, page by page --------------------------------------
  //
  // Tab 4 is the developer drawer, which production never reaches and which is
  // the one place raw ids are allowed to stand (decision S20).
  for (const [tab, name] of [
    [1, 'Settings'],
    [3, 'Help'],
    [5, 'Kinematic setup'],
    [6, 'Force setup'],
    [7, 'Export Data'],
  ]) {
    // Guarded, because the drawer is not in the DOM until something opens it
    // and `getComponent(null)` throws. On a machine running three of these at
    // once that gap is wide enough to hit.
    await page.waitForSelector('app-right-panel', { timeout: 10000 }).catch(() => undefined);
    await page.evaluate((at) => {
      const host = document.querySelector('app-right-panel');
      const panel = host && window.ng?.getComponent(host);
      panel?.constructor?.tabClicked?.(at);
    }, tab);
    await page.waitForTimeout(700);
    sweeps.push(await sweep(`right drawer: ${name}`));
  }

  // --- Export Data, all the way to the columns it offers --------------------
  const drawer = page.locator('app-export-panel');
  if ((await drawer.count()) > 0) {
    const all = drawer.locator('.linkButton', { hasText: 'Select All' });
    if ((await all.count()) > 0) {
      await all.first().click();
      await page.waitForTimeout(300);
      sweeps.push(await sweep('Export Data: the parts it offers'));
      for (let step = 0; step < 4; step++) {
        const next = page.locator('.nextButton');
        if ((await next.count()) === 0 || (await next.first().isDisabled())) break;
        await next.first().click();
        await page.waitForTimeout(450);
        sweeps.push(await sweep(`Export Data: step ${step + 2}`));
      }
    }
  }

  const leaks = [];
  for (const one of sweeps) {
    for (const token of forbidden) {
      if (saysToken(one.text, token)) leaks.push(`${token} in ${one.where}`);
    }
  }
  record(
    `${fixture.name}: no surface names the buried joint`,
    leaks.length === 0,
    leaks.slice(0, 8)
  );
  writeFileSync(
    `${OUT}/${fixture.name.replace(/\W+/g, '-')}.txt`,
    sweeps.map((one) => `=== ${one.where} ===\n${one.text}`).join('\n\n')
  );

  // --- and the files it writes ---------------------------------------------
  const files = [];
  for (const dataFile of ['CSV', 'JSON']) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Project menu' }).click();
    await page.getByRole('button', { name: 'CAD Export' }).click();
    await page.waitForSelector('app-drawing-export', { state: 'visible' });
    sweeps.push(await sweep('CAD Export dialog'));
    await page.locator('app-drawing-export [data-section="data"]').click();
    await page.waitForTimeout(200);
    await page.locator('app-drawing-export .radioRow', { hasText: dataFile }).first().click();
    await page.waitForTimeout(200);
    const wait = page.waitForEvent('download');
    await page
      .getByRole('button', { name: /Export/ })
      .last()
      .click();
    const download = await wait;
    // The zip is stored rather than deflated (`zipStore`), so the tables are
    // in it verbatim and can be read without unpacking.
    files.push({
      name: download.suggestedFilename(),
      text: readFileSync(await download.path(), 'latin1'),
    });
    await page.waitForSelector('app-drawing-export', { state: 'detached' });
  }

  const dialogLeaks = [];
  for (const token of forbidden) {
    const last = sweeps[sweeps.length - 1];
    if (saysToken(last.text, token)) dialogLeaks.push(token);
  }
  record(
    `${fixture.name}: the CAD Export dialog names no buried joint`,
    dialogLeaks.length === 0,
    dialogLeaks
  );

  const fileLeaks = [];
  for (const file of files) {
    writeFileSync(`${OUT}/${fixture.name.replace(/\W+/g, '-')}-${file.name}`, file.text, 'latin1');
    for (const token of forbidden) {
      if (saysToken(file.text, token)) fileLeaks.push(`${token} in ${file.name}`);
    }
  }
  record(`${fixture.name}: no exported file names it either`, fileLeaks.length === 0, fileLeaks);
}

// --- a drawing with no cylinder is untouched ---------------------------------
//
// The rule is only worth having if it costs nothing where there is nothing to
// hide: every body that holds no buried joint keeps its id to the character, in
// the files as on the screen.
await page.goto(`${BASE}/?${TEMPLATE_LINKAGES['Slider_Crank']}`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(400);
const plainIds = await page.evaluate(() => {
  const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return mech.links.map((link) => [link.id, mech.visibleBodyName(link)]);
});
record(
  'a drawing with no cylinder keeps every body id as its name',
  plainIds.every(([id, name]) => id === name),
  plainIds
);

record('no page error anywhere in the walk', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) process.exit(1);
