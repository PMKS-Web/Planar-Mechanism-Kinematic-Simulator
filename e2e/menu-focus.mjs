/**
 * Who gets a ring drawn round the project menu's first row.
 *
 * Opening the menu moves focus into it, because a popover that leaves focus on
 * its trigger is one the keyboard cannot reach. Drawing that focus is a
 * separate question: to somebody who only clicked the hamburger, a ring round
 * New Project reads as "this one is selected".
 *
 * `:focus-visible` is the obvious way to tell the two apart and is wrong in
 * exactly one case, which is the case that was reported: right after a page
 * load, with no interaction recorded yet, the browser treats a script moving
 * focus as keyboard work. So the first menu opened after a refresh was ringed
 * and every one after it was not -- a highlight that appears only on the first
 * try, which reads as a bug in whatever it is highlighting.
 *
 * The component answers instead, from the event that opened the menu. These
 * three checks are the three ways in.
 *
 * Run: node e2e/menu-focus.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';

const OUT = 'artifacts/menu-focus';
mkdirSync(OUT, { recursive: true });
const BASE = process.env.PMKS_BASE_URL ?? process.env.PMKS_URL ?? 'http://localhost:4200';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();

/**
 * A window nobody has touched yet.
 *
 * A fresh context every time on purpose: what went wrong only goes wrong before
 * the page has recorded any interaction, so a check that reused one page would
 * be testing the second menu open and not the first.
 */
async function arrive() {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await startQuiet(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(400);
  return { context, page };
}

/** What the row with focus is actually wearing. */
const ringOnFocused = (page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('.projectMenu .menuItem')];
    const on = items.find((item) => item === document.activeElement);
    if (!on) return { focused: -1, ring: 'nothing has focus' };
    const style = getComputedStyle(on);
    return {
      focused: items.indexOf(on),
      // `none` however wide: a width without a style draws nothing.
      ring: style.outlineStyle === 'none' ? 'none' : `${style.outlineWidth} ${style.outlineStyle}`,
    };
  });

const RING = '2px solid';

// --- clicked, on a page nobody has touched yet -------------------------------
{
  const { context, page } = await arrive();
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(350);
  const seen = await ringOnFocused(page);
  check(
    'the menu takes focus, so the keyboard can reach it',
    seen.focused === 0,
    JSON.stringify(seen)
  );
  check(
    'but a click draws no ring, even on the first menu after a load',
    seen.ring === 'none',
    JSON.stringify(seen)
  );
  await page.locator('.projectMenu').screenshot({ path: `${OUT}/clicked.png` });
  await context.close();
}

// --- opened from the keyboard ------------------------------------------------
{
  const { context, page } = await arrive();
  await page.locator('.topStrip .iconButton').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  const seen = await ringOnFocused(page);
  check(
    'Enter on the trigger rings the row it lands on',
    seen.focused === 0 && seen.ring === RING,
    JSON.stringify(seen)
  );
  await page.locator('.projectMenu').screenshot({ path: `${OUT}/keyboard.png` });
  await context.close();
}

// --- clicked open, then steered with the arrows ------------------------------
{
  const { context, page } = await arrive();
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(350);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const seen = await ringOnFocused(page);
  // A reader who opened it with the mouse and then reached for the arrows is a
  // reader who now needs to see where they are.
  check(
    'reaching for the arrows brings the ring back',
    seen.focused === 1 && seen.ring === RING,
    JSON.stringify(seen)
  );
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
