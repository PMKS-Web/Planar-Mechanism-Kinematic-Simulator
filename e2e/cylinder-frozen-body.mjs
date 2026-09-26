// A cylinder welded into one body at both ends, driven, in the running app.
//
// The maintainer's drawing: the cylinder `A-B-C` with a bar to `D` off each of
// its end joints, a bar `D-E`, welds at `A`, `C` and `D`, and `E` a grounded
// pin with Driven Input on. The app used to fail to solve it, keep the
// mechanism it had solved before the input was switched on, and report that
// machine's blocker -- "No input is set", about a drawing whose
// joint E is plainly driven (decision S25).
//
// The unit suite (`src/tests/verification/cylinder-frozen-body.spec.ts`) checks
// the numbers. This is the gate that asks the *app*: what the analysis drawer
// says before and after the input is switched on, whether the chips read ready,
// what the panels show for the body and for each of its parts, whether the menu
// grays Add Input on a seal that cannot extend, and whether the skin rides the
// body when it runs.
//
//   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<url> node e2e/cylinder-frozen-body.mjs

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-frozen-body';

const results = [];
const consoleErrors = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });
const film = filmstrip(page, OUT);

const tab = (name) => page.locator('.tabButton', { hasText: name });
const drawerText = () =>
  page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
/** The drawer's text with every issue's fixes open, as a reader who asked for them sees it. */
const drawerTextOpen = async () => {
  // Only the shut ones: an issue alone in its section starts open.
  const closed = page.locator('app-analysis-setup issue-block .issueToggle[aria-expanded="false"]');
  while ((await closed.count()) > 0) await closed.first().click();
  return drawerText();
};
const panelText = () => page.locator('app-left-tabs').innerText();

/**
 * The maintainer's drawing, built through the same service calls the canvas
 * makes -- `createCylinderFrom`, `addBarFrom`, `mergeJoints`, `weldJoint`,
 * `toggleGround` and `adjustInput` off the selection -- rather than by pushing
 * objects into the arrays, so it cannot be assembled in a shape the app itself
 * could never reach. Every *reading* below is taken from the UI.
 *
 * `drive` is left off for the first pass, because the sentence this file exists
 * for is the one the app says before and after the input arrives.
 */
async function build({ drive }) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  return page.evaluate(
    (how) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const m = grid.mechanismSrv;
      const S = 200;
      const at = (id) => m.joints.find((j) => j.id === id);
      const far = (link, anchor) => link.joints.find((j) => j.id !== anchor.id);

      m.createCylinderFrom({ x: -3 * S, y: 0 }, { x: 3 * S, y: 0 });
      const ram = m.sealedStructures()[0];
      // A bar from each end joint up to a shared apex, then a bar down to the pin
      // the whole body will turn on.
      const apex = m.addBarFrom(ram.mountA, { x: 0, y: 4 * S });
      const d = far(apex, ram.mountA);
      const other = m.addBarFrom(ram.mountB, { x: d.x, y: d.y });
      m.mergeJoints(far(other, ram.mountB), d);
      const stem = m.addBarFrom(d, { x: 0, y: -3 * S });
      const e = far(stem, d);

      [ram.mountA.id, ram.mountB.id, d.id].forEach((id) => {
        grid.activeObjService.updateSelectedObj(at(id));
        m.weldJoint();
      });
      grid.activeObjService.updateSelectedObj(at(e.id));
      m.toggleGround();
      if (how.drive) {
        grid.activeObjService.updateSelectedObj(at(e.id));
        m.adjustInput();
      }
      m.updateMechanism(true);

      // Ids read from the drawing, never hard-coded: the letters follow the order
      // the parts were drawn in, and a change there should move this suite rather
      // than break it.
      const found = m.sealedStructures()[0];
      return {
        seal: found.seal.id,
        barrel: found.barrel.id,
        rod: found.rod.id,
        mountA: found.mountA.id,
        mountB: found.mountB.id,
        inner: found.inner.id,
        body: m.links[0].id,
        apex: d.id,
        pin: e.id,
        bodyName: m.visibleBodyName(m.links[0]),
        visible: m.visibleJoints().map((j) => j.id),
      };
    },
    { drive }
  );
}

