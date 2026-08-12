/**
 * The transport's direction button, and the master play button, in the browser.
 *
 * Reversing a machine keeps its place in the cycle and keeps it running; the
 * handle carries the direction, running left to right clockwise and right to
 * left counter-clockwise; and the master button and the per-machine buttons
 * never disagree about whether anything is moving.
 *
 *   PMKS_BASE_URL=<origin> node e2e/playback-direction.mjs
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const state = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      playing: srv.isPlaying,
      step: srv.mechanismTimeStep,
      seconds: +srv.currentTimeSeconds().toFixed(3),
      rowPlaying: srv.mechanisms.map((_, i) => srv.isMechanismPlaying(i)),
      scrub: [...document.querySelectorAll('.rowScrubber')].map((s) => +s.value),
      notes: [...document.querySelectorAll('.rowNote')].map((n) => n.textContent.trim()),
    };
  });

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(900);

// --- the label names the direction, not the kind of machine -----------------
const atRest = await state();
record(
  'the row says which way the input is going',
  ['Clockwise', 'CCW', 'Extending', 'Retracting'].includes(atRest.notes[0]),
  atRest.notes
);

// --- a clockwise drive runs the handle left to right ------------------------
await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(1200);
const running = await state();
record('the handle has moved off the left end', running.scrub[0] > atRest.scrub[0], {
  atRest,
  running,
});

// --- reversing keeps the place and keeps playing -----------------------------
const before = await state();
await page.locator('.dirButton').first().click();
await page.waitForTimeout(300);
const after = await state();
record('reversing leaves it playing', after.playing === true, { before, after });
record(
  'and near where it was, not back at the start',
  after.seconds > 0.05 && Math.abs(after.seconds - before.seconds) < 0.6,
  { before, after }
);
record(
  'and the handle now runs the other way along the track',
  Math.abs(after.scrub[0] - (1000 - before.scrub[0])) < 220,
  { before, after }
);
record('and the label changed with it', after.notes[0] !== before.notes[0], {
  before: before.notes,
  after: after.notes,
});

// --- the start pose is untouched by any of it -------------------------------
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(900);
const home = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.joints.map((j) => `${j.id}:${j.x.toFixed(2)},${j.y.toFixed(2)}`).join(' ');
});
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const fresh = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.joints.map((j) => `${j.id}:${j.x.toFixed(2)},${j.y.toFixed(2)}`).join(' ');
});
record('reversing never moved the pose the drawing starts from', home === fresh, { home, fresh });

// --- master and rows agree ---------------------------------------------------
await page.evaluate(() => {
  // A second four-bar, so the transport has rows of its own to get out of step.
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const JointClass = Object.getPrototypeOf(srv.joints[0]).constructor;
  const LinkClass = Object.getPrototypeOf(srv.links[0]).constructor;
  const S = srv.joints[0].x === 0 ? 200 : Math.abs(srv.joints[0].x) / 3;
  const made = [
    [10, 0],
    [10, 1],
    [13, 2],
    [14, 0],
  ].map(([x, y], i) => new JointClass(String.fromCharCode(69 + i), x * S, y * S));
  made[0].ground = true;
  made[3].ground = true;
  made[0].input = true;
  const links = [0, 1, 2].map((i) => {
    const link = new LinkClass(made[i].id + made[i + 1].id, [made[i], made[i + 1]]);
    made[i].links.push(link);
    made[i + 1].links.push(link);
    made[i].connectedJoints.push(made[i + 1]);
    made[i + 1].connectedJoints.push(made[i]);
    return link;
  });
  srv.joints.push(...made);
  srv.links.push(...links);
  srv.updateMechanism(true);
});
await page.waitForTimeout(1200);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(800);
await page.locator('.syncToggle').click();
await page.waitForTimeout(600);

await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(500);
const allOn = await state();
record(
  'the master button starts every machine, not just the shared flag',
  allOn.playing && allOn.rowPlaying.every(Boolean),
  allOn
);

const rowPlays = page.locator('.rowPlay');
await rowPlays.nth(0).click();
await page.waitForTimeout(300);
await rowPlays.nth(1).click();
await page.waitForTimeout(400);
const allOff = await state();
record(
  'pausing every row pauses the master too',
  !allOff.playing && allOff.rowPlaying.every((p) => !p),
  allOff
);

await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(400);
await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(400);
const masterOff = await state();
record(
  'and pausing the master pauses every row',
  !masterOff.playing && masterOff.rowPlaying.every((p) => !p),
  masterOff
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
