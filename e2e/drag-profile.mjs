/**
 * Where a drag's time goes.
 *
 * Attaches the DevTools CPU profiler and tracer to one scenario's drag and
 * prints, per second of dragging: the trace's split between script, style and
 * layout, paint and idle; the profile's self time by part of the app and by
 * function; inclusive time for the stages that matter (the position sweep, the
 * link-geometry copies inside it, the graphs' kinematic re-solve, the chart
 * redraw); and who called the layout-forcing DOM natives. Against the dev
 * server it also counts how often each stage ran per pointer move.
 *
 *   node e2e/drag-profile.mjs kin-3rows
 *   node e2e/drag-profile.mjs                  # lists the scenario ids
 *   PMKS_BASE_URL=http://localhost:4377 node e2e/drag-profile.mjs jansen-3rows
 *
 * A production build gives truer numbers (no second change-detection pass) but
 * mangles function names; build one with `--source-map` and serve `dist`
 * statically to keep the file attribution. The first drag on a fresh page runs
 * 15 to 25% slower than the next, so the profiled drag is the second one.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import {
  SCENARIOS,
  STEPS,
  armCounters,
  dragTarget,
  launch,
  loadScenario,
  plainDrag,
  profiledDrag,
  readCounters,
  resetCounters,
} from './drag-perf-harness.mjs';

const id = process.argv[2];
const scenario = SCENARIOS.find((sc) => sc.id === id);
if (!scenario) {
  console.log(
    'Pick a scenario:\n' + SCENARIOS.map((sc) => `  ${sc.id.padEnd(18)} ${sc.name}`).join('\n')
  );
  process.exit(id ? 1 : 0);
}
const OUT = 'artifacts/drag-perf';
mkdirSync(OUT, { recursive: true });

const { browser, page, cdp } = await launch();
const setup = await loadScenario(page, scenario);
await plainDrag(page, await dragTarget(page, scenario), 1);
const counting = await armCounters(page);
await resetCounters(page);
const r = await profiledDrag(page, cdp, await dragTarget(page, scenario), -1);
const counts = counting ? await readCounters(page) : null;
await browser.close();

const line = (label, pairs) =>
  console.log(
    `\n${label}\n` + pairs.map(([k, v]) => `  ${String(v).padStart(7)} ms  ${k}`).join('\n')
  );

console.log(`${scenario.name}  [charts=${setup.charts}]`);
console.log(
  `${STEPS} pointer moves in ${r.movesMs} ms (${r.msPerMove.toFixed(0)} ms/move, protocol round trip included) · frame median ${r.frames.medianMs} p90 ${r.frames.p90Ms} worst ${r.frames.worstMs} ms · frames over 50 ms: ${r.frames.over50ms}/${r.frames.count}`
);
if (r.trace) {
  console.log('\nmain thread, per second of drag (ms):', JSON.stringify(r.trace.perSecond));
  console.log('  top trace events:', r.trace.topEvents.map(([k, v]) => `${k} ${v}`).join(' · '));
}
line('self time by part of the app (ms over the drag)', r.prof.buckets);
line('top functions by self time', r.prof.self.slice(0, 16));
const stages =
  /^(mouseMove|updateMechanism|findFullMovementPos|copyVisualGeometryFrom|transformRigidPath|determineAnalysis|determineChart|solve|determineKinematics|renderOrUpdate|updateOptions|applySeriesVisibility|getJointPath|dragArcs|fitLabels|getForceAnalysis) — /;
line(
  'inclusive time of the stages',
  r.prof.total.filter(([k]) => stages.test(k))
);
console.log('\nwho called the layout-forcing natives:');
for (const [k, v] of Object.entries(r.prof.callers)) console.log(`  ${k}: ${v.join(' · ')}`);
if (counts) {
  console.log(`\nper pointer move (dev build counters, ${STEPS} moves):`);
  for (const [k, v] of Object.entries(counts).sort()) {
    if (/ ms$/.test(k)) continue;
    const ms = counts[k + ' ms'];
    console.log(
      `  ${(v / STEPS).toFixed(1).padStart(8)} ×  ${k}${ms !== undefined ? `   (${(ms / STEPS).toFixed(1)} ms per move)` : ''}`
    );
  }
} else {
  console.log('\n(counters need the dev build: window.ng is not exposed here)');
}
writeFileSync(
  `${OUT}/profile-${scenario.id}.json`,
  JSON.stringify({ scenario, setup, ...r, counts }, null, 1)
);
console.log(`\nfull report: ${OUT}/profile-${scenario.id}.json`);
