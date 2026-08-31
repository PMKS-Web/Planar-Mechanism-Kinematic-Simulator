/**
 * Gate 1 of docs/edit-mode-playback-plan.md: the transport is chrome, and one
 * model answers for every gate.
 *
 * What this proves, in the plan's own order:
 *   - the transport is on screen and inert over an empty grid, saying why;
 *   - drawing the first link does not animate the bar in or out -- it enables
 *     the controls in place;
 *   - the Edit panel no longer vanishes while the mechanism moves: it stays,
 *     inert, with the reason across the top and the way back beside it;
 *   - every former gate surface agrees, including the unsynced case where they
 *     used to disagree;
 *   - the mode-switch table, edge by edge.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/edit-playback.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism, waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/edit-playback';
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

/**
 * Press a mode tab, and make sure it actually opened.
 *
 * A mode can refuse: Force Analysis asks more of a mechanism than kinematics
 * does and stays put when the drawing cannot answer. Silently, that turned two
 * checks of the mode-switch table into checks of Edit against itself -- both
 * passed, and neither had crossed an edge.
 */
async function mode(name) {
  await page.getByRole('button', { name, exact: false }).first().click();
  await page.waitForTimeout(400);
  const now = (await page.locator('app-bottombar').innerText()).split('\n')[0].trim();
  if (!now.toLowerCase().includes(name.toLowerCase().split(' ')[0])) {
    throw new Error(`pressing ${name} left the app in ${now}`);
  }
  return now;
}

const transport = () => page.locator('.transportCard');
const scrub = () => page.locator('.scrubCard');
const hint = () => page.locator('.transportHint');
const banner = () => page.locator('.editBanner');

// ---- 1. the empty grid ----------------------------------------------------

await page.goto(BASE);
await page.waitForTimeout(1200);

record('transport is on screen over an empty grid', await transport().isVisible());
record(
  'and says what is missing rather than nothing',
  (
    await hint()
      .innerText()
      .catch(() => '')
  ).includes('Draw a mechanism'),
  await hint()
    .innerText()
    .catch(() => '(no hint)')
);
record('with its play button inert', await page.locator('.playButton').isDisabled());
await page.screenshot({ path: `${SHOTS}/1-empty-grid.png` });

// The bar must not animate on a drawing change. `riseFromBottom` is an Angular
// animation on the card's own element, so a card that is animating has a
// transform partway between its two ends; measured across the load of a whole
// mechanism, the box must never leave the place it is standing in.
const before = await transport().boundingBox();
await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
const moved = [];
for (let i = 0; i < 12; i++) {
  const box = await transport().boundingBox();
  if (box && before && Math.abs(box.y - before.y) > 0.5) moved.push(box.y - before.y);
  await page.waitForTimeout(40);
}
record('the bar does not animate when the drawing changes', moved.length === 0, moved);

// ---- 2. the transport in Edit --------------------------------------------

await mode('Edit');
await page.waitForTimeout(300);
record('the transport is in Edit', await transport().isVisible());
record('with a scrub card', await scrub().isVisible());
record('and no hint, because it can run', (await hint().count()) === 0);
record('play is live', !(await page.locator('.playButton').isDisabled()));
await page.screenshot({ path: `${SHOTS}/2-edit-transport.png` });

// ---- 3. playing in Edit, and the panel that stays -------------------------

// Something selected, so the panel has fields to freeze rather than its empty
// state.
await page.evaluate(() => window.scrollTo(0, 0));
const joint = await page.locator('circle[id^="joint"], .joint').first();
if (await joint.count()) await joint.click({ force: true }).catch(() => {});
await page.waitForTimeout(250);

await page.locator('.playButton').click();
await page.waitForTimeout(700);

const playingState = await page.evaluate(() => ({
  banner: document.querySelector('.editBanner .bannerText')?.textContent?.trim() ?? null,
  bodyInert: document.querySelector('.editBody')?.hasAttribute('inert') ?? null,
  bodyPresent: !!document.querySelector('.editBody'),
  backButton: !!document.querySelector('.bannerAction'),
  placeholderGif: !!document.querySelector('img[src*="Stop.gif"]'),
}));
record('the Edit panel stays while it plays', playingState.bodyPresent);
record('its body is inert', playingState.bodyInert === true);
record(
  'the banner says why',
  (playingState.banner ?? '').includes('Pause the animation'),
  playingState.banner
);
record('the old placeholder GIF is gone', playingState.placeholderGif === false);
await page.screenshot({ path: `${SHOTS}/3-playing-in-edit.png` });

// Paused mid-cycle: different words, and a way back.
await page.locator('.playButton').click();
await page.waitForTimeout(400);
const pausedState = await page.evaluate(() => ({
  banner: document.querySelector('.editBanner .bannerText')?.textContent?.trim() ?? null,
  backButton: document.querySelector('.bannerAction')?.textContent?.trim() ?? null,
}));
// Phase 2 changed what this says, because it changed what is true: paused
// mid-cycle, a drag is allowed and a typed coordinate is not, so the banner
// names the fields rather than the whole panel.
record(
  'paused mid-cycle names the fields, not the panel',
  (pausedState.banner ?? '').includes('Drag on the grid to edit here'),
  pausedState.banner
);
record('and offers the way back', pausedState.backButton === 'Back to start', pausedState);
await page.screenshot({ path: `${SHOTS}/4-paused-displaced.png` });

