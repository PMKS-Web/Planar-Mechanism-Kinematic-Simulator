/**
 * Suggest a Mechanism, from the library's rail to the Sent view.
 *
 * The library's side rail and its end-of-list line, the form opened from each,
 * what Send refuses and where it leaves the focus, the pasted-link states, the
 * email that goes out (with the key function and EmailJS answered here, so no
 * mail is sent), and the way back to the library as it was left.
 *
 * Run: node e2e/suggest-mechanism.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const OUT = 'artifacts/suggest-mechanism';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200/';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  const said = typeof detail === 'string' ? detail : JSON.stringify(detail);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${said ? ` — ${said}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

// Nothing leaves the machine: the key is made up and EmailJS is answered here.
let mailed = null;
let mailAnswer = 200;
await page.route('**/.netlify/functions/getEmailJSKey', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"apiKey":"e2e-key"}' })
);
await page.route('https://api.emailjs.com/**', async (route) => {
  mailed = route.request().postDataJSON();
  await new Promise((resolve) => setTimeout(resolve, 600));
  await route.fulfill({ status: mailAnswer, body: mailAnswer === 200 ? 'OK' : 'Invalid grant' });
});

const openLibrary = async () => {
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.projectMenu #templatesButton').click();
  await page.waitForTimeout(700);
};

// --- an empty grid: only a link can be sent -----------------------------------
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(600);
if (
  !(await page
    .locator('#templates')
    .isVisible()
    .catch(() => false))
)
  await openLibrary();

const rail = await page.evaluate(() => ({
  rows: document.querySelectorAll('.rail .category').length,
  placeholder: document.querySelector('.searchBox input')?.getAttribute('placeholder') ?? '',
  card: !!document.querySelector('.rail .suggestCard button'),
}));
check('the categories are a rail beside the cards', rail.rows > 5, rail);
check('the search counts what it searches', /^Search \d+ mechanisms$/.test(rail.placeholder), rail);
check('the rail ends on Suggest a Mechanism', rail.card);

