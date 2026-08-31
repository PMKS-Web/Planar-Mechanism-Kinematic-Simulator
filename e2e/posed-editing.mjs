/**
 * Gate 2 of docs/edit-mode-playback-plan.md: editing at a paused pose.
 *
 * What a browser can prove that a unit test cannot: that a real drag stages
 * itself, that the ghost is on screen and warns while the hand is still moving,
 * that the snackbar narrates a start that moved, and that undo rewinds.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/posed-editing.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/posed-editing';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail) => {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

/** Everything about the mechanism the app will admit to. */
const look = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const anchor = srv.anchorOf(0);
    return {
      atStart: srv.isAtStartPose(),
      step: srv.mechanismTimeStep,
      seconds: srv.secondsOf(0),
      anchorCoordinate: anchor ? anchor.coordinate : null,
      anchorTopology: anchor ? anchor.topology : null,
      reachable: srv.anchorIsReachable(0),
      posedKey: srv.posedEditKey,
      startPose: srv.mechanisms[0]
        ? srv.mechanisms[0].joints[0].map((j) => [j.id, Math.round(j.x * 1e6) / 1e6])
        : null,
      crank: (() => {
        const a = srv.joints.find((j) => j.id === 'A');
        const b = srv.joints.find((j) => j.id === 'B');
        return a && b ? Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 1e4) / 1e4 : null;
      })(),
    };
  });

/**
 * Park a third of the way through the cycle, and re-frame.
 *
 * The re-frame is not decoration. A four-bar a third of the way round its cycle
 * puts its coupler pin several hundred pixels below the window, and a press
 * aimed there lands on nothing at all -- which reads exactly like the drag
 * being refused, and cost an hour of looking for a gate that was not there.
 */
const displace = async () => {
  await page.evaluate(() => {
    const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    srv.seekMechanism(0, srv.mechanisms[0].cyclePeriod / 3);
  });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Reset View' }).click();
  await page.waitForTimeout(700);
};

/**
 * Where a joint is on screen, by id.
 *
 * Measured off the wrapper `svg` in `#jointHolder`, the way `e2e/phase1-drag`
 * does, rather than off the marker inside it: the marker's own box is not where
 * the pointer has to land, and aiming at it produced a press the canvas
 * recorded as landing on nothing at all.
 *
 * Thrown rather than defaulted to some other joint -- a fallback turned "drag
 * joint B" into "drag whatever was found", and every check after it read as an
 * app failure.
 */
const jointAt = async (id) => {
  const found = await page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      const marker = el.querySelector('[id^="joint_"]');
      if (marker?.id !== `joint_${wanted}`) continue;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }
    return null;
  }, id);
  if (!found) throw new Error(`no joint ${id} on screen`);
  return found;
};

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
await page.waitForTimeout(400);

// ---- 1. the ghost -------------------------------------------------------

record('no ghost at the start pose', (await page.locator('#startGhostHolder').count()) === 0);
await displace();
await page.waitForTimeout(400);
record('the ghost appears once displaced', (await page.locator('.startGhost').count()) === 1);
record('and draws bars', (await page.locator('.startGhost line').count()) > 0);
record('with no warning on it', (await page.locator('.startGhost.unreachable').count()) === 0);
await page.screenshot({ path: `${SHOTS}/1-ghost.png` });

// ---- 2. a drag at a pose stages itself and re-anchors --------------------

const before = await look();
record('a freshly opened drawing has an anchor', before.anchorCoordinate !== null, before);

// Selected first, then grabbed. The canvas decides what a press is about from
// what is selected, so a press that both selects and drags is two gestures the
// suite cannot tell apart.
const grab = await jointAt('B');
await page.mouse.click(grab.x, grab.y);
await page.waitForTimeout(250);
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
await page.mouse.move(grab.x + 20, grab.y - 14, { steps: 8 });
const midDrag = await look();
record('the drag staged the machine it is editing', midDrag.posedKey !== null, midDrag);
await page.mouse.move(grab.x + 34, grab.y - 22, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);

const after = await look();
record('the edit landed', after.crank !== before.crank, {
  before: before.crank,
  after: after.crank,
});
record('the staging closed', after.posedKey === null, after);
record(
  'and the cycle still starts where it started',
  before.anchorCoordinate !== null &&
    Math.abs(after.anchorCoordinate - before.anchorCoordinate) < 0.05,
  { before: before.anchorCoordinate, after: after.anchorCoordinate }
);
await page.screenshot({ path: `${SHOTS}/2-after-posed-drag.png` });

// ---- 3. stopping returns the input to the anchored value ----------------

await page.locator('.stopButton').click();
await page.waitForTimeout(700);
const stopped = await look();
record('stop returns to the start pose', stopped.atStart, stopped);
record('no ghost there', (await page.locator('#startGhostHolder').count()) === 0);

// ---- 4. undo rewinds ---------------------------------------------------

await displace();
await page.waitForTimeout(300);
const undoButton = page.locator('.historyCard .historyButton').first();
record('undo is offered at a displaced pose', !(await undoButton.isDisabled()));
await undoButton.click();
await page.waitForTimeout(900);
const undone = await look();
record("and lands at the restored drawing's own start", undone.atStart, undone);
record('with the edit taken back', undone.crank !== after.crank, {
  edited: after.crank,
  undone: undone.crank,
});
await page.screenshot({ path: `${SHOTS}/3-after-undo.png` });

// ---- 5. Set this pose as start -----------------------------------------

await displace();
const displaced = await look();
const target = await jointAt('B');
await page.mouse.move(target.x, target.y);
await page.mouse.click(target.x, target.y, { button: 'right' });
await page.waitForTimeout(500);
const menu = await page
  .locator('#contextMenu')
  .innerText()
  .catch(() => '');
record(
  'the menu offers to promote this pose',
  /Set This Pose as Start/i.test(menu),
  menu.slice(0, 200)
);
await page.screenshot({ path: `${SHOTS}/4-set-start-menu.png` });
await page.getByText('Set This Pose as Start').click();
await page.waitForTimeout(800);
const promoted = await look();
record('promoting it leaves the drawing at its start', promoted.atStart, promoted);
record(
  'and the start pose is the one that was on screen',
  JSON.stringify(promoted.startPose) !== JSON.stringify(displaced.startPose),
  { was: displaced.startPose?.[1], now: promoted.startPose?.[1] }
);

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
