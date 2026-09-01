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

/**
 * The four-bar as it comes out of the URL, in Edit.
 *
 * Called between the independent blocks below rather than letting them run on
 * from each other: a check that begins on whatever the last drag left behind is
 * a check whose subject nobody chose.
 */
async function fresh() {
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await page.waitForTimeout(400);
}

await fresh();

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
// Off the right-click menu and onto the transport's displacement chip, which is
// where the rest of this machine's clock already is. Right-clicking a joint says
// nothing about which machine's start is meant, and the row does.
const menuGone = await page
  .locator('#contextMenu')
  .innerText()
  .catch(() => '');
record('the right-click menu no longer offers it', !/Set This Pose as Start/i.test(menuGone));
record(
  'the row says how far it is parked from its start',
  await page.locator('.startChip').count()
);
await page.locator('.startChipCaret').first().click();
await page.waitForTimeout(300);
const menu = await page
  .locator('.startMenu')
  .innerText()
  .catch(() => '');
record(
  'the chip offers both ways back',
  /Back to the start/i.test(menu) && /Move the start here/i.test(menu),
  menu
);
await page.screenshot({ path: `${SHOTS}/4-set-start-menu.png` });
await page.getByText('Move the start here').click();
await page.waitForTimeout(800);
const promoted = await look();
record('promoting it leaves the drawing at its start', promoted.atStart, promoted);
record(
  'and the start pose is the one that was on screen',
  JSON.stringify(promoted.startPose) !== JSON.stringify(displaced.startPose),
  { was: displaced.startPose?.[1], now: promoted.startPose?.[1] }
);

// ---- 6. grab-to-pause (Gate 3) -----------------------------------------

// Slowed right down first. A crank at ten rpm crosses a joint's own width in
// well under the time it takes to read its position and put the pointer there,
// so aiming at where it *was* is a press on empty canvas -- which is a fact
// about aiming at a moving target, not about the app.
await page.evaluate(() => {
  const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const driven = srv.joints.find((joint) => joint.input);
  driven.driveSpeed = 0.5;
  srv.updateMechanism();
});
await page.waitForTimeout(400);

// Already parked at the start, because promoting a pose is what put it there.
await page.locator('.playButton').click();
await page.waitForTimeout(1400);
record('it is running', (await look()).atStart === false);

// The frame shown at pointer-down, read before the press so there is something
// to compare the pause against.
const grabbed = await jointAt('B');
const shownAtGrab = await page.evaluate(() => {
  const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.secondsOf(0);
});
await page.mouse.move(grabbed.x, grabbed.y);
await page.mouse.down();
await page.waitForTimeout(250);
const held = await page.evaluate(() => {
  const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return { playing: srv.isPlaying, seconds: srv.secondsOf(0) };
});
await page.mouse.up();
await page.waitForTimeout(300);
record('taking hold of a moving part stops it', held.playing === false, held);
// Within a frame of where it was: the pause happens at pointer-down, before
// the gesture is even classified, so nothing can have advanced in between.
record('and it stops on the frame that was showing', Math.abs(held.seconds - shownAtGrab) < 0.1, {
  shownAtGrab,
  held,
});
await page.screenshot({ path: `${SHOTS}/5-grabbed.png` });