await page.locator('.rail .suggestCard button').click();
await page.waitForTimeout(500);
const empty = await page.evaluate(() => ({
  chosen: document.querySelector('.sourceChoice button[aria-pressed="true"]')?.textContent?.trim(),
  reason: document.querySelector('.sourceChoice .reason')?.textContent?.trim(),
  linkField: !!document.querySelector('#suggest-link'),
}));
check(
  'on an empty grid the open mechanism is grayed, with its reason, and the link is chosen',
  empty.chosen === 'Paste a Link' &&
    /Nothing on the grid yet/.test(empty.reason ?? '') &&
    empty.linkField,
  empty
);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(
  'Escape over the form goes back to the library rather than closing it',
  await page.locator('.browseView').isVisible()
);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// --- a mechanism on the grid, suggested from the end of a section -------------
await page.goto(`${BASE}?${payloads['Pantograph']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(1200);
await openLibrary();
await page.locator('.rail .category', { hasText: 'Paths and Curves' }).click();
await page.waitForTimeout(300);
const endLine = (await page.locator('.endLine').innerText()).replace(/\s+/g, ' ');
check(
  'the last card is followed by the end of the section and a way to add to it',
  endLine.includes('That is everything in Paths and Curves.') &&
    endLine.includes('Suggest one that belongs here'),
  endLine
);
await page.locator('.endLine button').click();
await page.waitForTimeout(600);
const opened = await page.evaluate(() => ({
  section: document.querySelector('#suggest-section')?.value,
  chosen: document.querySelector('.sourceChoice button[aria-pressed="true"]')?.textContent?.trim(),
  source: document.querySelector('.source .srcName')?.textContent?.trim(),
  verdict: document
    .querySelector('.source .statusChip')
    ?.textContent?.replace('check_circle', '')
    .trim(),
  focused: document.activeElement?.id,
}));
check('it opens filed under that section', opened.section === 'paths', opened);
check(
  'and about the open mechanism, read the way its panel reads it',
  opened.chosen === 'Open Mechanism' && !!opened.source && opened.verdict === 'Runs',
  opened
);
check('the focus lands on the view’s title', opened.focused === 'suggestTitle', opened);

// --- Send refuses what is missing, and says so over the dialog ----------------
await page.locator('.suggestFooter .btnFilled').click();
await page.waitForTimeout(400);
const refused = await page.evaluate(() => {
  const toast = [...document.querySelectorAll('.notificationText')].pop();
  const box = toast?.getBoundingClientRect();
  const top = box && document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
  return {
    text: toast?.textContent?.trim(),
    visible: !!top && !!toast?.closest('.notification')?.contains(top),
    focused: document.activeElement?.id,
    titleError: document.querySelector('#suggest-title-hint')?.textContent?.trim(),
  };
});
check(
  'Send names every field to fix',
  refused.text ===
    'Three things to fix before this can send: the title, the description and the permission box.',
  refused
);
check('the message is drawn over the dialog, not behind it', refused.visible, refused);
check('the focus goes to the first of them', refused.focused === 'suggest-title', refused);
check(
  'which says what is wrong under itself',
  refused.titleError?.startsWith('Give it a title.'),
  refused
);
await page.screenshot({ path: `${OUT}/01-refused.png` });

await page.fill('#suggest-title', 'Hoeken’s Straight-Line');
await page.fill(
  '#suggest-description',
  'A crank-rocker whose coupler tip runs nearly straight, at nearly constant speed, for half of every turn.'
);
await page.fill('#suggest-credit', 'Pat Lee');
await page.fill('#suggest-email', 'pat@example.com');
await page.locator('#suggest-consent').check();
const preview = await page.evaluate(() => {
  const card = document.querySelector('.previewColumn .templateCard.live');
  return {
    name: card?.querySelector('.cardName')?.textContent?.trim(),
    credit: card?.querySelector('.credit')?.textContent?.replace('person', '').trim(),
    width: Math.round(card?.getBoundingClientRect().width ?? 0),
  };
});
check(
  'the preview is the library’s card, at its size, with the credit on it',
  preview.name === 'Hoeken’s Straight-Line' &&
    preview.credit === 'Suggested by Pat Lee' &&
    preview.width === 300,
  preview
);
await page.screenshot({ path: `${OUT}/02-filled.png` });

// --- a failed send keeps everything ---------------------------------------------
mailAnswer = 412;
await page.locator('.suggestFooter .btnFilled').click();
await page.waitForTimeout(150);
const sending = await page.evaluate(() => ({
  locked: document.querySelector('.suggestFields')?.disabled,
  label: document.querySelector('.suggestFooter .btnFilled')?.textContent?.trim(),
}));
check(
  'while it sends, the fields and both buttons are locked',
  sending.locked && /Sending/.test(sending.label),
  sending
);
await page.waitForTimeout(1200);
const failed = await page.evaluate(() => ({
  text: [...document.querySelectorAll('.notificationText')].map((one) => one.textContent.trim()),
  retry: [...document.querySelectorAll('.notification button')].some((one) =>
    /Try again/.test(one.textContent)
  ),
  title: document.querySelector('#suggest-title')?.value,
}));
check(
  'a failed send says so, keeps what was typed and offers Try again',
  failed.text.includes('The suggestion did not send. Everything you typed is still here.') &&
    failed.retry &&
    failed.title === 'Hoeken’s Straight-Line',
  failed
);

// --- and a good one goes, all of it -------------------------------------------
mailAnswer = 200;
mailed = null;
await page.locator('.suggestFooter .btnFilled').click();
await page.waitForTimeout(100);
// Leaving now would lose the answer and let the same draft go twice.
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
const held = {
  backDisabled: await page.locator('.suggestHead .iconButton').isDisabled(),
  closeDisabled: await page.locator('.suggestHead .closeButton').isDisabled(),
  stillOnForm: await page.locator('app-suggest-mechanism').isVisible(),
};
check(
  'while it sends, Escape, the back arrow and close all wait',
  held.backDisabled && held.closeDisabled && held.stillOnForm,
  held
);
await page.waitForTimeout(1400);
const params = mailed?.template_params ?? {};
check(
  'the email carries every field',
  params.title === 'Hoeken’s Straight-Line' &&
    params.section === 'Paths and Curves' &&
    params.credit === 'Pat Lee' &&
    params.email === 'pat@example.com' &&
    params.source === 'open-mechanism' &&
    params.consent === 'yes' &&
    /^https?:\/\/.*\?/.test(params.project ?? '') &&
    /runs$/.test(params.summary ?? ''),
  { ...params, diagnostic: undefined, message: undefined }
);
const sentView = (
  await page
    .locator('.sentView')
    .innerText()
    .catch(() => '')
).replace(/\s+/g, ' ');
check(
  'the Sent view thanks them by the name they gave and shows what went',
  sentView.includes('Suggestion sent') &&
    sentView.includes('Thank you, Pat Lee.') &&
    sentView.includes('we will write to pat@example.com') &&
    sentView.includes('Waiting for review · Paths and Curves'),
  sentView
);
await page.screenshot({ path: `${OUT}/03-sent.png` });
const staleRetry = await page.evaluate(() =>
  [...document.querySelectorAll('.notification button')].some((one) =>
    /Try again/.test(one.textContent)
  )
);
check('a send that goes takes the earlier Try again away with it', !staleRetry);

await page.locator('.sentActions .btnOutlined').click();
await page.waitForTimeout(400);
check('Suggest Another starts blank', (await page.inputValue('#suggest-title')) === '');

// --- a pasted link, in each of its states --------------------------------------
await page.locator('.sourceChoice button', { hasText: 'Paste a Link' }).click();
const hint = () => page.locator('#suggest-link-hint').innerText();
await page.fill('#suggest-link', 'https://www.youtube.com/watch?v=hoeken');
await page.waitForTimeout(500);
check(
  'somebody else’s link is not a PMKS+ link',
  (await hint()).startsWith('That is not a PMKS+ link.')
);
await page.fill('#suggest-link', `https://app.pmksplus.com/?${payloads['4-Bar'].slice(0, 40)}`);
await page.waitForTimeout(500);
check(
  'a link that will not decode is cut short',
  (await hint()).startsWith('That link is cut short')
);
await page.fill('#suggest-link', `https://app.pmksplus.com/?${payloads['4-Bar']}`);
await page.waitForTimeout(80);
check('reading a link says so while it does', (await hint()) === 'Opening the link…');
await page.waitForTimeout(600);
const linked = await page.evaluate(() => ({
  hint: document.querySelector('#suggest-link-hint')?.textContent?.trim(),
  nudge: document.querySelector('.warnNote')?.textContent?.replace('warning', '').trim(),
}));
check('a whole link opens', linked.hint?.startsWith('Opened:'), linked);
check(
  'and one of the library’s own is named, without being refused',
  linked.nudge?.startsWith('This is Four-Bar from Start Here.'),
  linked
);
await page.screenshot({ path: `${OUT}/04-pasted.png` });

// --- the way back --------------------------------------------------------------
await page.locator('.suggestHead .iconButton').click();
await page.waitForTimeout(400);
const back = await page.evaluate(() => ({
  chosen: document.querySelector('.rail .category.on .name')?.textContent?.trim(),
  focused: document.activeElement?.textContent?.replace('add_circle', '').trim(),
}));
check(
  'back returns to the section that was open, with the focus where it left',
  back.chosen === 'Paths and Curves' && back.focused === 'Suggest one that belongs here',
  back
);

// --- a draft outlives the dialog -----------------------------------------------
await page.locator('.rail .suggestCard button').click();
await page.waitForTimeout(400);
await page.fill('#suggest-title', 'Kept for later');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const closed = (await page.locator('#templates').count()) === 0;
await openLibrary();
await page.locator('.rail .suggestCard button').click();
await page.waitForTimeout(400);
check(
  'closing the library keeps what was typed for the next time',
  closed && (await page.inputValue('#suggest-title')) === 'Kept for later'
);

// --- between a phone and a desktop -----------------------------------------------
await page.setViewportSize({ width: 800, height: 800 });
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => {
  const title = document.querySelector('#suggest-title').getBoundingClientRect();
  const preview = document.querySelector('.previewColumn')?.getBoundingClientRect();
  return { title: Math.round(title.width), previewBelow: !!preview && preview.top >= title.bottom };
});
check(
  'at 800px the preview goes under the form instead of squeezing it',
  narrow.title > 250 && narrow.previewBelow,
  narrow
);
await page.screenshot({ path: `${OUT}/05-narrow.png` });

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failures = results.filter((one) => !one.pass).length;
console.log(`\n${results.length - failures}/${results.length} passed`);
process.exit(failures ? 1 : 0);
