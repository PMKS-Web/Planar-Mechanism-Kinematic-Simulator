/**
 * The keys, exercised the way a hand would: press one and watch the app do
 * what the control it doubles would have done -- and watch the same key do
 * nothing at all while a name is being typed into a field.
 *
 *   PMKS_BASE_URL=<origin> node e2e/keyboard-shortcuts.mjs
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(500);

/** The joint's center on screen: the canvas places from where the mouse is. */
const centerOf = (id) =>
  page.evaluate((jointId) => {
    const el = document.querySelector(`#joint_${jointId}`)?.closest('svg[x]');
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);

const clickJoint = async (id) => {
  // Aimed only once the joint has stopped moving. Leaving an analysis mode
  // winds the linkage back to its start pose, and a click aimed while that is
  // still running lands where the joint was rather than where it is.
  let at = await centerOf(id);
  for (let tries = 0; tries < 20; tries++) {
    await page.waitForTimeout(100);
    const now = await centerOf(id);
    if (Math.hypot(now.x - at.x, now.y - at.y) < 0.5) break;
    at = now;
  }
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
};

const state = () =>
  page.evaluate(() => {
    const c = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      tab: c.tabService.getCurrentTab(),
      playing: c.mechanismSrv.isPlaying,
      step: c.mechanismSrv.mechanismTimeStep,
      ids: c.settings.isShowID.value,
      com: c.settings.isShowCOM.value,
      paths: c.settings.isShowTraces.value,
      selected: c.activeObjService.objType,
      joints: c.mechanismSrv.joints.length,
      lockedJoints: c.mechanismSrv.joints.filter((j) => j.locked).length,
      drawer: ng.getComponent(document.querySelector('app-right-panel'))?.getOpenTab?.(),
    };
  });

const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(350);
};

// --- Modes ------------------------------------------------------------------
// 0 Synthesis, 1 Edit, 2 Kinematic, 3 Force (TabID's own order).
await press('1');
record('1 goes to Synthesis', (await state()).tab === 0, await state());
await press('2');
record('2 comes back to Edit', (await state()).tab === 1, await state());
await press('3');
record('3 opens Kinematic Analysis', (await state()).tab === 2, await state());

// --- Playback, wherever the transport is ------------------------------------
//
// This used to assert that Space did nothing in Edit, which was true while the
// transport lived only in the analyses. The gate is now "is the control this
// key stands for on screen", and the transport is on screen everywhere but
// Synthesis -- so Space plays in Edit too, and refuses only where there is no
// transport to press.
await press('2');
await press('Space');
record('Space plays in Edit, where the transport now is', (await state()).playing === true);
await press('Space');
record('and Space again pauses it', (await state()).playing === false);

await press('1');
const inSynthesis = await state();
await press('Space');
record(
  'Space does nothing in Synthesis, which has no transport',
  (await state()).playing === false,
  {
    before: inSynthesis.playing,
  }
);

await press('3');
await press('Space');
record('Space starts it playing in an analysis mode too', (await state()).playing === true);
await press('Space');
record('and pauses it there', (await state()).playing === false);

// Arrows step frames only where nothing is selected to nudge -- one predicate,
// from the permission model. Nothing is selected here.
const before = (await state()).step;
await press('ArrowRight');
const stepped = (await state()).step;
record('Right steps one frame on', stepped !== before, { before, stepped });
await press('ArrowLeft');
record('and Left brings it back', (await state()).step === before, {
  before,
  now: (await state()).step,
});

// --- View -------------------------------------------------------------------
const ids = (await state()).ids;
await press('l');
record('L turns the joint IDs off and on', (await state()).ids !== ids);
await press('l');

// A traced path needs a joint that traces one, so the switch is grayed here
// and the key must be grayed with it.
const paths = (await state()).paths;
await press('p');
record('P leaves traced paths alone while no joint traces one', (await state()).paths === paths);

// --- Editing ----------------------------------------------------------------
await press('2'); // back to Edit, where there is something to select
await clickJoint('B');
record('a joint is selected', (await state()).selected === 'Joint', await state());
await press('Escape');
record('Escape lets it go', (await state()).selected === 'Grid', await state());

const jointsBefore = (await state()).joints;
await clickJoint('B');
// Backspace, not Delete: the key a MacBook actually has.
await press('Backspace');
record('Backspace deletes the selected joint', (await state()).joints === jointsBefore - 1, {
  jointsBefore,
  now: (await state()).joints,
});
await page.keyboard.press('Control+z');
await page.waitForTimeout(500);
record('Ctrl+Z puts it back', (await state()).joints === jointsBefore);

// --- A key typed into a field belongs to the field ---------------------------
await clickJoint('A');
const field = page.locator('app-edit-panel input').first();
await field.click();
await field.press('3');
await page.waitForTimeout(300);
record('a mode key typed into a field does not switch modes', (await state()).tab === 1, {
  tab: (await state()).tab,
});

// --- Lock, and Settings -----------------------------------------------------
await clickJoint('B');
await press('k');
record('K locks the selected joint', (await state()).lockedJoints === 1, await state());
await press('k');
record('and K again lets it go', (await state()).lockedJoints === 0, await state());

await press(',');
record('a comma opens Settings', (await state()).drawer === 1, await state());