// Panning must not stop the show: only a movable part is a grab.
await page.locator('.playButton').click();
await page.waitForTimeout(700);
await page.mouse.move(1200, 200);
await page.mouse.down();
await page.mouse.move(1240, 230, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(250);
record(
  'a press on empty canvas does not',
  await page.evaluate(
    () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isPlaying
  )
);
await page.locator('.playButton').click();
await page.waitForTimeout(300);

// ---- 7. the anchor affordances -----------------------------------------

// The anchor's mark is the handle's own outline, hollow -- the same word the
// ghost uses on the drawing. It is drawn exactly when it has something to say:
// at the start the handle is standing in it, and nothing extra is on screen.
await page.locator('.stopButton').click();
await page.waitForTimeout(500);
record(
  'no seat is drawn while the handle is standing in it',
  (await page.locator('.anchorSeat').count()) === 0
);

await displace();
record(
  'the track marks where the cycle starts once it is away from it',
  (await page.locator('.anchorSeat').count()) >= 1
);
record(
  'and pressing the seat is the way back',
  await page.locator('.anchorSeat').first().isEnabled()
);
record('the ghost is a target', (await page.locator('.startGhost').count()) === 1);
await page.locator('.startGhost .ghostGrab').first().click({ force: true });
await page.waitForTimeout(900);
record('pressing it goes back to the start', (await look()).atStart, await look());

// ---- 2b. dragging past what the linkage can do --------------------------
//
// The half of Gate 2 a reachable drag cannot show: the ghost warning while the
// hand is still moving, the chance to drag back out of it, and the snackbar
// that narrates a start which actually moved.

/**
 * Drag until the ghost warns, rather than by a fixed distance.
 *
 * How far a joint has to travel before its linkage stops being able to start
 * where it did depends on the linkage, the zoom and where the pose put it. A
 * fixed number of pixels either falls short -- and the check passes for the
 * wrong reason, having proved only that a drag landed -- or leaves the window.
 */
async function dragUntilWarned(from, limit = 24) {
  const path = [];
  for (let step = 1; step <= limit; step++) {
    const at = { x: from.x + step * 24, y: from.y - step * 12 };
    await page.mouse.move(at.x, at.y, { steps: 2 });
    path.push(at);
    await page.waitForTimeout(45);
    if ((await page.locator('.startGhost.unreachable').count()) === 1) return path;
  }
  return null;
}

await fresh();
await displace();
{
  const grab = await jointAt('B');
  await page.mouse.click(grab.x, grab.y);
  await page.waitForTimeout(250);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const path = await dragUntilWarned(grab);
  record('the ghost warns while the hand is still moving', path !== null, { path: path?.length });
  await page.screenshot({ path: `${SHOTS}/2b-warned.png` });

  // Dragged back, the warning goes -- which is the point of it being live.
  // Driven by the warning on the way home as well as on the way out: how far
  // back the linkage has to come is the same unknown in both directions, and a
  // retrace of the outward path assumes the joint went exactly where it was
  // told, which a snap or a constraint is free to decide otherwise.
  let cleared = false;
  for (let step = 0; step <= 30 && !cleared; step++) {
    await page.mouse.move(grab.x - step * 12, grab.y + step * 6, { steps: 2 });
    await page.waitForTimeout(50);
    cleared = (await page.locator('.startGhost.unreachable').count()) === 0;
  }
  record('and clears again when the linkage comes back', cleared, {
    stillWarning: await page.locator('.startGhost.unreachable').count(),
  });
  await page.mouse.up();
  await page.waitForTimeout(700);
  record(
    'releasing there says nothing, because nothing moved',
    (await page.locator('.notification').count()) === 0
  );
}

// Released while warned: the edit lands, the start moves, and it is narrated.
await fresh();
await displace();
{
  const before = await look();
  const grab = await jointAt('B');
  await page.mouse.click(grab.x, grab.y);
  await page.waitForTimeout(250);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const path = await dragUntilWarned(grab);
  record('it can be dragged out of reach again', path !== null);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const said = await page
    .locator('.notification')
    .innerText()
    .catch(() => '');
  record(
    'releasing while warned says the start has moved',
    /starts here now/i.test(said) && /out of reach/i.test(said),
    said.slice(0, 160)
  );
  // The consequence carries its own exit, and the row keeps the same fact after
  // the message has gone.
  record('and the message carries Undo', /Undo/.test(said), said.slice(0, 160));
  record('and the row keeps the record', (await page.locator('.movedChip').count()) === 1);
  await page.screenshot({ path: `${SHOTS}/2c-snackbar.png` });
  // And the edit landed rather than being reverted for anchor reasons.
  const after = await look();
  record('with the edit kept, not reverted', after.crank !== before.crank, {
    before: before.crank,
    after: after.crank,
  });
}

// ---- 8. nothing is ever left staged ------------------------------------
//
// The property every leak found so far has broken, checked at the surface the
// leaks were in: whatever ends a gesture -- a release, an escape, a menu, a
// mode switch -- the canvas must not still be holding a machine open.

await fresh();
await displace();
{
  const grab = await jointAt('B');
  const ways = [];

  // Escape mid-drag.
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 30, grab.y - 20, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(500);
  ways.push(['escape', (await look()).posedKey]);

  // A right-click, which opens a menu on top of an undecided press.
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 20, grab.y, { steps: 3 });
  await page.mouse.click(grab.x + 20, grab.y, { button: 'right' });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  ways.push(['right-click', (await look()).posedKey]);

  // And a mode switch out from under a press.
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 20, grab.y, { steps: 3 });
  await page.getByRole('button', { name: 'Kinematic', exact: false }).first().click();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await page.waitForTimeout(400);
  await page.waitForTimeout(500);
  ways.push(['mode switch', (await look()).posedKey]);

  record(
    'no gesture leaves a machine staged',
    ways.every(([, key]) => key === null),
    ways
  );

  // And the start pose survived all of it.
  await page
    .locator('.stopButton')
    .click()
    .catch(() => {});
  await page.waitForTimeout(700);
  record('and the start pose survived all of it', (await look()).atStart, await look());
}