// ---- 4. every gate agrees -------------------------------------------------
//
// The check this file was missing. It read a `window.__pmksGates` that has
// never existed and then did nothing with the result -- a check that could not
// fail, standing in for the one the whole permission model was built for.

/** Ask every former gate the same question and collect the answers. */
const gates = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const panel = window.ng.getComponent(document.querySelector('app-edit-panel'));
    const srv = grid.mechanismSrv;
    const joint = srv.joints.find((candidate) => candidate.links.length > 0);
    grid.activeObjService.updateSelectedObj(joint);
    grid.setLastRightClick(joint);
    const rows = grid.cMenu.groups.flatMap((group) => group.rows);
    const ground = rows.find((row) => row.label === 'Grounded');
    return {
      sharedStep: srv.mechanismTimeStep,
      atStart: srv.isAtStartPose(),
      canvas: grid.permission.may('drag'),
      panelFrozen: panel.panelIsFrozen(),
      menu: !ground?.refusal,
      history: grid.gridUtils.canRestoreHistory(),
      selectionHandles: grid.permission.may('drag'),
    };
  });

const agreeing = (seen) =>
  seen.canvas === seen.menu && seen.canvas === seen.history && seen.canvas === !seen.panelFrozen;

record('every gate agrees, parked mid-cycle', agreeing(await gates()), await gates());

await page.locator('.playButton').click();
await page.waitForTimeout(600);
const running = await gates();
record('every gate agrees while it runs', agreeing(running) && !running.canvas, running);
await page.locator('.playButton').click();
await page.waitForTimeout(400);

// Back to start clears it.
await page.locator('.bannerAction').click();
await page.waitForTimeout(600);
record('Back to start clears the banner', (await banner().count()) === 0);
await page.screenshot({ path: `${SHOTS}/5-back-at-start.png` });

// ---- 5. the mode-switch table --------------------------------------------

async function stepAndSeconds() {
  return page.evaluate(() => {
    const el = document.querySelector('#playbackTime');
    return el ? el.textContent.trim() : null;
  });
}

await mode('Kinematic');
await page.waitForTimeout(300);
// Scrub away from the start.
const slider = page.locator('#slider');
await slider.evaluate((el) => {
  el.value = '400';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
const inAnalysis = await stepAndSeconds();

await mode('Edit');
await page.waitForTimeout(500);
const afterEdit = await stepAndSeconds();
record('Analysis -> Edit keeps the pose', inAnalysis !== null && afterEdit === inAnalysis, {
  inAnalysis,
  afterEdit,
});
record(
  'and Edit says what may be done at that pose',
  (await banner().count()) === 1 &&
    (await banner().innerText()).includes('return to the start to type them'),
  await banner()
    .innerText()
    .catch(() => null)
);
await page.screenshot({ path: `${SHOTS}/6-pose-survives-into-edit.png` });

// Playing across the Edit -> Analysis edge keeps playing. Kinematic rather
// than Force: a plain four-bar with no masses cannot answer a force question,
// so pressing Force is refused and no edge is crossed.
await page.locator('.playButton').click();
await page.waitForTimeout(500);
await mode('Kinematic');
await page.waitForTimeout(500);
const stillPlaying = await page.locator('.playButton mat-icon').innerText();
record('Edit -> Analysis keeps playing', stillPlaying.trim() === 'pause', stillPlaying);

// Analysis -> Edit pauses.
await mode('Edit');
await page.waitForTimeout(600);
const pausedOnEntry = await page.locator('.playButton mat-icon').innerText();
record('Analysis -> Edit pauses', pausedOnEntry.trim() === 'play_arrow', pausedOnEntry);

// Anything -> Synthesis eases to the start and takes the transport away.
await mode('Synthesis');
await page.waitForTimeout(900);
record('Synthesis has no transport', (await transport().count()) === 0);
const atStart = await stepAndSeconds();
await mode('Edit');
await page.waitForTimeout(600);
record(
  'and left the drawing at its start',
  (await banner().count()) === 0,
  await banner()
    .innerText()
    .catch(() => null)
);
await page.screenshot({ path: `${SHOTS}/7-back-from-synthesis.png` });

// ---- 6. undo agrees with the canvas --------------------------------------

await page.locator('.playButton').click();
await page.waitForTimeout(500);
const undoDisabledWhilePlaying = await page
  .locator('button[aria-label="Undo"], .undoButton')
  .first()
  .isDisabled()
  .catch(() => null);
record('undo refuses while playing, as the canvas does', undoDisabledWhilePlaying !== false, {
  undoDisabledWhilePlaying,
});
await page.locator('.playButton').click();
await page.waitForTimeout(400);

record('no page errors', errors.length === 0, errors.slice(0, 3));

await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
