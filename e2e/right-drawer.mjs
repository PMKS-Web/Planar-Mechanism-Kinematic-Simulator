/**
 * The right drawer against the view controls it stands over.
 *
 * Two measured facts, both reported by a reader pointing at the corner: the
 * drawer's card is exactly as wide as the view controls and shares their left
 * edge on every page, and its bottom stops one card gap above them -- also
 * when the tutorial is pinned above the page and the two do not fit, which is
 * when the frame used to scroll and the page ran under the controls.
 *
 *   PMKS_BASE_URL=<origin> node e2e/right-drawer.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { ALL_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
/** The one gap: `$card-inset` in `left-tabs.vars.scss`. */
const GAP = 12;

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (error) => errors.push(String(error)));

const load = async (height) => {
  await page.setViewportSize({ width: 1500, height });
  await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(500);
};

const openTab = async (n) => {
  await page.evaluate(
    (n) => ng.getComponent(document.querySelector('app-right-panel')).constructor.tabClicked(n),
    n
  );
  await page.waitForTimeout(900);
};

const openTutorial = async () => {
  await page.locator('.topStrip .iconButton').first().click();
  await page
    .locator('.menuItem', { hasText: /Tutorial/ })
    .first()
    .click();
  await page.waitForTimeout(700);
};

/** The cards in the drawer and the view controls, as boxes. */
const geometry = () =>
  page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return {
        left: Math.round(b.left),
        right: Math.round(b.right),
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        width: Math.round(b.width),
        height: Math.round(b.height),
      };
    };
    const cards = [
      ...document.querySelectorAll('#rightPanel .tutorialSlot > *, #rightPanel .drawerPage > *'),
    ]
      .filter((el) => el.tagName !== 'BUTTON')
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        box: box(el),
        scrolls: [...el.querySelectorAll('*')].some(
          (inner) =>
            inner.scrollHeight > inner.clientHeight + 2 &&
            /auto|scroll/.test(getComputedStyle(inner).overflowY)
        ),
      }));
    return { cards, controls: box(document.querySelector('.viewControls')) };
  });

const sameColumn = (card, controls) => card.left === controls.left && card.right === controls.right;

// --- Every page is the view controls' width, on their left edge ----------------
await load(950);
for (const [name, tab] of [
  ['Settings', 1],
  ['Kinematic setup', 5],
  ['Export', 7],
]) {
  await openTab(tab);
  const { cards, controls } = await geometry();
  const card = cards[cards.length - 1];
  record(
    `${name} is as wide as the view controls and shares their edges`,
    sameColumn(card.box, controls),
    {
      card: card.box,
      controls,
    }
  );
}

// --- The export page with the tutorial pinned above it ------------------------
await load(950);
await openTutorial();
await openTab(7);
{
  const { cards, controls } = await geometry();
  const [tutorial, exportCard] = cards;
  record(
    'with the tutorial pinned, the export card still shares the controls’ column',
    cards.length === 2 &&
      sameColumn(tutorial.box, controls) &&
      sameColumn(exportCard.box, controls),
    { cards, controls }
  );
  record(
    'and its bottom stops one gap above the view controls',
    exportCard.box.bottom === controls.top - GAP,
    { bottom: exportCard.box.bottom, controlsTop: controls.top }
  );
  record('one gap between the two cards', exportCard.box.top - tutorial.box.bottom === GAP, {
    tutorialBottom: tutorial.box.bottom,
    exportTop: exportCard.box.top,
  });
  record(
    'the export card scrolls inside itself rather than the drawer scrolling',
    exportCard.scrolls &&
      (await page.evaluate(() => {
        const frame = document.querySelector('#rightPanel');
        return getComputedStyle(frame).overflowY !== 'auto' && frame.scrollTop === 0;
      })),
    exportCard
  );
  record(
    'the machine note is not ellipsed',
    await page.evaluate(() =>
      [...document.querySelectorAll('.mechNote')].every((n) => n.scrollWidth <= n.clientWidth + 1)
    )
  );
}

// --- A short window: both cards give way, neither past its floor ---------------
await load(700);
await openTutorial();
await openTab(7);
{
  const { cards, controls } = await geometry();
  const [tutorial, exportCard] = cards;
  record(
    'on a short window the export card still stops one gap above the controls',
    exportCard.box.bottom === controls.top - GAP,
    { bottom: exportCard.box.bottom, controlsTop: controls.top }
  );
  record(
    'the tutorial keeps at least 200px and the page at least 260px',
    tutorial.box.height >= 200 && exportCard.box.height >= 260,
    { tutorial: tutorial.box.height, page: exportCard.box.height }
  );
  record('both scroll inside themselves', tutorial.scrolls && exportCard.scrolls, cards);
}

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
