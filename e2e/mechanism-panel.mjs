/**
 * The machines on the grid, with nothing selected: every one in a list, or one
 * in detail, and one pick shared by the panel, the grid and the setup drawer.
 *
 * - A background click shows "All mechanisms", a row per machine with its chip
 *   and the family PMKS+ recognized; a lone machine shows in detail at once.
 * - A link's job and size share its row, the size wrapping under it only
 *   where they do not fit: a plate's three sides at Edit's width.
 * - Pointing at a row lights its machine; picking it shows its detail, fades
 *   the others, and folds the setup drawer to its section. "All mechanisms"
 *   goes back.
 * - The drawer's machine names pick the same way, in either mode.
 * - Entering Kinematic Analysis with a machine that cannot run opens the
 *   drawer; with every machine ready it does not.
 * - A part link in the drawer goes to Edit and leaves the drawer open.
 * - A machine is renamed in Edit, one undo, and the name rides the URL.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/mechanism-panel.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { readFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

/** A gallery drawing's query, as docs/fixture-urls.md publishes it. */
const galleryQuery = (name) => {
  const row = readFileSync('docs/fixture-urls.md', 'utf8')
    .split('\n')
    .find((line) => line.startsWith(`| [${name}](`));
  return row.match(/\(https:\/\/[^)?]+\?([^)]*)\)/)[1];
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
await page.addInitScript(() => {
  localStorage.setItem('whatsNewSeen', '2026.09');
  localStorage.setItem('tutorialSeen', '1');
});
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

const tab = (name) => page.locator('.tabButton', { hasText: name });
const panelText = () =>
  page
    .locator('app-mechanism-panel')
    .innerText()
    .catch(() => '');
const drawerText = () =>
  page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
const drawerOpen = () => page.evaluate(() => !!document.querySelector('app-analysis-setup'));

/** Which joints and links draw faded, and how many there are. */
const muted = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      links: srv.links.filter((link) => srv.getLinkCSSClass(link).includes('link-muted')).length,
      total: srv.links.length,
    };
  });