// --- A key that changes the drawing is an Edit key ---------------------------
// An analysis mode is a reading of a finished mechanism: it hides the lock
// marks, grays the panels, and takes Undo away. A key that edits anyway leaves
// a change there is no way back from without leaving the mode.
await clickJoint('B');
const beforeAnalysis = await state();
await press('3');
await press('Backspace');
const afterDelete = await state();
const saidWhy = await page.evaluate(() => {
  const one = ng
    .getComponent(document.querySelector('app-new-grid'))
    .notify.live.find((n) => n.id === 'delete.analysis');
  return !!one && one.actions.some((action) => action.label === 'Switch to Edit');
});
record(
  'Delete does nothing in an analysis mode, and the message offers Edit',
  afterDelete.joints === beforeAnalysis.joints && saidWhy,
  { beforeAnalysis, afterDelete, saidWhy }
);
// A lock is a mark on the drawing rather than a change to it, like a trace,
// and the analysis menus offer it; so does the key.
await press('k');
record('Lock still works there', (await state()).lockedJoints === 1, await state());
await press('k');
await press('2');
await clickJoint('B');
await press('k');
record('and both work again back in Edit', (await state()).lockedJoints === 1, await state());
await press('k');

// A dropdown answers to the keyboard the whole time it has focus: letters jump
// to an option, and the digits that pick a mode here are letters to it.
await clickJoint('A');
const dropdown = page.locator('app-edit-panel select').first();
if ((await dropdown.count()) > 0) {
  await dropdown.focus();
  const beforeSelect = await state();
  await press('3');
  record(
    'a mode key inside a focused dropdown stays there',
    (await state()).tab === beforeSelect.tab,
    {
      beforeSelect,
      now: await state(),
    }
  );
}

// --- "Delete what is selected" means a force too -----------------------------
// A force is a thing on the drawing with a Delete of its own in its menu. Left
// out of the key, the arrow stayed put and only the selection cleared, which
// reads as a delete that did not take.
await page.goto(`${BASE}/?${payloads['Derrick_Crane']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
await page.evaluate(() => {
  const c = ng.getComponent(document.querySelector('app-new-grid'));
  c.activeObjService.updateSelectedObj(c.mechanismSrv.forces[0]);
});
await page.waitForTimeout(500);
const withForce = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.length
);
await press('Backspace');
const afterForce = await page.evaluate(
  () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.forces.length
);
record('Delete removes a selected force', withForce === 1 && afterForce === 0, {
  withForce,
  afterForce,
});

// --- A key belongs to whatever is standing over the canvas -------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(700);
// These are the canvas's keys. With a dialog open the reader is looking at the
// dialog, and Delete was quietly removing the joint selected behind it.
await clickJoint('B');
const guarded = await state();
await page.locator('.topStrip .iconButton').first().click();
await page.waitForTimeout(500);
await page.locator('#templatesButton').click();
await page.waitForTimeout(1200);
record(
  'the Templates dialog is open',
  (await page.evaluate(() => document.querySelectorAll('mat-dialog-container').length)) > 0
);
for (const key of ['Backspace', '3', 'k', ',']) await press(key);
const behind = await state();
record(
  'and no shortcut acts behind it',
  behind.joints === guarded.joints &&
    behind.tab === guarded.tab &&
    behind.lockedJoints === guarded.lockedJoints &&
    behind.drawer === guarded.drawer,
  { guarded, behind }
);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await page.mouse.click(900, 700);
await page.waitForTimeout(300);

// --- The list that teaches them --------------------------------------------
// Out of the field first: the check above just proved that a key typed into
// one stays there, so a `?` pressed with the caret still in it would too.
await page.mouse.click(900, 700);
await page.waitForTimeout(300);
await press('?');
await page.waitForTimeout(700);
const help = await page.evaluate(() => {
  const panel = document.querySelector('app-help-panel');
  return panel ? panel.innerText : '';
});
record('? opens Help', /Send Feedback|Keyboard Shortcuts/.test(help), help.slice(0, 80));
const listed = await page.evaluate(() => {
  const panel = document.querySelector('app-help-panel');
  return {
    heading: /Keyboard Shortcuts/.test(panel?.innerText ?? ''),
    caps: document.querySelectorAll('app-help-panel .keyCap').length,
  };
});
record(
  'and the drawer carries the list of keys, one cap each',
  listed.heading && listed.caps >= 15,
  listed
);

// ---- R stops, and stopping means back to the start ----------------------
//
// Space plays and pauses, which leaves the machine wherever the reader's thumb
// happened to land. The transport has always had a second button for going back
// to the start pose, and it was the one thing on that card no key could reach.
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(600);
await page.locator('.playButton').click();
await page.waitForTimeout(900);
await page.locator('.playButton').click();
await page.waitForTimeout(400);
const atStart = () =>
  page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isAtStartPose()
  );
const displaced = await atStart();
await page.keyboard.press('r');
await page.waitForTimeout(1200);
const home = await atStart();
record('R goes back to the start pose', displaced === false && home === true, {
  displaced,
  home,
});
record(
  'and Help lists it with the rest of the transport',
  /Stop and go back to the start/.test(
    await page.evaluate(() => document.querySelector('app-help-panel')?.innerText ?? '')
  ) ||
    (await page.evaluate(() =>
      window.ng
        .getComponent(document.querySelector('app-playback-bar'))
        .shortcuts.bySection()
        .some((group) =>
          group.shortcuts.some((one) => one.id === 'playback.stop' && one.keys === 'R')
        )
    ))
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
