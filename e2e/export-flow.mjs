/**
 * Export Data, end to end.
 *
 * The old command wrote one CSV of whatever the analysis panel happened to be
 * showing. This drives the drawer that replaced it: parts, then columns, then
 * the file — and, because an export is only worth anything if the file is,
 * opens what comes down and reads it.
 *
 *   PMKS_BASE_URL=<origin> node e2e/export-flow.mjs
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

/** Two four-bars side by side, each with its own drive: one drawing, two clocks. */
const TWO_FOUR_BARS =
  '2P.Ay,1E8.K,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0.6E,E,2Y_,0,0.' +
  '0F,F,2Y_,GJ,0.0G,G,3Jt,Wc,0.4H,H,3aA,0,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.' +
  'YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,.' +
  'AREF,EF,0,0,2Y_,8A,555555,E,F,,.ARFG,FG,0,0,2xQ,OS,555555,F,G,,.' +
  'ARGH,GH,0,0,3S0,GJ,555555,G,H,,...N_L';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1500, height: 950 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const drawer = () => page.locator('app-export-panel');
const rowNamed = (name) => drawer().locator('.pickRow', { hasText: name }).first();

/** Press Export and hand back the file that comes down. */
async function grab(action) {
  const wait = page.waitForEvent('download', { timeout: 20000 });
  await action();
  const download = await wait;
  const path = await download.path();
  return { name: download.suggestedFilename(), path };
}

async function openDrawer() {
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
  await page.waitForTimeout(600);
}

// --- one machine, the whole flow --------------------------------------------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);

record(
  'Export Data is offered with nothing selected on the grid',
  !(await page.locator('.historyButton', { hasText: 'Export Data' }).isDisabled())
);

await openDrawer();
record('it opens a drawer rather than writing a file', (await drawer().count()) === 1);
record(
  'which lists every part of the machine, under the machine',
  (await drawer().locator('.mechHead').count()) === 1 &&
    (await drawer().locator('.pickRow').count()) === 7,
  await drawer().innerText()
);
record(
  'and refuses to go on until something is chosen',
  await page.locator('.nextButton').isDisabled()
);

await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(200);
const allOn = await drawer().locator('.box.ticked').count();
await drawer().locator('.linkButton', { hasText: 'Select none' }).click();
await page.waitForTimeout(200);
record(
  'Select all and Select none reach every row',
  allOn === 7 && (await drawer().locator('.box.ticked').count()) === 0,
  { allOn }
);

await rowNamed('Joint B').click();
await rowNamed('Link AB').click();
await page.waitForTimeout(200);
record(
  'the count and the footer follow what is ticked',
  (await drawer().locator('.count').innerText()).startsWith('2 of') &&
    (await drawer().locator('.footNote').innerText()).includes('2 parts'),
  {
    count: await drawer().locator('.count').innerText(),
    foot: await drawer().locator('.footNote').innerText(),
  }
);

await page.locator('.nextButton').click();
await page.waitForTimeout(400);
const step2 = await drawer().innerText();
record(
  'step 2 asks only about the quantities those parts have',
  step2.includes('Joint B') &&
    step2.includes('Link AB') &&
    step2.includes('Position') &&
    step2.includes('Angular velocity'),
  step2
);

await drawer().locator('.segmented button', { hasText: 'X, Y' }).click();
await page.waitForTimeout(200);
const withoutMag = await drawer().locator('.footNote').innerText();
await drawer().locator('.segmented button', { hasText: '+ magnitude' }).click();
await page.waitForTimeout(200);
const withMag = await drawer().locator('.footNote').innerText();
record('dropping the magnitude narrows the file', number(withoutMag) < number(withMag), {
  withoutMag,
  withMag,
});

await page.locator('.nextButton').click();
await page.waitForTimeout(400);
record(
  'step 3 names the file it is about to write',
  (await drawer().locator('.summaryName').innerText()).endsWith('.csv'),
  await drawer().locator('.summaryName').innerText()
);

// --- the CSV ----------------------------------------------------------------
const csv = await grab(() => page.locator('.nextButton').click());
const text = readFileSync(csv.path, 'utf8');
const lines = text.trim().split('\n');
record('the CSV comes down under the name the drawer showed', csv.name.endsWith('.csv'), csv.name);
record(
  'with one time column, a head per series, and a row per solved position',
  lines[0].startsWith('Time (s)') &&
    lines[0].includes('Position B X (cm)') &&
    lines[0].includes('Angle AB (deg)') &&
    lines.length > 100,
  { head: lines[0], rows: lines.length }
);
record(
  'and every row as wide as the head',
  lines.every((line) => splitCsv(line).length === splitCsv(lines[0]).length),
  { head: splitCsv(lines[0]).length, second: splitCsv(lines[1]).length }
);

// The one column whose right answer is known without solving anything: the
// input crank turns at the speed the drive is set to. The solver keeps angles
// in degrees and rates in radians, so a file that skipped the conversion writes
// 2.09 here under a head saying deg/s.
const speed = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.settingsService.inputSpeed.value * 6; // rpm -> deg/s
});
const rateColumn = splitCsv(lines[0]).findIndex((head) =>
  head.startsWith('Angular velocity AB (deg/s)')
);
record(
  'and an angular rate in the unit its head claims',
  rateColumn > 0 && Math.abs(Math.abs(Number(splitCsv(lines[1])[rateColumn])) - speed) < 0.5,
  { speed, column: rateColumn, value: rateColumn > 0 && splitCsv(lines[1])[rateColumn] }
);

