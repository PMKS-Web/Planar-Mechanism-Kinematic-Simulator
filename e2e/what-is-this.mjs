/**
 * "What Is This?", the machine panel's note, with the model stubbed.
 *
 * The function at /api/what-is-this is answered here, so the suite never
 * spends a Gemini request and runs where no key is set. What it checks is the
 * app's side: the request is a PMKS+ sheet and a PNG, taking the picture
 * leaves the reader's view as it was, the note's part names are part links,
 * the Links rows carry the jobs, and the note's states -- written, out of date
 * after an edit and current again after Undo, failed, busy -- say what they
 * should.
 *
 *   PMKS_BASE_URL=<origin> node e2e/what-is-this.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

// The library's notes would answer before the model is asked; this suite is
// about asking.
await page.route('**/assets/what-is-this/library-notes.json', (route) =>
  route.fulfill({ json: { version: 'none', notes: {} } })
);
const asked = [];
let answer = () => ({ status: 200, json: { reply: REPLY } });
await page.route('**/api/what-is-this', async (route) => {
  asked.push(JSON.parse(route.request().postData() ?? '{}'));
  const { status, json, headers } = answer();
  await route.fulfill({ status, json, headers });
});

const REPLY = {
  plainEnglish:
    'The input **link AB** turns full circles and drives **link CDE**, a bell crank, which rocks **link FG**.',
  resembles: 'a bell-crank relay',
  useCases: [{ use: 'Brake linkages', why: 'They turn a push through an angle.' }],
  terms: [{ term: 'bell crank', meaning: 'a lever whose two arms meet at an angle.' }],
};

const note = page.locator('app-what-is-this-note');
const view = () =>
  page.evaluate(() => {
    const g = window.ng.getComponent(document.querySelector('app-new-grid'));
    const pz = g.svgGrid.panZoomObject;
    return {
      zoom: pz.getZoom(),
      pan: pz.getPan(),
      style: g.settings.drawingStyle.value,
      com: g.settings.isShowCOM.value,
      step: g.mechanismSrv.mechanismTimeStep,
    };
  });
const selectMachine = (index) =>
  page.evaluate((index) => {
    const g = window.ng.getComponent(document.querySelector('app-new-grid'));
    g.activeObjService.selectMechanism(index);
    window.ng.applyChanges(g);
  }, index);

