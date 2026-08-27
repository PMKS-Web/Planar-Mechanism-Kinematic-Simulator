// Verifies that playback is driven by simulation time rather than by a fixed
// number of samples per frame: a revolution takes 60/RPM real seconds, doubling
// the input speed halves it, and the time readout stays consistent with the pose
// when the input speed changes mid-cycle.
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = path.resolve('artifacts/screenshots');
await fs.mkdir(screenshotDir, { recursive: true });

const baseUrl = process.env.PMKS_BASE_URL || process.env.PMKS_URL || 'http://127.0.0.1:4200/';
const runPrefix = process.env.RUN_PREFIX || 'playback-timing';
const chromePath =
  process.env.PMKS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const fourBar =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const issues = [];
const checks = [];
const check = (name, ok, details = {}) => {
  checks.push({ name, ok, ...details });
  if (!ok) issues.push({ name, severity: 'high', ...details });
};

const context = await chromium.launchPersistentContext(`/tmp/pmks-playback-${Date.now()}`, {
  executablePath: chromePath,
  headless: !process.env.PMKS_HEADED,
  viewport: { width: 1440, height: 900 },
  args: ['--no-first-run', '--no-default-browser-check', '--disable-crash-reporter'],
});
const page = context.pages()[0] || (await context.newPage());
page.setDefaultTimeout(15000);
page.on('pageerror', (error) =>
  issues.push({ name: 'Uncaught page error', severity: 'high', error: error.message })
);
import { waitForReady } from './app-ready.mjs';
page.on('console', (msg) => {
  if (msg.type() === 'error' && !/favicon|google-analytics/i.test(msg.text())) {
    issues.push({ name: `Console error: ${msg.text().slice(0, 160)}`, severity: 'medium' });
  }
});

const shot = (name) =>
  page.screenshot({ path: path.join(screenshotDir, `${runPrefix}-${name}`), fullPage: false });

const tab = (label) => page.locator('.tabButton', { hasText: label });
const timeField = () => page.locator('#playbackTime');
const timeSeconds = async () => parseFloat((await timeField().innerText()).replace(/[^\d.-]/g, ''));

const speedField = () => page.locator('input-block:has-text("Input Speed") input').first();

/**
 * Where the joints actually are, in model units.
 *
 * Not the SVG markup. That carries the pan/zoom transform, and a fitted view
 * refits itself -- with an animation -- whenever the mode panel changes width,
 * which is exactly what switching modes does. Two snapshots taken either side
 * of a switch then differ by whichever frame of that animation they caught: a
 * difference about where the camera was, reported as the mechanism having
 * moved. Settled, the zoom comes back to the same number; sampled a moment too
 * early, it is 5% out.
 *
 * The claim these checks make is about the pose, so they read the pose, which
 * no camera animation touches.
 */
const pose = () =>
  page.evaluate(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.joints.map((joint) => `${joint.id}:${joint.x.toFixed(6)},${joint.y.toFixed(6)}`)
      .join(' ')
  );

/**
 * Drag the handle to a place along the input's travel.
 *
 * The transport is a position now, not a clock: there is no time to type into,
 * and the handle is how a reader moves the machine.
 */
