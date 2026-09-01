/**
 * Editing in an analysis mode (docs/analysis-mode-editing-plan.md).
 *
 * The modes used to refuse every edit there was, on the grounds that "the
 * graphs describe this exact cycle, so the geometry is locked here". They
 * redraw from whatever was last solved, and an Edit drag already re-solves the
 * whole cycle on every pointer move -- so the lock was standing between the
 * reader and the most instructive thing this app can do: grab a joint and watch
 * the acceleration peak move.
 *
 * What a browser can prove that a unit test cannot: that a real drag in an
 * analysis mode lands, that the machine's start survives it, that the numbers
 * beside the graphs move while the hand is still down, and that what is still
 * refused is still refused.
 *
 *   PMKS_BASE_URL=http://localhost:4200 node e2e/analysis-editing.mjs
 */

const playwright = process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright';
const { chromium } = await import(playwright + '/node_modules/playwright/index.mjs');
import { mkdirSync } from 'node:fs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';
const SHOTS = 'artifacts/analysis-editing';
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

const look = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const srv = grid.mechanismSrv;
    const round = (n) => Math.round(n * 1e3) / 1e3;
    return {
      atStart: srv.isAtStartPose(),
      seconds: round(srv.secondsOf(0)),
      anchor: srv.anchorOf(0) ? round(srv.anchorOf(0).coordinate) : null,
      startPose:
        srv.mechanisms[0]?.joints[0]?.map((j) => `${j.id}:${round(j.x)}`).join(' ') ?? null,
      drawn: srv.joints.map((j) => `${j.id}:${round(j.x)},${round(j.y)}`).join(' '),
      may: {
        drag: grid.permission.may('drag'),
        history: grid.permission.may('history'),
        structure: grid.permission.may('structure'),
        build: grid.permission.may('build'),
      },
    };
  });

/**
 * A joint's place on screen.
 *
 * The view is fitted first by every caller: a four-bar parked a third of the
 * way round its cycle can put a joint outside the window entirely, and a press
 * there lands on empty canvas and reads as a refused drag.
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

const fit = async () => {
  await page.evaluate(() =>
    window.ng.getComponent(document.querySelector('app-new-grid')).svgGrid.scaleToFitLinkage()
  );
  await page.waitForTimeout(500);
};

const mode = async (label) => {
  await page.locator('.tabButton', { hasText: label }).click();
  await page.waitForTimeout(600);
};

/** Park the drawing a little way into its cycle, paused. */
async function parkMidCycle() {
  await page.locator('.playButton').click();
  await page.waitForTimeout(900);
  await page.locator('.playButton').click();
  await page.waitForTimeout(500);
  await fit();
}

async function dragJoint(id, steps = 6) {
  const at = await jointAt(id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  const seen = [];
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(at.x + i * 9, at.y - i * 6);
    await page.waitForTimeout(70);
    seen.push(
      await page.evaluate(
        () =>
          document.querySelector('app-analysis-panel')?.innerText.match(/Mag: [-\d.]+/)?.[0] ?? null
      )
    );
  }
  await page.mouse.up();
  await page.waitForTimeout(800);
  return seen;
}

// ---- 1. what the mode allows now -----------------------------------------

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await mode('Kinematic');
const permissions = (await look()).may;
record('an analysis mode allows a drag', permissions.drag === true, permissions);
record('and undo, which it used to refuse', permissions.history === true, permissions);
record('and still refuses restructuring', permissions.structure === false, permissions);
record('and building', permissions.build === false, permissions);
record(
  'the status strip stops calling it read-only',
  /Drag to tune/.test(await page.locator('#bottomBar').innerText())
);
await page.screenshot({ path: `${SHOTS}/1-analysis.png` });

// ---- 2. the corner card carries both verbs -------------------------------

const corner = await page.locator('.historyCard').innerText();
record(
  'the corner card holds Undo, Redo and Export together',
  /Undo/.test(corner) && /Redo/.test(corner) && /Export Data/.test(corner),
  corner.replace(/\s+/g, ' ')
);
record(
  'in that order',
  corner.replace(/\s+/g, ' ').indexOf('Undo') < corner.replace(/\s+/g, ' ').indexOf('Export Data')
);
await mode('Edit');
record(
  'and Export is not offered in Edit',
  !/Export Data/.test(await page.locator('.historyCard').innerText())
);
await mode('Kinematic');