await page.goto(`${BASE}/?${payloads['Bell_Crank']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.tabButton', { hasText: 'Kinematic' }).first().click();
await page.waitForTimeout(500);
const before = await view();
await selectMachine(0);
await note.locator('.noteParagraph').waitFor({ timeout: 20000 });

// --- the request, and the reader's view around the picture -----------------
const [request] = asked;
record('one request for one machine', asked.length === 1, asked.length);
record(
  'it sends a PMKS+ sheet and a PNG, never a prompt',
  request?.sheet?.startsWith('Facts PMKS+ computed') &&
    /^iVBORw0KGgo/.test(request?.picture ?? '') &&
    Object.keys(request ?? {})
      .sort()
      .join() === 'picture,sheet',
  Object.keys(request ?? {})
);
const after = await view();
// The zoom goes back through the library's relative scale, which rounds in
// the ninth figure; nothing a reader could see.
const same = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(a), Math.abs(b), 1e-12);
record(
  'taking the picture leaves the view, style and pose as they were',
  same(before.zoom, after.zoom) &&
    same(before.pan.x, after.pan.x) &&
    same(before.pan.y, after.pan.y) &&
    before.style === after.style &&
    before.com === after.com &&
    before.step === after.step,
  { before, after }
);

// --- what the panel shows ---------------------------------------------------
const panel = page.locator('app-mechanism-panel');
const rows = await panel.locator('.linkRow').allInnerTexts();
record(
  'the Links rows carry each link’s job',
  rows.some((row) => /CDE\s+Bell crank/.test(row)) &&
    rows.some((row) => /AB\s+Input crank/.test(row)),
  rows
);
record(
  'the Overview names the family',
  /Family\s+Watt six-bar/.test(await panel.locator('.factGrid').innerText()),
  await panel.locator('.factGrid').innerText()
);
const links = await note.locator('.noteParagraph part-link').allInnerTexts();
record(
  'every part the note names is a part link',
  links.join() === 'link AB,link CDE,link FG',
  links
);
await note.locator('.noteParagraph part-link button', { hasText: 'link CDE' }).hover();
const lit = await page.evaluate(
  () =>
    window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.linkedPart?.id ??
    null
);
record('pointing at one lights it on the grid', lit === 'CDE', lit);
await page.mouse.move(900, 800);
record(
  'no "Looks like" or uses when nothing says what it is for',
  (await note.locator('.looksLike').count()) === 0 && (await note.locator('.noteUse').count()) === 0
);
const term = note.locator('.noteTerm');
record(
  'a term the note explains is marked where the paragraph uses it',
  (await term.allInnerTexts()).join() === 'bell crank',
  await term.allInnerTexts()
);
record(
  'its meaning is not on show until pointed at',
  !(await note.locator('.termMeaning').isVisible())
);
await term.first().hover();
const meaning = await note.locator('.termMeaning').innerText();
record(
  'pointing at it shows the meaning under the paragraph',
  /Bell crank\s+— a lever whose two arms meet at an angle/.test(meaning),
  meaning
);
await page.mouse.move(900, 800);

// --- out of date after an edit, current again after Undo --------------------
await page.evaluate(() => {
  const g = window.ng.getComponent(document.querySelector('app-new-grid'));
  const e = g.mechanismSrv.joints.find((joint) => joint.id === 'E');
  e.x += 20;
  e.y += 30;
  g.mechanismSrv.updateMechanism(true);
});
await selectMachine(0);
await page.waitForTimeout(400);
record(
  'after an edit the earlier note stays, faded, under a warning',
  (await note.locator('.noteChanged').count()) === 1 &&
    (await note.locator('.note.faded').count()) === 1 &&
    (await note.getByRole('button', { name: 'Write a New Note' }).count()) === 1
);
record('and nothing is asked until the reader asks', asked.length === 1, asked.length);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await selectMachine(0);
await page.waitForTimeout(400);
record(
  'Undo makes the note current again, without asking',
  (await note.locator('.noteChanged').count()) === 0 &&
    (await note.locator('.note.faded').count()) === 0 &&
    asked.length === 1,
  asked.length
);

// --- failed and busy ---------------------------------------------------------
await page.evaluate(() => {
  const g = window.ng.getComponent(document.querySelector('app-new-grid'));
  g.mechanismSrv.joints.find((joint) => joint.id === 'F').y += 25;
  g.mechanismSrv.updateMechanism(true);
});
await selectMachine(0);
answer = () => ({ status: 502, json: { failed: true } });
await note.getByRole('button', { name: 'Write a New Note' }).click();
await note.getByRole('button', { name: 'Try Again' }).waitFor({ timeout: 20000 });
record(
  'a failure says so and offers Try Again',
  /could not be written/.test(await note.innerText()),
  await note.innerText()
);
answer = () => ({ status: 429, json: { busy: true }, headers: { 'retry-after': '2' } });
await note.getByRole('button', { name: 'Try Again' }).click();
await note.getByText(/Too many notes/).waitFor({ timeout: 20000 });
const grayed = await note.locator('button-block button').isDisabled();
await page.waitForTimeout(2600);
const back = !(await note.locator('button-block button').isDisabled());
record('busy grays Try Again until the wait is over', grayed && back, { grayed, back });
answer = () => ({ status: 200, json: { reply: REPLY } });
await note.getByRole('button', { name: 'Try Again' }).click();
await note.locator('.note:not(.faded) .noteParagraph').waitFor({ timeout: 20000 });
record('and then the note is written', true);

// --- a phone has no pointer to hover, so it gets the paragraph plain ------------
const phone = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
await phone.route('**/assets/what-is-this/library-notes.json', (route) =>
  route.fulfill({ json: { version: 'none', notes: {} } })
);
await phone.route('**/api/what-is-this', (route) =>
  route.fulfill({ status: 200, json: { reply: REPLY } })
);
await phone.goto(`${BASE}/?${payloads['Bell_Crank']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(phone);
await phone.locator('.tabButton', { hasText: 'Kinematic' }).first().click();
await phone
  .locator('app-what-is-this-note .noteParagraph')
  .waitFor({ state: 'attached', timeout: 20000 });
record(
  'on touch the note marks no terms',
  (await phone.locator('app-what-is-this-note .noteTerm').count()) === 0 &&
    (await phone.locator('app-what-is-this-note .noteParagraph part-link').count()) > 0
);
await phone.close();

record('no page errors', errors.length === 0, errors);
await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
