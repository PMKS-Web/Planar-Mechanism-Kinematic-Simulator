/**
 * The small things, in a browser.
 *
 * Each of these is a fix a reader reported by pointing at the screen, and each
 * is invisible to a unit test: what a cursor turns into, what colour a warning
 * is in a mode that cannot act on it, whether a panel keeps its scroll.
 *
 *   PMKS_BASE_URL=<origin> node e2e/detail-fixes.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const dev = readFileSync('src/app/component/MODALS/templates/dev-templates.ts', 'utf8');
const payloads = Object.fromEntries(
  [...(source + dev).matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [
    id,
    p.replace(/\\\\/g, '\\'),
  ])
);

/** Two joints and a bar: in no mechanism, so nothing about it can be analysed. */
const LONE_BAR =
  '2P.Zz,1E8.5,0.1011.0A,A,2UW,9v,0.0B,B,3E8,1Zn,0..YRAB,AB,Fe,Fe,2sK,sr,303e9f,A,B,,...N_P';

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
page.on('pageerror', (error) => errors.push(String(error)));

const load = async (payload) => {
  await page.goto(`${BASE}/${payload ? '?' + payload : ''}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.evaluate(() =>
    document
      .querySelectorAll('.introjs-overlay,.introjs-helperLayer,.introjs-tooltipReferenceLayer')
      .forEach((node) => node.remove())
  );
  await page.waitForTimeout(500);
};

// --- names run out of letters into more letters ----------------------------
await load(payloads['4-Bar']);
const names = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  const taken = [];
  const given = [];
  for (let i = 0; i < 60; i++) {
    const next = srv.determineNextLetter(taken);
    given.push(next);
    taken.push(next);
  }
  return given;
});
record(
  'a drawing that outgrows the alphabet keeps being given letters',
  names.every((name) => /^[A-Za-z]+$/.test(name)),
  names.filter((name) => !/^[A-Za-z]+$/.test(name)).slice(0, 6)
);
record('and never the same name twice', new Set(names).size === names.length, names);

// --- renaming is an edit, and Undo takes it back ---------------------------
await load(payloads['4-Bar']);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(600);
const renamed = await page.evaluate(() => {
  const title = ng.getComponent(document.querySelector('editable-title-block'));
  title.gotoEditMode();
  title.newIDForm.patchValue({ newID: 'Elbow' });
  title.saveNewID();
  return ng
    .getComponent(document.querySelector('app-new-grid'))
    .mechanismSrv.joints.map((joint) => joint.name);
});
record('a joint can be renamed', renamed.includes('Elbow'), renamed);
await page.waitForTimeout(700);
await page.locator('.historyButton').first().click();
await page.waitForTimeout(1000);
const afterUndo = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.map((j) => j.name)
);
record('and Undo takes the rename back', !afterUndo.includes('Elbow'), afterUndo);

// --- a long name on a bar is written along it ------------------------------
const tags = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  return grid.mechanismSrv.getLinks().map((link) => {
    const tag = grid.linkLabelStyle(link);
    return { id: link.id, name: tag.name, angle: tag.angle, joints: link.joints.length };
  });
});
record(
  'a two-letter name is written level',
  tags.every((tag) => tag.angle === 0),
  tags
);

await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const bar = grid.mechanismSrv.links.find((link) => link.joints.length === 2);
  bar.name = 'Coupler';
});
await page.waitForTimeout(400);
const named = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const bar = grid.mechanismSrv.links.find((link) => link.joints.length === 2);
  return grid.linkLabelStyle(bar);
});
record('a longer one runs along the bar', named.angle !== 0, named);
record('and never upside down', Math.abs(named.angle) <= 90, named);

// --- analysis mode: no move cursor, no red on scenery ----------------------
await load(payloads['Dev_All_Mechanism_Types']);
const inkIn = async (mode) => {
  if (mode) await page.locator('.tabButton', { hasText: mode }).click({ force: true });
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const joint = document.querySelector('#jointHolder svg[cursor="move"]');
    return {
      ink: grid.orphanMarkInk,
      cursor: joint ? getComputedStyle(joint).cursor : null,
      locked: grid.geometryLocked,
    };
  });
};
const editing = await inkIn(null);
record('a loose joint is marked in red while it can be fixed', editing.ink === '#F44336', editing);
record('and the parts say they can be dragged', editing.cursor === 'move', editing);

const analysing = await inkIn('Kinematic');
record(
  'the same mark goes grey once the mode cannot act on it',
  analysing.ink !== '#F44336',
  analysing
);
record(
  'and the cursor stops offering a drag that will not happen',
  analysing.cursor === 'pointer',
  analysing
);

// --- a drawing that cannot be analysed sends you back to Edit --------------
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
const wasAnalysing = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).tabs.isAnalysisMode()
);
// Through the same call the library and the Open dialog both make.
await page.evaluate((payload) => {
  ng.getComponent(document.querySelector('app-top-bar')).urlProcessor.updateFromURL(
    payload,
    true,
    true,
    true
  );
}, LONE_BAR);
await page.waitForTimeout(2000);
const nowEditing = await page.evaluate(() => {
  const bar = ng.getComponent(document.querySelector('app-top-bar'));
  return { analysis: bar.tabs.isAnalysisMode(), valid: bar.mechanism.oneValidMechanismExists() };
});
record(
  'opening a drawing nothing can be analysed in leaves the analysis modes',
  wasAnalysing && !nowEditing.valid && !nowEditing.analysis,
  { wasAnalysing, nowEditing }
);

// --- the legend says what the plot is drawing ------------------------------
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(700);
await page.getByText('Velocity of Joint B').first().click({ force: true });
await page.waitForTimeout(1800);
const legend = await page.evaluate(() => {
  const section = [...document.querySelectorAll('app-analysis-graph-section')].find((node) =>
    node.querySelector('.graphSection.open')
  );
  const component = ng.getComponent(section);
  const graph = component.graph;
  const lit = [...section.querySelectorAll('.previewSeries')].map(
    (node) => !node.classList.contains('off')
  );
  return {
    lit,
    drawn: ['x', 'y', 'z'].map((key) => graph.isSeriesShown(key)),
    plotted: graph.displayedSeries.length,
  };
});
record(
  'the legend and the plot agree the moment a graph opens',
  legend.lit.filter(Boolean).length === legend.plotted,
  legend
);

// --- toggling a series does not move the panel under the pointer -----------
await page.getByText('Acceleration of Joint B').first().click({ force: true });
await page.waitForTimeout(1500);
const scroller = '.panel';
await page.evaluate((selector) => {
  const node = document.querySelector(selector);
  node.scrollTop = node.scrollHeight;
}, scroller);
await page.waitForTimeout(400);
const before = await page.evaluate((s) => document.querySelector(s).scrollTop, scroller);
const lastLegend = page
  .locator('app-analysis-graph-section')
  .last()
  .locator('.previewSeries')
  .last();
await lastLegend.click({ force: true });
await page.waitForTimeout(900);
const after = await page.evaluate((s) => document.querySelector(s).scrollTop, scroller);
record('turning a line off leaves the panel where it was', Math.abs(after - before) < 12, {
  before,
  after,
});

// --- Export Data ------------------------------------------------------------
await load(payloads['4-Bar']);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(700);
record(
  'nothing selected, there is nothing to export',
  await page.locator('.historyCard button').first().isDisabled(),
  {}
);
await page.locator('#joint_B').first().click({ force: true });
await page.waitForTimeout(700);
const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.locator('.historyCard button').first().click();
const file = await download;
record('and with a joint selected it writes a file', !!file, file && file.suggestedFilename());
if (file) {
  const path = await file.path();
  const csv = readFileSync(path, 'utf8').trim().split('\n');
  record(
    'one time column and a column per series, one row per sample',
    csv[0].startsWith('Time (seconds),') && csv[0].split(',').length === 9 && csv.length > 100,
    { head: csv[0], rows: csv.length }
  );
}

// --- the transport comes and goes; the view controls do not ----------------
const controlsAt = () =>
  page.evaluate(() => {
    const box = document.querySelector('.viewControls').getBoundingClientRect();
    return {
      right: Math.round(innerWidth - box.right),
      bottom: Math.round(innerHeight - box.bottom),
    };
  });
await load(payloads['4-Bar']);
const inEdit = await controlsAt();
await page.locator('.tabButton', { hasText: 'Kinematic' }).click({ force: true });
await page.waitForTimeout(900);
const inAnalysis = await controlsAt();
record(
  'the view controls sit in the same place in both modes',
  inEdit.right === inAnalysis.right && inEdit.bottom === inAnalysis.bottom,
  { inEdit, inAnalysis }
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
