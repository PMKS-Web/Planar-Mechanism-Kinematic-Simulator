/**
 * Random drags at random poses, judged on where the start ends up.
 *
 * A drag at a displaced pose is re-anchored: the design's sample 0 is put back
 * on the input coordinate the cycle started at, and the ghost draws that pose.
 * Whether the drag turned a crank into a rocker or back, whichever joint it
 * moved and however far, three things have to agree afterwards: the ghost's
 * crank angle, the design's sample 0, and what the transport says "from start".
 *
 * Seeded, so a finding replays: `SEED=99 node e2e/posed-drag-fuzz.mjs`, and
 * `ONLY=5,17` runs only those trials of the same sequence. This is how the
 * anchor lookup's missing slack was found -- a drag that left a crank's own
 * start "unreachable" and the ghost a third of a turn from the transport.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/posed-drag-fuzz.mjs
 */
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const playwright = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const { chromium } = playwright;
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { mkdirSync } from 'node:fs';
const OUT = 'artifacts/posed-drag-fuzz';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
const jointAt = (id) =>
  page.evaluate((wanted) => {
    for (const el of document.querySelectorAll('#jointHolder > svg')) {
      const marker = el.querySelector('[id^="joint_"]');
      if (marker?.id !== `joint_${wanted}`) continue;
      const rect = el.getBoundingClientRect();
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }
    return null;
  }, id);
const look = () =>
  page.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    const s = g.mechanismSrv;
    const m = s.mechanisms[0];
    if (!m?.isMechanismValid()) return { valid: false, failure: m?.failure };
    const A = s.joints.find((j) => j.id === 'A');
    const ang = (b) => (Math.atan2(b.y - A.y, b.x - A.x) * 180) / Math.PI;
    const ghost = s.startPoseGhosts()[0];
    const ghostB = ghost ? m.joints[ghost.at].find((j) => j.id === 'B') : null;
    const profile = s.driveProfileOf(0);
    const along = s.travelOf(0);
    const fromStart =
      profile && along !== undefined
        ? (Math.abs(along - profile.along[0]) * profile.span * 180) / Math.PI
        : null;
    const crankNow = ang(s.joints.find((j) => j.id === 'B'));
    const sample0 = ang(m.joints[0].find((j) => j.id === 'B'));
    const d = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    return {
      valid: true,
      reciprocates: m.reciprocates,
      samples: m.joints.length,
      secs: +s.secondsOf(0).toFixed(2),
      atStart: s.isAtStartPose(),
      anchor: s.anchorOf(0) ? +((s.anchorOf(0).coordinate * 180) / Math.PI).toFixed(1) : null,
      ghostAt: ghost?.at,
      ghostReachable: ghost?.reachable,
      crankAtGhost: ghostB ? +ang(ghostB).toFixed(1) : null,
      sample0: +sample0.toFixed(1),
      crankNow: +crankNow.toFixed(1),
      fromStartText: fromStart === null ? null : +fromStart.toFixed(1),
      ghostVsSample0: ghostB ? +d(ang(ghostB), sample0).toFixed(1) : null,
      nowVsSample0: +d(crankNow, sample0).toFixed(1),
      startMoved: s.startMovedOn,
    };
  });
let seed = Number(process.env.SEED ?? 7);
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const findings = [];
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean).map(Number);
for (let trial = 0; trial < 28; trial++) {
  if (ONLY.length && !ONLY.includes(trial)) {
    rnd();
    const n0 = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n0; k++) {
      rnd();
      rnd();
      rnd();
    }
    continue;
  }
  await openMechanism(page, `${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await page.getByRole('button', { name: 'Edit', exact: false }).first().click();
  await page.waitForTimeout(300);
  const frac = 0.1 + rnd() * 0.8;
  await page.evaluate((f) => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    s.seekMechanism(0, s.mechanisms[0].cyclePeriod * f);
  }, frac);
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Reset View' }).click();
  await page.waitForTimeout(400);
  const drags = [];
  const n = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const id = ['B', 'C', 'B', 'D'][Math.floor(rnd() * 4)];
    const dx = Math.round((rnd() - 0.5) * 500),
      dy = Math.round((rnd() - 0.5) * 400);
    const g = await jointAt(id);
    if (!g) break;
    await page.mouse.click(g.x, g.y);
    await page.waitForTimeout(200);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x + dx, g.y + dy, { steps: 10 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(600);
    drags.push([id, dx, dy]);
    const state = await look();
    const fold = (f) => Math.min(f % 360, 360 - (f % 360));
    const bad =
      state.valid &&
      !state.atStart &&
      state.ghostAt !== undefined &&
      (state.ghostVsSample0 > 2 ||
        (!state.reciprocates && Math.abs(fold(state.fromStartText) - state.nowVsSample0) > 3) ||
        (!state.reciprocates && state.ghostReachable === false));
    console.log(
      `trial ${trial} frac=${frac.toFixed(2)} drags=${JSON.stringify(drags)} -> ${JSON.stringify(state)}${bad ? '   <<< MISMATCH' : ''}`
    );
    if (bad) {
      findings.push({ trial, frac, drags, state });
      await page.screenshot({ path: `${OUT}/trial-${trial}-${k}.png` });
    }
    if (!state.valid) break;
  }
}
await browser.close();
console.log(
  `\n${findings.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL'}  ${28 - findings.length} trials agreed; ${findings.length} findings, ${errors.length} page errors`
);
process.exit(findings.length || errors.length ? 1 : 0);