// --- before the input: the sentence is true, and says so --------------------
let ids = await build({ drive: false });
await tab('Kinematic').click();
await page.waitForTimeout(600);
let text = await drawerTextOpen();
check(
  'with nothing driven, the drawer says nothing drives it',
  text.includes('No input is set'),
  text.slice(0, 160)
);
check('and offers a joint to drive', /Add Input to joint [A-Z]/.test(text), text.slice(0, 400));

// --- with the input on: it runs ---------------------------------------------
ids = await build({ drive: true });
console.log(`  built ${JSON.stringify(ids)}`);
check('the body is one link', ids.body.length > 0 && ids.bodyName === 'ABCDE', ids.bodyName);
check('the buried end is in no list a reader sees', !ids.visible.includes(ids.inner), ids.inner);

await tab('Kinematic').click();
await page.waitForTimeout(700);
await film.shot('kinematic-at-rest');

const chips = await page.evaluate(() =>
  [...document.querySelectorAll('.tabButton')].map((t) => t.innerText.replace(/\n/g, ' | '))
);
check(
  'neither analysis chip reads as a blocker',
  !chips.some((one) => /to fix/.test(one)),
  chips.join(' // ')
);

const readiness = await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return m.readinessOfEachMechanism().map((r) => ({
    ready: r.ready,
    blockers: r.checks.filter((c) => c.severity === 'blocker').map((c) => c.title),
    said: r.checks
      .map((c) =>
        [c.title, c.summary, ...c.fixes]
          .map((piece) =>
            Array.isArray(piece)
              ? piece.map((bit) => (typeof bit === 'string' ? bit : bit.label)).join('')
              : piece
          )
          .join(' ')
      )
      .join(' '),
  }));
});
check(
  'the machine reports ready',
  readiness.every((r) => r.ready),
  JSON.stringify(readiness)
);
check(
  'with no blocker at all',
  readiness.every((r) => r.blockers.length === 0),
  JSON.stringify(readiness.map((r) => r.blockers))
);
check(
  'and never says nothing drives it',
  readiness.every((r) => !/No input is set|Add Input to joint/.test(r.said)),
  readiness.map((r) => r.said).join(' ')
);

// The chip's own drawer, opened the way a reader opens it.
await page.locator('.tabButton', { hasText: 'Kinematic' }).locator('chip-block').click();
await page.waitForTimeout(500);
text = await drawerTextOpen();
check(
  'the drawer says the cylinder cannot extend, and which welds to undo',
  /Cylinder [A-Z]+ can't extend/.test(text) &&
    /Set joint [A-Z] to Revolute\s+Set joint [A-Z] to Revolute/.test(text),
  text.slice(0, 400)
);
check(
  'and does not blame the linkage for binding on it',
  !text.includes('locks up before'),
  text.slice(0, 260)
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- the panels: every part of the body reads true kinematics ---------------
async function readingsFor(what) {
  await page.evaluate((which) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const m = grid.mechanismSrv;
    const ram = m.sealedStructures()[0];
    const part =
      which === 'body'
        ? m.links[0]
        : which === 'barrel'
          ? ram.barrel
          : which === 'rod'
            ? ram.rod
            : which === 'seal'
              ? ram.seal
              : ram.mountA;
    grid.activeObjService.updateSelectedObj(part);
  }, what);
  await page.waitForTimeout(600);
  return panelText();
}

for (const part of ['body', 'barrel', 'rod', 'seal', 'end joint']) {
  const said = await readingsFor(part);
  check(
    `the ${part} panel offers kinematics rather than refusing them`,
    !said.includes('not in a mechanism that can be solved') && said.includes('Readings at'),
    said.slice(0, 140).replace(/\n/g, ' / ')
  );
  check(
    `the ${part} panel has a number in it`,
    /-?\d+\.\d\d/.test(said.replace(/Readings at [\d.]+ s/, '')),
    said.slice(0, 200).replace(/\n/g, ' / ')
  );
}

// --- force analysis is offered and solves -----------------------------------
await tab('Force').click();
await page.waitForTimeout(800);
const forces = await page.evaluate(() => {
  const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const series = m.mechanisms[0].getForceAnalysis('static');
  return {
    diagnostic: series.diagnostic ?? null,
    ok: series.successfulFrames,
    of: series.frames.length,
    couples: [...series.frames[0].guideCouples.keys()],
  };
});
check(
  'force analysis solves every frame of the frozen body',
  forces.diagnostic === null && forces.ok === forces.of && forces.of > 100,
  JSON.stringify(forces)
);
check(
  'and reports no couple across a slide that holds one body to itself',
  forces.couples.length === 0,
  JSON.stringify(forces.couples)
);