async function open(query) {
  await page.goto(`${BASE}/?${query}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(500);
}

// --- a lone machine is shown at once ----------------------------------------
await open(payloads['4-Bar']);
let text = await panelText();
record(
  'a lone machine shows in detail, with nothing to go back to',
  text.includes('Edit Mechanism 1') && !text.includes('All mechanisms'),
  text
);
// Building, the panel is about what an edit changes: how free the machine is
// and how long its links are. How it moves is the analysis modes' business.
record(
  'Edit says how free it is and how long its links are',
  text.includes('Degrees of freedom') && /\d+\.\d+ cm/.test(text),
  text
);
record(
  'but not its family or its cycle',
  !text.includes('Crank-rocker four-bar') && !text.includes('Cycle time'),
  text
);
const gutter = await page.evaluate(() => {
  const left = (selector) =>
    Math.round(
      document.querySelector(`app-mechanism-panel ${selector}`).getBoundingClientRect().left
    );
  return { title: left('.editModeRow'), section: left('.sectionHeader span') };
});
record(
  'the title lines up with the sections under it, not indented twice',
  Math.abs(gutter.title - gutter.section) <= 1,
  gutter
);

// --- a link's job and size share its row when they fit ----------------------
/** Per link row: does the size sit on the job's line? */
const linkRowsOnOneLine = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('app-mechanism-panel .linkRest')].map((row) => {
      const job = row.querySelector('.linkRole').getBoundingClientRect();
      const size = row.querySelector('.linkLength');
      return {
        size: size.innerText,
        oneLine: Math.abs(job.top - size.getBoundingClientRect().top) < 4,
      };
    })
  );
await open(payloads['Watt_I']);
let rows = await linkRowsOnOneLine();
record(
  "in Edit's width a bar's length stays on its row, and only a plate's sides may wrap",
  rows.length > 0 && rows.every((row) => row.oneLine || row.size.includes('·')),
  rows
);
await tab('Kinematic').click();
await page.waitForTimeout(600);
rows = await linkRowsOnOneLine();
record(
  "in the analysis panel's width every link, plates too, is one line",
  rows.length > 0 && rows.every((row) => row.oneLine),
  rows
);
await tab('Edit').click();

// --- several: the list, then one --------------------------------------------
await open(payloads['Straight_Line_Pair']);
text = await panelText();
record(
  'several machines list every one, with how free each is',
  text.includes('All mechanisms') && text.includes('1 degree of freedom'),
  text
);
record('and nothing is faded before one is picked', (await muted()).links === 0, await muted());

await page.locator('.machineRow').nth(1).hover();
await page.waitForTimeout(200);
const lit = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return srv.hoveredMechanismIndex;
});
record('pointing at a row lights its machine', lit === 1, lit);

await page.locator('.machineRow').nth(1).click();
await page.waitForTimeout(400);
text = await panelText();
record(
  'picking a row shows that machine',
  text.includes('Edit Mechanism 2') && text.includes('All mechanisms'),
  text
);
const faded = await muted();
record(
  'and fades the other machine, not the picked one',
  faded.links > 0 && faded.links < faded.total,
  faded
);

await page.locator('.backLink').click();
await page.waitForTimeout(300);
record('"All mechanisms" goes back to the list', (await panelText()).includes('All mechanisms'));
record('and the grid is whole again', (await muted()).links === 0, await muted());

// --- a background click is the list, in an analysis mode too ------------------
await tab('Kinematic').click();
await page.waitForTimeout(800);
record('every machine ready: arriving opens no drawer', !(await drawerOpen()), await drawerText());
await page.mouse.click(760, 480);
await page.waitForTimeout(300);
text = await panelText();
record(
  'the analysis panel lists the machines too, each with its family',
  text.includes('All mechanisms') &&
    text.includes('Chebyshev straight-line linkage') &&
    text.includes('Peaucellier-Lipkin straight-line linkage'),
  text
);
record(
  'and says a joint or link opens its graphs straight from the list',
  text.includes('for its position, velocity and acceleration graphs'),
  text
);
await page.locator('.machineRow').nth(0).click();
await page.waitForTimeout(300);
text = await panelText();
record(
  'a machine picked in an analysis mode shows its family and its cycle',
  text.includes('Chebyshev straight-line linkage') && text.includes('Cycle time'),
  text
);

// --- one blocked: arriving opens the list, and one pick drives both ---------
await open(galleryQuery('Four-bar with its coupler missing'));
await tab('Kinematic').click();
await page.waitForTimeout(900);
text = await drawerText();
record(
  'a machine that cannot run opens the setup drawer on arrival',
  (await drawerOpen()) && text.includes("Link CD isn't joined to link AB"),
  text
);

await page.locator('app-analysis-setup .mechLink').nth(0).click();
await page.waitForTimeout(400);
record(
  "the drawer's machine name picks it in the panel",
  (await panelText()).includes('Mechanism 1'),
  await panelText()
);
text = await drawerText();
record(
  'and the drawer folds to that machine, the other section closed',
  !text.includes("Link CD isn't joined") &&
    (await page.locator('app-analysis-setup .sectionHeader.picked').count()) === 1,
  text
);
await page.locator('app-analysis-setup .mechLink').nth(1).click();
await page.waitForTimeout(400);
record(
  'picking the other opens its section',
  (await drawerText()).includes("Link CD isn't joined") &&
    (await panelText()).includes('Mechanism 2'),
  await drawerText()
);

// --- a part link goes to Edit, and the drawer stays -------------------------
await page.locator('app-analysis-setup part-link button').first().click();
await page.waitForTimeout(600);
const where = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-new-grid')).tabService.getCurrentTab()
);
record(
  'a part link takes the reader to Edit with the setup drawer still open',
  where === 1 && (await drawerOpen()),
  { where, open: await drawerOpen() }
);

// --- a machine is renamed in Edit, and the URL keeps it ---------------------
await open(payloads['Straight_Line_Pair']);
await page.locator('.machineRow').nth(0).click();
await page.waitForTimeout(300);
await page
  .locator('app-mechanism-panel editable-title-block button', { hasText: 'Rename' })
  .click();
await page.locator('#title-input-box').fill('Straight arm');
await page.locator('#title-input-box').press('Enter');
await page.waitForTimeout(500);
record('rename names the machine', (await panelText()).includes('Edit Straight arm'));
await page.locator('.backLink').click();
await page.waitForTimeout(300);
text = await panelText();
record(
  'the list says the name, with no code beside it',
  /Straight arm\s+1 degree of freedom/.test(text) && !/\bM1\b/.test(text),
  text
);
const named = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
);
record('the name rides the URL', named.includes(',Straight arm'), named);
await page.evaluate(() => ng.getComponent(document.querySelector('app-top-bar')).undo());
await page.waitForTimeout(500);
text = await panelText();
record('one undo takes the name back', !text.includes('Straight arm'), text);
await open(named);
record('and a reload keeps it', (await panelText()).includes('Straight arm'), await panelText());

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