// --- the workbook -----------------------------------------------------------
await drawer().locator('.formatRow', { hasText: 'Excel workbook' }).click();
await page.waitForTimeout(200);
const xlsx = await grab(() => page.locator('.nextButton').click());
const bytes = readFileSync(xlsx.path);
record(
  'the workbook is a real zip, named .xlsx',
  xlsx.name.endsWith('.xlsx') && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes.length > 1000,
  { name: xlsx.name, size: bytes.length }
);
record(
  'holding a worksheet part',
  bytes.includes(Buffer.from('xl/worksheets/sheet1.xml')) &&
    bytes.includes(Buffer.from('spreadsheetml'))
);

// --- graph images -----------------------------------------------------------
await drawer().locator('.formatRow', { hasText: 'Graph images' }).click();
await page.waitForTimeout(200);
await drawer().locator('.segmented button', { hasText: 'SVG' }).click();
await page.waitForTimeout(200);
const svg = await grab(() => page.locator('.nextButton').click());
const drawing = readFileSync(svg.path, 'utf8');
record(
  'a graph comes down as a drawing with a line in it',
  svg.name.endsWith('.svg') && drawing.includes('<polyline') && drawing.includes('<svg'),
  svg.name
);

// --- the report -------------------------------------------------------------
// Nothing comes down: the report is handed to the browser's own printer, so
// what is checked is the document it builds.
await page.evaluate(() => {
  window.__printed = [];
  const open = HTMLIFrameElement.prototype.__lookupGetter__('contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const win = open.call(this);
      if (win && !win.__patched) {
        win.__patched = true;
        win.print = () => window.__printed.push(win.document.documentElement.outerHTML);
      }
      return win;
    },
  });
});
await drawer().locator('.formatRow', { hasText: 'Report' }).click();
await page.waitForTimeout(200);
await page.locator('.nextButton').click();
await page.waitForTimeout(1500);
const printed = await page.evaluate(() => window.__printed?.[0] ?? '');
record(
  'the report is a paginated document: the drawing, the settings, the graphs and the table',
  printed.includes('Solved under') &&
    printed.includes('Page 1 of ') &&
    printed.includes('dataTable') &&
    (printed.match(/class="page"/g) ?? []).length > 2,
  { length: printed.length, pages: (printed.match(/class="page"/g) ?? []).length }
);
record(
  'and prints the way back to the mechanism on it',
  printed.includes('shareUrl') && printed.includes('?'),
  printed.slice(0, 200)
);

// --- a long list scrolls, and its decisions do not --------------------------
await page.goto(`${BASE}/?${TWO_FOUR_BARS}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
await page.waitForTimeout(700);
await openDrawer();

record(
  'two machines in the drawing get a section each',
  (await drawer().locator('.mechHead').count()) === 2,
  await drawer().innerText()
);

// Short enough that fourteen parts do not fit, which is the case the three
// bands exist for.
await page.setViewportSize({ width: 1500, height: 620 });
await page.waitForTimeout(400);

const geometry = await drawer().evaluate((panel) => {
  const body = panel.querySelector('.exportBody');
  const head = panel.querySelector('.exportHead');
  const foot = panel.querySelector('.exportFoot');
  body.scrollTop = 120;
  return {
    scrollable: body.scrollHeight > body.clientHeight + 4,
    headBottom: head.getBoundingClientRect().bottom,
    firstStickyTop: panel.querySelector('.mechHead').getBoundingClientRect().top,
    footTop: foot.getBoundingClientRect().top,
    bodyBottom: body.getBoundingClientRect().bottom,
  };
});
record(
  'the list scrolls under a head that stays put, above a footer that does too',
  geometry.scrollable &&
    Math.abs(geometry.firstStickyTop - geometry.headBottom) < 2 &&
    Math.abs(geometry.footTop - geometry.bodyBottom) < 2,
  geometry
);
await page.waitForTimeout(300);
record(
  'and the head says so, with the shadow the panels already use',
  await drawer().evaluate((panel) => {
    const head = panel.querySelector('.exportHead');
    return getComputedStyle(head).boxShadow.includes('rgba(0, 0, 0, 0.35)');
  })
);

// One file each: two machines on two clocks cannot share a time column.
await drawer().locator('.linkButton', { hasText: 'Select all' }).click();
await page.waitForTimeout(200);
await page.locator('.nextButton').click();
await page.waitForTimeout(400);
await page.locator('.nextButton').click();
await page.waitForTimeout(400);
record(
  'two machines are written as two files, because they run on two clocks',
  (await drawer().locator('.summaryNote').first().innerText()).includes('2 files'),
  await drawer().locator('.summaryNote').first().innerText()
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);

/** The first number in a phrase like `26 columns · 361 rows`. */
function number(text) {
  return Number((text.match(/\d+/) ?? [0])[0]);
}

/** Split a CSV line, respecting the quotes a head may carry. */
function splitCsv(line) {
  return line
    .match(/("([^"]|"")*"|[^,]*)(,|$)/g)
    .slice(0, -1)
    .map((field) => field.replace(/,$/, ''));
}