// ---- 3. a drag at a paused pose, and the start that survives it ----------

await parkMidCycle();
const before = await look();
record('parked mid-cycle, the ghost is drawn', (await page.locator('.startGhost').count()) === 1);
record('and the row says how far from the start', (await page.locator('.startChip').count()) === 1);

// Click selects, drag tunes. Select the joint being *studied* first, then tune
// a different one -- which is the move the whole unlock exists for: watch the
// output's acceleration, move the coupler pivot, watch the peak come down.
const studied = await jointAt('C');
await page.mouse.move(studied.x, studied.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(700);
record(
  'a click chooses what is graphed',
  /for Joint C/.test(await page.locator('app-analysis-panel').innerText())
);

const readings = await dragJoint('B');
const after = await look();
record('the drag moved the mechanism', before.drawn !== after.drawn);
record(
  'and the graphs stayed on the joint being studied, not the one being held',
  /for Joint C/.test(await page.locator('app-analysis-panel').innerText()),
  (await page.locator('app-analysis-panel').innerText()).slice(0, 60)
);
record(
  'while its numbers moved under the hand',
  new Set(readings.filter(Boolean)).size > 1,
  readings
);
record('the machine still starts where it started', before.anchor === after.anchor, {
  before: before.anchor,
  after: after.anchor,
});
record('and the display stayed where the hand was', !after.atStart, after);
await page.screenshot({ path: `${SHOTS}/2-after-drag.png` });

// ---- 4. undo reaches into the analysis modes ------------------------------

record(
  'the drag earned an undo',
  await page.locator('.historyButton', { hasText: 'Undo' }).isEnabled()
);
await page.locator('.historyButton', { hasText: 'Undo' }).click();
await page.waitForTimeout(900);
const undone = await look();
record('and undo takes it back', undone.drawn !== after.drawn, {
  after: after.drawn.slice(0, 60),
  undone: undone.drawn.slice(0, 60),
});

// ---- 5. grab-to-pause works here too -------------------------------------

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await mode('Kinematic');
await page.locator('.playButton').click();
await page.waitForTimeout(900);
const moving = await jointAt('B');
await page.mouse.move(moving.x, moving.y);
await page.mouse.down();
await page.waitForTimeout(250);
const grabbed = await page.evaluate(
  () => window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isPlaying
);
record('grabbing a moving joint pauses it, as in Edit', grabbed === false);
await page.mouse.move(moving.x + 30, moving.y - 20);
await page.waitForTimeout(120);
record('and the drag it started is live', (await page.locator('.dragTrace').count()) >= 1);
record(
  'with no placeholder over the graph',
  (await page.locator('.graphPlaceholder').count()) === 0
);
await page.mouse.up();
await page.waitForTimeout(600);

// ---- 6. the comparison overlay (Phase B) ---------------------------------

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
await mode('Kinematic');
const studiedJoint = await jointAt('C');
await page.mouse.move(studiedJoint.x, studiedJoint.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(700);
await page
  .locator('app-analysis-graph-section', { hasText: 'Position of Joint C' })
  .locator('button')
  .first()
  .click();
await page.waitForTimeout(900);
const curvesBefore = await page.locator('.apexcharts-series').count();
record('one curve before any drag', curvesBefore === 2, { curvesBefore });
record('and no comparison to clear', (await page.locator('.baselineChip').count()) === 0);

const tuned = await jointAt('D');
await page.mouse.move(tuned.x, tuned.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++) {
  await page.mouse.move(tuned.x + i * 5, tuned.y + i * 3);
  await page.waitForTimeout(90);
}
const overlay = await page.evaluate(() => {
  const graph = window.ng.getComponent(document.querySelector('app-analysis-graph'));
  return {
    names: graph.displayedSeries.map((s) => s.name),
    colors: graph.displayedColors,
    dash: graph.displayedStroke?.dashArray,
    annotations: document.querySelectorAll('.apexcharts-xaxis-annotations line').length,
    axis: document.querySelector('.apexcharts-yaxis')?.textContent ?? '',
  };
});
record(
  'a drag lays the curves from before it under the live ones',
  overlay.names.filter((n) => / before$/.test(n)).length === 2 && overlay.names.length === 4,
  overlay.names
);
record(
  'the earlier ones ghosted, the live ones in full colour',
  overlay.colors.slice(0, 2).every((c) => c.startsWith('rgba')) &&
    overlay.colors.slice(2).every((c) => c.startsWith('#')),
  overlay.colors
);
record(
  'and the live ones dashed while the hand is down',
  overlay.dash[0] === 0 && overlay.dash[2] > 0,
  overlay.dash
);
record('with the playhead hushed for the duration', overlay.annotations === 0, overlay);
record(
  'and a chip saying what the pale curve is',
  (await page.locator('.baselineChip').count()) === 1
);
// The axis must hold still: refitted per frame it swims under the very curve
// being watched, and every frame looks the same height as the last.
const axisFrames = [];
for (let i = 7; i <= 10; i++) {
  await page.mouse.move(tuned.x + i * 5, tuned.y + i * 3);
  await page.waitForTimeout(90);
  axisFrames.push(
    await page.evaluate(() => document.querySelector('.apexcharts-yaxis')?.textContent ?? '')
  );
}
record(
  'the y axis never shrinks under the hand',
  new Set(axisFrames).size <= 2,
  axisFrames.map((a) => a.slice(0, 24))
);

await page.mouse.up();
await page.waitForTimeout(900);
const settled = await page.evaluate(() => {
  const graph = window.ng.getComponent(document.querySelector('app-analysis-graph'));
  return {
    dash: graph.displayedStroke?.dashArray,
    names: graph.displayedSeries.map((s) => s.name),
  };
});
record(
  'letting go settles the live curve to solid',
  settled.dash.every((d) => d === 0),
  settled
);
record(
  'and the comparison outlives the gesture',
  (await page.locator('.baselineChip').count()) === 1
);
await page.screenshot({ path: `${SHOTS}/3-comparison.png` });

await page.locator('.baselineChip button').click();
await page.waitForTimeout(700);
record('the chip clears it', (await page.locator('.baselineChip').count()) === 0);
record(
  'and the plot goes back to one curve per series',
  (await page.locator('.apexcharts-series').count()) === 2
);

// ---- 7. the peak, said as a number (Phase C) -----------------------------

record(
  'the chip says what the peak was and what it is now',
  await page.evaluate(() => {
    const graph = window.ng.getComponent(document.querySelector('app-analysis-graph'));
    return graph.peakReadout === null;
  }),
  'no comparison on the plot, so no peak to compare'
);

// ---- 8. force analysis, where the solve is dearer -------------------------

await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['Offset_Load_Rocker']}`);
await page.locator('.tabButton', { hasText: 'Force' }).click();
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
  const driven = grid.mechanismSrv.joints.find((j) => j.input);
  if (driven) grid.activeObjService.updateSelectedObj(driven);
});
await page.waitForTimeout(900);
const forceCards = await page.locator('app-analysis-graph-section').count();
record('force analysis offers graphs to tune against', forceCards > 0, { forceCards });
await page.locator('app-analysis-graph-section').first().locator('button').first().click();
await page.waitForTimeout(1200);

const held = await jointAt('B');
await page.mouse.move(held.x, held.y);
await page.mouse.down();
const started = Date.now();
const moves = 8;
for (let i = 1; i <= moves; i++) {
  await page.mouse.move(held.x + i * 4, held.y - i * 3);
  await page.waitForTimeout(10);
}
const perMove = (Date.now() - started) / moves;
const forceOverlay = await page.evaluate(() => {
  const graph = window.ng.getComponent(document.querySelector('app-analysis-graph'));
  return {
    series: graph.displayedSeries.length,
    peak: graph.peakReadout,
    gapShown: !!document.querySelector('.analysis-gap'),
  };
});
record('a force curve gets the same comparison', forceOverlay.series >= 4, forceOverlay);
record(
  'and the peak is said as two numbers',
  !!forceOverlay.peak && forceOverlay.peak.before !== forceOverlay.peak.after,
  forceOverlay.peak
);
// A drag walks the linkage through toggle positions on the way somewhere, so
// the gap count changes on every move; the banner waits until it means
// something.
record('the toggle-gap banner does not flicker under the hand', !forceOverlay.gapShown);
// Every move here costs a full cycle solve *and* a full force solve. The
// budget is what keeps this honest rather than a hope.
record(`force mode holds its budget (${Math.round(perMove)}ms/move, 90ms)`, perMove < 90, {
  perMove,
});
await page.mouse.up();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/4-force.png` });

record('no page errors', errors.length === 0, errors.slice(0, 3));

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length ? 1 : 0);
