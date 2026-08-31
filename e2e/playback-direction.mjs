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

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

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
      // The drawn pose: reversing must not move the drawing.
      pose: srv.joints.map((j) => [j.x, j.y]),
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
  ['Clockwise', 'Counter-clockwise', 'Opening', 'Closing'].includes(atRest.notes[0]),
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
// Paused for this one: the pose has to be compared across the flip, and a
// running clock moves it between the two reads for reasons that are not the
// flip's doing.
await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(300);
const before = await state();
await page.locator('.dirButton').first().click();
await page.waitForTimeout(400);
const after = await state();
record('reversing does not stop it being resumable', after.playing === false, { before, after });
// Within a model unit, which is a two-hundredth of a centimeter: the mirrored
// cycle lands on the neighboring sample, so "did not move" is a question about
// pixels rather than about the fourteenth decimal place.
const moved = Math.max(
  ...before.pose.map(([x, y], i) => Math.hypot(after.pose[i][0] - x, after.pose[i][1] - y))
);
record('and the linkage has not moved -- the same pose, still', moved < 1, {
  moved,
  before: before.pose,
  after: after.pose,
});
record('nor has the handle', Math.abs(after.scrub[0] - before.scrub[0]) < 30, {
  before: before.scrub,
  after: after.scrub,
});
// Nothing moves at all now, the clock included. Reversing used to mirror the
// cycle, which put the pose that was at time t at period - t and made the clock
// jump to follow it. The cycle is left alone instead and the machine turns
// round on it, so there is nothing for the clock to catch up with.
record('and neither has the clock', after.seconds === before.seconds, {
  before: before.seconds,
  after: after.seconds,
});
record('and the label changed with it', after.notes[0] !== before.notes[0], {
  before: before.notes,
  after: after.notes,
});

// And reversing while it runs leaves it running.
await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(900);
await page.locator('.dirButton').first().click();
await page.waitForTimeout(400);
const stillRunning = await state();
record(
  'reversing a running machine leaves it running',
  stillRunning.playing === true,
  stillRunning
);
await page.locator('.transportCard .playButton').click();
await page.waitForTimeout(300);

// --- the start pose is untouched by any of it -------------------------------
//
// Asked of sample 0 of the solved cycle, which *is* t = 0, rather than of the
// editable joints. Those were a fair proxy while switching to Edit always
// rewound: the drawn pose and the start pose were the same thing there. Edit
// keeps the pose now, so reading the drawn joints would report every deliberate
// mid-cycle pause as a start pose that had moved -- and stop reporting the
// thing this check is named for.
await page.locator('.tabButton', { hasText: 'Edit' }).click();
await page.waitForTimeout(900);
const startPose = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return srv.mechanisms[0].joints[0]
      .map((j) => `${j.id}:${j.x.toFixed(2)},${j.y.toFixed(2)}`)
      .join(' ');
  });
const home = await startPose();
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
const fresh = await startPose();
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
