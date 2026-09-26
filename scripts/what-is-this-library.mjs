// Writes the library templates' "What is this?" notes, to ship with the app.
//
//   npm run what-is-this:dev                         # the function, with GEMINI_API_KEY set
//   npm start                                        # the app, which proxies /api to it
//   PMKS_BASE_URL=http://localhost:4200 npm run what-is-this:library
//
// A note is filed under its fact sheet's key (`model/what-is-this/note-key.ts`),
// so the one way to be sure a shipped note is found is to let the app itself
// write it: this opens every card of the library exactly as a student does,
// shows each of its machines in the panel, and keeps what the app was given.
// A note the current file already has is reused rather than asked for again,
// and a note no card leads to any more is dropped. Run it when a template or
// the prompt changes; a spec says when the file has fallen behind.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = new URL('../src/assets/what-is-this/library-notes.json', import.meta.url);
/** Between two notes the model writes: Gemini's free quotas are per minute. */
const PACE_MS = Number(process.env.PACE_MS ?? 4500);
/** The prompt the notes are written with, which the app checks the file against. */
const VERSION = /WHAT_IS_THIS_VERSION = '([^']+)'/.exec(
  readFileSync(new URL('../src/app/model/what-is-this/prompt.ts', import.meta.url), 'utf8')
)[1];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/?library`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('button[aria-label^="Open "]', { timeout: 30000 });
const cards = await page.$$eval('button[aria-label^="Open "]', (buttons) =>
  buttons.map((button) => button.getAttribute('aria-label'))
);

const notes = {};
let asked = 0;
for (const card of cards) {
  await page.goto(`${BASE}/?library`, { waitUntil: 'domcontentloaded' });
  await page.locator(`button[aria-label="${card}"]`).click();
  await page.waitForFunction(
    () =>
      window.ng?.getComponent(document.querySelector('app-new-grid'))?.mechanismSrv.joints.length,
    null,
    { timeout: 30000 }
  );
  // A card with a background image places it after the mechanism, and the
  // image's file name is part of the sheet.
  await page.waitForTimeout(1500);
  const machines = await page.evaluate(
    () =>
      window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.partitions.length
  );
  for (let index = 0; index < machines; index++) {
    const result = await noteFor(index);
    if (!result) {
      console.log(`${card} M${index + 1}: does not run, no note`);
      continue;
    }
    notes[result.key] = result.reply;
    console.log(`${card} M${index + 1}: ${result.fresh ? 'written' : 'kept'}`);
    if (result.fresh) {
      asked++;
      await page.waitForTimeout(PACE_MS);
    }
  }
}
await browser.close();

const sorted = Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({ version: VERSION, notes: sorted }, null, 2) + '\n');
console.log(`${Object.keys(sorted).length} notes, ${asked} newly written: ${OUT.pathname}`);

/** One machine's note, shown in its panel; retried while the model is busy or fails. */
async function noteFor(index) {
  await page.evaluate((index) => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.selectMechanism(index);
    window.ng.applyChanges(grid);
  }, index);
  await page.waitForSelector('app-what-is-this-note', { timeout: 10000 });
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await page.waitForFunction(
      () => {
        const note = window.ng.getComponent(document.querySelector('app-what-is-this-note'));
        const status = note?.state?.status;
        return status && status !== 'writing' && status !== 'unwritten' ? status : false;
      },
      null,
      { timeout: 60000, polling: 250 }
    );
    const status = await state.jsonValue();
    if (status === 'cannot-run') return undefined;
    if (status === 'written') {
      // A fresh browser each run, so what this one saved is what the model wrote.
      return page.evaluate((index) => {
        const note = window.ng.getComponent(document.querySelector('app-what-is-this-note'));
        const service = note.whatIsThis;
        const key = service.sheetFor(index).key;
        const saved = JSON.parse(localStorage.getItem('whatIsThisNotes') ?? '{}');
        return { key, reply: service.store.get(key), fresh: key in saved };
      }, index);
    }
    // Failed or busy: wait out the quota, then ask again.
    await page.waitForTimeout(status === 'busy' ? 30000 : 5000);
    await page.evaluate((index) => {
      const note = window.ng.getComponent(document.querySelector('app-what-is-this-note'));
      note.whatIsThis.write(index);
    }, index);
  }
  throw new Error(`No note for machine ${index + 1} after six tries`);
}