const seekAlong = async (fraction) => {
  await page.locator('#slider').evaluate((el, value) => {
    el.value = String(Math.round(value * 1000));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, fraction);
  await page.waitForTimeout(400);
};

// The transport only exists in the analysis modes, so its presence is how we
// tell whether Kinematic is already open -- pressing the mode again is harmless
// but the wait below would otherwise race the panel animation.
async function openKinematic() {
  if (
    !(await page
      .locator('.playButton')
      .isVisible()
      .catch(() => false))
  ) {
    await tab('Kinematic').click();
  }
  await page.locator('.playButton').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
}

// Input speed now belongs to the input joint, so it lives in the Edit panel's
// Input Settings section rather than the global Settings panel.
async function openInputSettings() {
  if (
    !(await speedField()
      .isVisible()
      .catch(() => false))
  ) {
    if (
      !(await page
        .locator('app-edit-panel')
        .isVisible()
        .catch(() => false))
    ) {
      await tab('Edit').click();
      await page.waitForTimeout(600);
    }
    // Selecting the input joint is what reveals its Input Settings.
    await page
      .locator('svg circle')
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(700);
  }
  await speedField().waitFor({ state: 'visible' });
}

async function setInputSpeed(rpm) {
  await openInputSettings();
  const speed = speedField();
  await speed.scrollIntoViewIfNeeded();
  await speed.click();
  await speed.press('ControlOrMeta+A');
  // The unit comes from the picker beside the field, so the value is a bare number.
  await speed.fill(`${rpm}`);
  await speed.press('Enter');
  await page.waitForTimeout(700);
}

/** Play until the time readout wraps back toward zero; return real elapsed seconds. */
async function measureRevolution() {
  await openKinematic();
  await page.locator('.playButton').click();

  const started = Date.now();
  let previous = 0;
  let wrapped = false;
  while (Date.now() - started < 20000) {
    const now = await timeSeconds();
    if (Number.isFinite(now)) {
      if (now + 0.05 < previous) {
        wrapped = true;
        break;
      }
      previous = now;
    }
    await page.waitForTimeout(50);
  }
  const elapsed = (Date.now() - started) / 1000;
  await page.locator('.playButton').click();
  await page.waitForTimeout(200);
  return { elapsed, wrapped, lastTime: previous };
}

try {
  await page.goto(`${baseUrl}?${fourBar}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForReady(page);

  // --- Wall-clock revolution time --------------------------------------------
  await setInputSpeed(20); // 3 s per revolution
  const slow = await measureRevolution();
  check(
    '20 RPM completes a revolution in about 3 s of real time',
    slow.wrapped && Math.abs(slow.elapsed - 3) < 1.2,
    {
      elapsed: slow.elapsed,
      wrapped: slow.wrapped,
    }
  );
  await shot('01-after-20rpm.png');

  await setInputSpeed(40); // 1.5 s per revolution
  const fast = await measureRevolution();
  check(
    '40 RPM completes a revolution in about 1.5 s of real time',
    fast.wrapped && Math.abs(fast.elapsed - 1.5) < 0.9,
    {
      elapsed: fast.elapsed,
      wrapped: fast.wrapped,
    }
  );

  check(
    'doubling the input speed roughly halves the on-screen revolution time',
    slow.wrapped && fast.wrapped && slow.elapsed / fast.elapsed > 1.5,
    { ratio: slow.elapsed / fast.elapsed, slow: slow.elapsed, fast: fast.elapsed }
  );

  // --- Cycle length reported by the time field --------------------------------
  await setInputSpeed(20);
  await openKinematic();
  // Half way along the track is half a turn of the crank, which at 20 RPM is a
  // second and a half. The far right end is not measured from: the track is a
  // loop for a crank that goes all the way round, so its right edge is its left
  // edge.
  await seekAlong(0.5);
  const maxAt20 = await timeSeconds();
  check('half the track is half a turn, which is 1.5 s at 20 RPM', Math.abs(maxAt20 - 1.5) < 0.05, {
    maxAt20,
  });

  await setInputSpeed(40);
  await openKinematic();
  await seekAlong(0.5);
  const maxAt40 = await timeSeconds();
  check('and takes half as long at double the input speed', Math.abs(maxAt40 - 0.75) < 0.05, {
    maxAt40,
  });
  await shot('02-period-at-40rpm.png');

  // --- Leaving Kinematic rewinds, and time zero survives the round trip -------
  // Input speed lives with the input joint now, so changing it means entering Edit
  // mode, which deliberately rewinds to t = 0 (it replaced the stop button). The
  // model-level "hold the time across a rebuild" guarantee is covered by the unit
  // suite; what matters here is that the round trip cannot move the start pose.
  await setInputSpeed(20);
  await openKinematic();
  const zeroPose = await pose();

  await seekAlong(0.5);
  const seekedTime = await timeSeconds();
  const seekedPose = await pose();

  check(
    'seeking to a non-zero time moves the mechanism',
    seekedTime > 1 && seekedPose !== zeroPose,
    {
      seekedTime,
    }
  );

  // Round trip through Edit at a non-zero time, twice, then come back to t = 0.
  await setInputSpeed(40);
  await openKinematic();
  await setInputSpeed(20);
  await openKinematic();
  const rewoundTime = await timeSeconds();
  const rewoundPose = await pose();

  check('leaving Kinematic rewinds to time zero', Math.abs(rewoundTime) < 0.02, { rewoundTime });
  check(
    'time zero still means the same pose after switching modes at a non-zero time',
    rewoundPose === zeroPose
  );
  await shot('03-held-time.png');
} catch (error) {
  issues.push({ name: 'Run failed', severity: 'high', error: error?.stack || String(error) });
} finally {
  await fs.writeFile(
    path.join(screenshotDir, `${runPrefix}-report.json`),
    JSON.stringify({ baseUrl, checks, issues }, null, 2)
  );
  await context.close().catch(() => {});
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
console.log(JSON.stringify({ passed: checks.length - failed.length, failed, issues }, null, 2));
process.exit(failed.length ? 1 : 0);