// ---- 8b. the joint tracks the cursor, at any pose ----------------------
//
// The canvas draws with y flipped, so every drag crosses that boundary twice:
// screen to model on the way in, model to screen on the way out. A sign error
// anywhere in that round trip does not merely put the joint in the wrong place,
// it puts it somewhere that produces a *new* delta on the next move -- which is
// what jitter is, and why this is measured rather than eyeballed.
//
// It caught something real. At a displaced pose the machine's own clock was
// held across the rebuild and laid back on afterwards -- but its displayed pose
// is its provisional t = 0 while the gesture is in flight, so every pointer
// move threw the joint a third of a cycle away from the cursor.

await fresh();
{
  /** How far the joint sits from the cursor at each step of a slow drag. */
  async function trackWhileDragging(dy, snap) {
    const start = await jointAt('B');
    await page.mouse.click(start.x, start.y);
    await page.waitForTimeout(250);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const offsets = [];
    let last = start;
    let reversals = 0;
    for (let i = 1; i <= 10; i++) {
      const at = { x: start.x, y: start.y + (dy * i) / 10 };
      if (!snap) await page.keyboard.down('Alt');
      await page.mouse.move(at.x, at.y, { steps: 1 });
      if (!snap) await page.keyboard.up('Alt');
      await page.waitForTimeout(45);
      const on = await jointAt('B');
      offsets.push(on.y - at.y);
      // The shape jitter takes: the joint moving against a cursor that did not
      // change direction.
      if (Math.sign(on.y - last.y) === -Math.sign(dy) && on.y !== last.y) reversals++;
      last = on;
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    return {
      spread: Math.max(...offsets) - Math.min(...offsets),
      reversals,
      travelled: last.y - start.y,
      asked: dy,
    };
  }

  const atStart = await trackWhileDragging(80, false);
  record('a joint tracks the cursor exactly at the start pose', atStart.spread < 1, atStart);
  record('and never moves against it', atStart.reversals === 0, atStart);

  await displace();
  const displacedTrack = await trackWhileDragging(80, false);
  // A looser offset here on purpose: displaced, the drag can pass near another
  // joint or a bar and be *captured* by it, which pulls the joint off the
  // cursor by design. What must not happen is the joint travelling a different
  // distance than it was asked to, or going backwards.
  record(
    'and follows it at a displaced pose too',
    Math.abs(displacedTrack.travelled - displacedTrack.asked) < 12,
    displacedTrack
  );
  record('and never moves against it there', displacedTrack.reversals === 0, displacedTrack);
}

// ---- 9. a release that never arrives -----------------------------------
//
// A pointer let go in another tab, or the window hidden under it, sends nothing
// to the page. The canvas went on believing a finger was down -- and that flag
// is what decides whether a staging is somebody's live gesture or an abandoned
// one, so the next ambient rebuild made the displaced pose the design.

await fresh();
await displace();
{
  const grab = await jointAt('B');
  const before = await look();
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 30, grab.y - 20, { steps: 6 });

  // The window loses focus with the button still held, and the release lands
  // somewhere this page never hears about.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(400);
  const dropped = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    return { posedKey: grid.mechanismSrv.posedEditKey, down: grid.dragState.isPointerDown };
  });
  record('a lost release puts the gesture down', !dropped.posedKey && !dropped.down, dropped);

  // And the rebuild that would have used it cannot.
  await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.updateMechanism()
  );
  await page.waitForTimeout(400);
  const after = await look();
  record(
    'and the cycle still starts where it started',
    Math.abs(after.anchorCoordinate - before.anchorCoordinate) < 0.05,
    { before: before.anchorCoordinate, after: after.anchorCoordinate }
  );
  await page.mouse.up();
}

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
