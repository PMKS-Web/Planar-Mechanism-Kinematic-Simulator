/**
 * The three things that can greet somebody at the door, and the cover that goes
 * up while a mechanism is being solved.
 *
 * What is being checked is which welcome a reader gets, because the rule is
 * that they get exactly one: `?library` beats everything, a returning reader
 * gets the release notes, a first-time reader gets the tutorial, and a reader
 * who has already read the notes gets neither.
 *
 * Run: node e2e/whats-new.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { QUIET_START } from './quiet-start.mjs';

const OUT = 'artifacts/whats-new';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://127.0.0.1:4200/';
const FOUR_BAR =
  '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/** A window that has never seen PMKS+, or one that carries the marks given. */
const arrive = async (marks, query = '') => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addInitScript((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, Object.entries(marks));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(1200);
  return { context, page };
};

const seen = (page, selector) =>
  page
    .locator(selector)
    .isVisible()
    .catch(() => false);

// --- Who gets which welcome -------------------------------------------------

// A first visit: a tutorial invitation, and no release notes about a version they never
// used.
{
  const { context, page } = await arrive({});
  check('First visit: no release notes', !(await seen(page, '#whatsNew')));
  check('First visit: the tutorial stays closed', !(await seen(page, '.tutorialCard')));
  check('First visit: the tutorial is offered', await seen(page, '.offer'));
  await page.screenshot({ path: `${OUT}/first-visit.png` });
  await context.close();
}

// A returning visit: the notes, and not the tutorial on top of them.
{
  const { context, page } = await arrive({ tutorialSeen: 'true' });
  check('Returning visit: the release notes open', await seen(page, '#whatsNew'));
  check('Returning visit: the tutorial stays shut', !(await seen(page, '.tutorialCard')));
  const notes = await page.locator('#whatsNew .wnNote').count();
  // Five, and exactly five: the card is the first thing a returning reader
  // meets, and more than five puts the way out below the fold.
  check('Every note is rendered, and the card stays five', notes === 5, `${notes} notes`);
  // Which is the point of five. A reader who has to scroll to find "Start
  // using it" has been handed a document rather than a welcome.
  const room = await page.evaluate(() => {
    const body = document.querySelector('#whatsNew .wnBody');
    return { need: Math.round(body.scrollHeight), have: Math.round(body.clientHeight) };
  });
  check('and it fits without scrolling on a desktop', room.need <= room.have + 1, room);
  await page.screenshot({ path: `${OUT}/whats-new.png` });

  // Closed is read, and it stays read across a reload.
  await page.locator('#whatsNew .wnGo').click();
  await page.waitForTimeout(500);
  check('Start using it closes the notes', !(await seen(page, '#whatsNew')));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(1200);
  check('Once closed, they do not come back', !(await seen(page, '#whatsNew')));
  await context.close();
}

// Closing by the backdrop counts too -- any way out is a decision.
{
  const { context, page } = await arrive({ tutorialSeen: 'true' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const stored = await page.evaluate(() => localStorage.getItem('whatsNewSeen'));
  check('Escape marks them read', stored !== null, `whatsNewSeen=${stored}`);
  // The tripwire for every other suite. They arrive carrying `QUIET_START` to
  // keep the door clear, and a raised WHATS_NEW_VERSION would otherwise put
  // this dialog silently in front of all of them.
  check(
    'quiet-start.mjs still names the version the app writes',
    stored === QUIET_START.whatsNewSeen,
    `app wrote ${stored}, e2e expects ${QUIET_START.whatsNewSeen}`
  );
  await context.close();
}

// Over a shared mechanism they still show: the layout moved for that reader too.
{
  const { context, page } = await arrive({ tutorialSeen: 'true' }, `?${FOUR_BAR}`);
  check('Shared link: the notes still show', await seen(page, '#whatsNew'));
  await context.close();
}

// --- ?library ---------------------------------------------------------------

{
  const { context, page } = await arrive({ tutorialSeen: 'true' }, '?library');
  check('?library opens the mechanism library', await seen(page, '#templates'));
  check('?library shows nothing else on top', !(await seen(page, '#whatsNew')));
  const address = await page.evaluate(() => window.location.search);
  check('?library is taken out of the address bar', address === '', `search="${address}"`);
  const failures = await page.locator('text=could not be opened').count();
  check('?library is not read as a broken mechanism', failures === 0);
  await page.screenshot({ path: `${OUT}/library-link.png` });

  // And it is a real library: opening a card from it leaves a mechanism behind.
  await page.locator('#templates [data-template="4-Bar"]').click();
  await page.waitForTimeout(2500);
  const links = await page.evaluate(
    () =>
      [...document.querySelectorAll('svg path')].filter((p) =>
        (p.getAttribute('d') ?? '').startsWith('M')
      ).length
  );
  check('A card opened from ?library loads', links > 0, `${links} link paths`);
  await context.close();
}

// A first-time reader following the same link gets the library, not the tutorial.
{
  const { context, page } = await arrive({}, '?library');
  check('?library beats the tutorial as well', await seen(page, '#templates'));
  check('?library: the tutorial stays shut', !(await seen(page, '.tutorialCard')));
  await context.close();
}

// --- The covers -------------------------------------------------------------

// The boot splash is in the HTML, so it is up before the bundle runs, and it is
// gone once the app has drawn.
{
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'commit' });
  const early = await page
    .locator('#bootSplash')
    .isVisible()
    .catch(() => false);
  check('The boot splash is up before the app is', early);
  await waitForReady(page);
  await page.waitForTimeout(1500);
  const gone = (await page.locator('#bootSplash').count()) === 0;
  check('The boot splash is removed once the app has drawn', gone);
  await context.close();
}

