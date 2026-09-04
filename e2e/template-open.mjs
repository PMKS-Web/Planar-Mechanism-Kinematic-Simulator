/**
 * Checks how the template library opens a linkage: in place when the grid is
 * empty, and through a new-tab / replace / cancel choice dialog when the grid
 * already holds work. Replacing must be undoable.
 *
 * Run: node e2e/template-open.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
const OUT = 'artifacts/template-open';
mkdirSync(OUT, { recursive: true });
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
// This is about the library, not about onboarding. A first visit now opens the
// tutorial by itself, and its card in the drawer is not what these checks are
// looking at.
await startQuiet(context);
let newPages = 0;
context.on('page', () => newPages++);

const linkCount = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('svg path')].filter((p) =>
        (p.getAttribute('d') ?? '').startsWith('M')
      ).length
  );

// Templates moved off the file toolbar and into the project menu, so it takes
// two presses to reach now.
const openTemplates = async (page) => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.projectMenu #templatesButton').click();
  await page.waitForTimeout(600);
};

// --- Case 1: empty grid, template loads in this window -----------------------
const page = await context.newPage();
page.setDefaultTimeout(15000);
newPages = 0; // ignore the page we created ourselves
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://127.0.0.1:4200/';
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(600);
// The library opens by itself on a blank start; open it from the menu if not.
if (
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
) {
  await openTemplates(page);
}
const before = await linkCount(page);
await page.locator('#templates [data-template="4-Bar"]').click();
await page.waitForTimeout(1500);
const after = await linkCount(page);
check(
  'Empty grid: template loads in the same window',
  newPages === 0 && after > before,
  `links ${before} -> ${after}, new tabs=${newPages}`
);
check(
  'Empty grid: library closes after loading',
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
);

// --- Case 2: existing work brings up the choice dialog -----------------------
await page.goto(`${BASE}?${FOUR_BAR}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(800);
await openTemplates(page);
await page.locator('#templates [data-template="Watt_I"]').click();
await page.waitForTimeout(600);
const dialogVisible = await page
  .locator('text=already a mechanism on the grid')
  .isVisible()
  .catch(() => false);
check('Existing work: choice dialog appears', dialogVisible);

// Cancel keeps everything as it was.
await page.locator('button:has-text("Cancel")').click();
await page.waitForTimeout(400);
check(
  'Cancel keeps the library open and loads nothing',
  (await page
    .locator('#templates')
    .isVisible()
    .catch(() => false)) && newPages === 0
);

// Replace swaps the linkage in this window (Watt I has more links than the four-bar).
const beforeReplace = await linkCount(page);
await page.locator('#templates [data-template="Watt_I"]').click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Replace")').click();
await page.waitForTimeout(1500);
const afterReplace = await linkCount(page);
check(
  'Replace loads the template in this window',
  newPages === 0 && afterReplace !== beforeReplace,
  `links ${beforeReplace} -> ${afterReplace}, new tabs=${newPages}`
);

// Undo brings the old linkage back. Undo now sits in the top strip in every
// mode, so no mode switch is needed; it being enabled proves the replace saved.
const undo = page.locator('.historyButton', { hasText: 'Undo' });
check('Replace armed Undo', (await undo.isDisabled()) === false);
await undo.click();
await page.waitForTimeout(1200);
const afterUndo = await linkCount(page);
check(
  'Undo restores the replaced linkage',
  afterUndo === beforeReplace,
  `links ${afterReplace} -> ${afterUndo}`
);

// New tab path still works.
if (
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
) {
  await openTemplates(page);
}
await page.locator('#templates [data-template="4-Bar"]').click();
await page.waitForTimeout(600);
// "New Tab", not "Open in a new tab": the choice dialog's buttons were shortened
// to Cancel / New Tab / Replace, and this check went on quoting the old wording
// until the locator timed out. It is the button's own words on purpose, like
// Cancel and Replace above it.
await page.locator('button:has-text("New Tab")').click();
await page.waitForTimeout(2000);
check('New Tab spawns exactly one tab', newPages === 1, `new tabs=${newPages}`);

// --- a card that ships a picture opens on top of it -------------------------
//
// The picture is an asset rather than anything in the URL: an image is
// megabytes and a shared link is a few hundred characters. Both doors are
// checked, because they carry it differently -- opened in place it is handed
// straight over, and opened in a new tab only the card's *name* travels, in the
// fragment, since the query is the mechanism and nothing fits beside it.
const backdropNow = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const image = grid.bgImage.image();
    return image ? { src: image.src, width: Math.round(image.width) } : null;
  });

await page.goto(`${BASE}?library`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(1200);
await page.locator('#templates [data-template="Backhoe_Bucket"]').click();
await page.waitForTimeout(3000);
const opened = await backdropNow();
check(
  'a card with a backdrop opens on top of it',
  opened?.src === 'assets/backdrops/backhoe-arm.svg' && opened.width > 0,
  JSON.stringify(opened)
);

// The same payload with nothing after it, for the fragment to be measured
// against.
await page.goto(`${BASE}?${payloads['Backhoe_Bucket']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(1500);
const plainLinks = await linkCount(page);

// The address a New Tab builds, walked into directly.
await page.goto(`${BASE}?${payloads['Backhoe_Bucket']}#backdrop=Backhoe_Bucket`, {
  waitUntil: 'domcontentloaded',
});
await waitForReady(page);
await page.waitForTimeout(2500);
const inNewTab = await backdropNow();
const withFragment = await linkCount(page);
check(
  'and a new tab picks it up from the fragment',
  inNewTab?.src === 'assets/backdrops/backhoe-arm.svg',
  JSON.stringify(inNewTab)
);
// The fragment must not reach the decoder: everything after the '?' used to be
// handed over whole, so any anchor on a shared link failed its checksum and
// opened an empty grid saying the link could not be read.
check(
  'and the fragment costs the mechanism nothing',
  withFragment === plainLinks && plainLinks > 0,
  `with=${withFragment} without=${plainLinks}`
);

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
