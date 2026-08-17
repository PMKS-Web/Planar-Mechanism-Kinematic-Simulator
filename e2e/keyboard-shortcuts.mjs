/**
 * The keys, exercised the way a hand would: press one and watch the app do
 * what the control it doubles would have done -- and watch the same key do
 * nothing at all while a name is being typed into a field.
 *
 *   PMKS_BASE_URL=<origin> node e2e/keyboard-shortcuts.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

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
const skip = page.locator('.introjs-skipbutton').first();
if (await skip.isVisible().catch(() => false)) await skip.click({ force: true });
await page.waitForTimeout(500);

/** The joint's centre on screen: the canvas places from where the mouse is. */
const clickJoint = async (id) => {
  const at = await page.evaluate((jointId) => {
    const el = document.querySelector(`#joint_${jointId}`)?.closest('svg[x]');
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);
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

// --- Playback, and only where there is a transport --------------------------
await press('2');
const still = await state();
await press('Space');
record('Space does nothing in Edit, which has no transport', (await state()).playing === false, {
  before: still.playing,
});
await press('3');
await press('Space');
record('Space starts it playing', (await state()).playing === true);
await press('Space');
record('and Space again pauses it', (await state()).playing === false);

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

// A traced path needs a joint that traces one, so the switch is greyed here
// and the key must be greyed with it.
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

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
