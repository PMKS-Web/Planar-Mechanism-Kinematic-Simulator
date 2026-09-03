/**
 * Drag performance: is dragging as smooth as it was?
 *
 * Every scenario in `drag-perf-harness.mjs` is dragged twice, once to warm the
 * JIT and once to measure, with nothing attached to the page. What is reported
 * is the app's cost per pointer move (the protocol's own round trip, measured
 * on a blank page, is subtracted) and the 90th-percentile frame during the
 * drag. Both are compared to `drag-perf-baseline.json`.
 *
 * The baseline is a number for *this machine*; a laptop on battery runs slower
 * than the one that wrote it. So the check is relative: a scenario fails when it
 * is more than the tolerance (default 35%) above its baseline on either count.
 * To re-baseline after a deliberate change, run with `--baseline`, look at the
 * diff, and commit it with the change that earned it.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/drag-perf.mjs
 *   node e2e/drag-perf.mjs --baseline            # rewrite the baseline
 *   node e2e/drag-perf.mjs edit-joint kin-3rows  # only these scenarios
 *   PMKS_PERF_TOLERANCE=1.5 node e2e/drag-perf.mjs
 *
 * The canvas takes one drag move per animation frame, so "ms per move" here
 * is the work the frames actually did spread over the moves sent; the 90th
 * percentile frame is the number a reader feels.
 *
 * Where the time goes is `drag-profile.mjs`'s job; the last full account of
 * it is in docs/tips-and-tricks.md under "Where a drag's time goes".
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import {
  SCENARIOS,
  STEPS,
  dragTarget,
  harnessFloor,
  launch,
  loadScenario,
  plainDrag,
} from './drag-perf-harness.mjs';

const BASELINE_PATH = new URL('./drag-perf-baseline.json', import.meta.url);
const OUT = 'artifacts/drag-perf';
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const writeBaseline = args.includes('--baseline');
const only = args.filter((a) => !a.startsWith('--'));
const tolerance = Number(process.env.PMKS_PERF_TOLERANCE ?? 1.35);

let baseline = { scenarios: {} };
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  if (!writeBaseline) {
    console.error('No baseline yet; run with --baseline first.');
    process.exit(2);
  }
}

const { browser, page } = await launch();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));

const floor = await harnessFloor(page);
console.log(`harness floor: ${floor.toFixed(1)} ms per pointer move (subtracted below)\n`);
// The blank page the floor is measured on has no storage; the app's own errors start here.
errors.length = 0;

const results = [];
const measured = {};
for (const sc of SCENARIOS) {
  if (only.length && !only.includes(sc.id)) continue;
  try {
    const setup = await loadScenario(page, sc);
    if (sc.rows && setup.charts < 1) throw new Error('no chart was drawn');
    await plainDrag(page, await dragTarget(page, sc), 1);
    const run = await plainDrag(page, await dragTarget(page, sc), -1);
    const appMs = Math.max(0, run.msPerMove - floor);
    const p90 = run.frames.p90Ms;
    measured[sc.id] = { appMsPerMove: Math.round(appMs * 10) / 10, frameP90Ms: p90 };
    const was = baseline.scenarios[sc.id];
    let ok = true;
    let verdict = 'no baseline';
    if (was) {
      const overMs = appMs > was.appMsPerMove * tolerance + 2;
      const overP90 = p90 > was.frameP90Ms * tolerance + 4;
      ok = !overMs && !overP90;
      verdict = ok
        ? `within ${Math.round((tolerance - 1) * 100)}% of ${was.appMsPerMove} ms / p90 ${was.frameP90Ms}`
        : `REGRESSED from ${was.appMsPerMove} ms / p90 ${was.frameP90Ms}`;
    }
    results.push([sc.id, ok]);
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${sc.id.padEnd(18)} ${String(appMs.toFixed(0)).padStart(4)} ms/move · frame p90 ${String(p90).padStart(3)} ms · >50 ms ${run.frames.over50ms}/${run.frames.count} · charts ${setup.charts}${sc.traces ? ' · traced ' + setup.traced : ''}  — ${verdict}`
    );
  } catch (error) {
    results.push([sc.id, false]);
    console.log(`FAIL  ${sc.id.padEnd(18)} could not run — ${String(error.message).slice(0, 160)}`);
  }
}

await browser.close();

writeFileSync(
  `${OUT}/report.json`,
  JSON.stringify(
    { at: new Date().toISOString(), floorMs: floor, steps: STEPS, measured, errors },
    null,
    2
  )
);
if (writeBaseline) {
  const next = {
    note: 'Per-pointer-move cost of a drag, app time only, on the machine named. Rewrite with `node e2e/drag-perf.mjs --baseline` alongside the change that earned it.',
    machine: hostname(),
    writtenAt: new Date().toISOString().slice(0, 10),
    steps: STEPS,
    scenarios: { ...baseline.scenarios, ...measured },
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nbaseline written to ${BASELINE_PATH.pathname}`);
}
if (errors.length) console.log('page errors:', errors.slice(0, 5));

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios within budget`);
process.exit(failed.length && !writeBaseline ? 1 : 0);