// Opening a template puts the cover up before it takes the thread.
{
  const { context, page } = await arrive(QUIET_START);
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.projectMenu #templatesButton').click();
  await page.waitForTimeout(600);
  // Recorded rather than polled for. On a warm build a four-bar solves in well
  // under a poll interval, so `waitFor({state:'visible'})` is a coin toss --
  // and a check that only fails sometimes is worse than no check. An observer
  // armed before the click cannot miss it: what is being asserted is that the
  // cover was in the document at all during the load, which is exactly the
  // thing that used to be impossible.
  await page.evaluate(() => {
    window.__coverSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('.loadingScrim')) window.__coverSeen = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator('#templates [data-template="Watt_I"]').click();
  await page.waitForTimeout(3000);
  check(
    'Opening a mechanism shows the loading cover',
    await page.evaluate(() => window.__coverSeen)
  );
  check(
    'The cover comes down when the mechanism is in',
    (await page.locator('.loadingScrim').count()) === 0
  );
  await page.screenshot({ path: `${OUT}/after-load.png` });
  await context.close();
}

// Opening a `.pmks` file is the other way a whole drawing is replaced, and the
// one where the cover has somewhere to get stuck: a file that will not decode
// leaves the reader on the drawing they had, and a cover left standing over it
// is a window that has stopped answering for good.
{
  const { context, page } = await arrive(QUIET_START);
  // Every appearance and disappearance, in order, so "it went up and came back
  // down" can be asserted rather than sampled at one moment.
  await page.evaluate(() => {
    window.__cover = [];
    // The last state is held in the closure rather than read back off the list,
    // so clearing the list between cases does not make the next mutation look
    // like a change from nothing.
    let last = Boolean(document.querySelector('.loadingScrim'));
    new MutationObserver(() => {
      const present = Boolean(document.querySelector('.loadingScrim'));
      if (present === last) return;
      last = present;
      window.__cover.push(present);
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  const openFile = async (name, contents) => {
    await page.evaluate(() => window.__cover.splice(0));
    await page.locator('[aria-label="Project menu"]').click();
    await page
      .locator('#projectMenu input[type=file]')
      .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(contents) });
    await page.waitForTimeout(2500);
    return page.evaluate(() => window.__cover);
  };

  const good = await openFile('four-bar.pmks', FOUR_BAR);
  check(
    'Opening a file raises the cover and puts it back down',
    good[0] === true && good.at(-1) === false,
    JSON.stringify(good)
  );
  const joints = await page.locator('[id^="joint_"]').count();
  check('The file actually loaded', joints > 0, `${joints} joints`);

  const bad = await openFile('broken.pmks', 'not-a-pmks-file');
  check(
    'A file that will not decode does not strand the cover',
    bad.at(-1) === false && (await page.locator('.loadingScrim').count()) === 0,
    JSON.stringify(bad)
  );
  check(
    'and it is reported as a failure, not a success',
    (await page.getByText(/could not be opened/i).count()) > 0 &&
      (await page.getByText('Mechanism loaded.').count()) === 0
  );

  // Dismissing the picker chooses nothing, which is not a load.
  await page.evaluate(() => window.__cover.splice(0));
  await page.locator('[aria-label="Project menu"]').click();
  await page.locator('#projectMenu input[type=file]').dispatchEvent('change');
  await page.waitForTimeout(400);
  const canceled = await page.evaluate(() => window.__cover);
  check(
    'Dismissing the file picker raises no cover',
    canceled.length === 0,
    JSON.stringify(canceled)
  );
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