// --- the menu refuses a drive on the seal, in the model's words -------------
// A real right-click on the cream bar the reader sees, and the rows the card
// actually draws.
await tab('Edit').click();
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
const sealAt = await page.evaluate((id) => {
  const node = document.querySelector(`#joint_${id}`);
  if (!node) return null;
  const box = node.getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}, ids.seal);
check('the seal has a hitbox to right-click', sealAt !== null, JSON.stringify(sealAt));
await page.mouse.click(sealAt.x, sealAt.y, { button: 'right' });
await page.waitForTimeout(400);
await film.shot('seal-menu');
const menu = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const rows = (grid.cMenu?.groups ?? []).flatMap((group) =>
    group.rows.map((row) => ({
      label: row.label,
      off: !!row.disabled,
      why: row.refusal?.short ?? null,
      long: row.refusal?.long ?? null,
    }))
  );
  return { title: grid.cMenu?.header?.title ?? null, rows };
});
const inputRow = menu.rows.find((one) => /Input/.test(one.label ?? ''));
check('right-clicking the seal opens its own card', menu.title === `Joint ${ids.seal}`, menu.title);
check(
  'the Add Input row is grayed with the reason the model gives',
  !!inputRow && inputRow.off === true && /can't extend/.test(inputRow.why ?? ''),
  JSON.stringify(inputRow)
);
check(
  'and the reason behind it names the welds to undo',
  /Set joint [A-Z] or joint [A-Z] to Revolute/.test(inputRow?.long ?? ''),
  inputRow?.long ?? ''
);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

// --- it runs, and the skin rides the body -----------------------------------
await tab('Kinematic').click();
await page.waitForTimeout(500);
await page.locator('button[aria-label="Fit full motion"]').click();
await page.waitForTimeout(500);

const along = () =>
  page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const ram = m.sealedStructures()[0];
    const span = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    return {
      // The head's place along the bore, and both members' lengths. A frozen
      // cylinder holds all three however far round the body has turned.
      seal: span(ram.mountA, ram.seal) / 200,
      barrel: span(ram.mountA, ram.inner) / 200,
      rod: span(ram.seal, ram.mountB) / 200,
    };
  });

const atRest = await along();
await film.during(120, 10, 'running', async () => {
  await page.locator('button.playButton').click();
  await page.waitForTimeout(1400);
});
const running = await along();
await page.locator('button.playButton').click();
await page.waitForTimeout(200);

check(
  'the head does not drift along the bore while it runs',
  Math.abs(running.seal - atRest.seal) < 1e-3,
  `${atRest.seal} -> ${running.seal}`
);
check(
  'and both members keep their length',
  Math.abs(running.barrel - atRest.barrel) < 1e-3 && Math.abs(running.rod - atRest.rod) < 1e-3,
  JSON.stringify({ atRest, running })
);

const painted = await page.evaluate(() => ({
  // The body's own silhouette. A frozen cylinder's barrel and rod are painted
  // into the compound's outline (S16), so there is one filled body here and not
  // a bar plus a ram drawn over it.
  bodies: document.querySelectorAll('path.cylinder-body, path.link-default').length,
  // The two member bars still take their own clicks, which is what keeps Barrel
  // and Rod selectable.
  members: document.querySelectorAll('path.cylinder-member-hit').length,
  seal: document.querySelectorAll('path.cylinder-seal').length,
}));
check(
  'the fused body draws as one outline, with both members still clickable',
  painted.bodies === 1 && painted.members === 2 && painted.seal === 1,
  JSON.stringify(painted)
);

// --- nothing anywhere names the buried joint --------------------------------
const shown = await page.evaluate(() => document.body.innerText);
check(
  'the buried barrel end is named nowhere a reader can read',
  !new RegExp(`\\b${ids.inner}\\b`).test(shown),
  ids.inner
);

await film.shot('after-run');
await contactSheet(`${OUT}/*running*.png`, `${OUT}/running-sheet.png`, 5);

check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ ids, results, consoleErrors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
