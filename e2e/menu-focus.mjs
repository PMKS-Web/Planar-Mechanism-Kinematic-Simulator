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
 * The component answers instead, from the event that opened the menu. The first
 * three checks are the three ways into the project menu.
 *
 * The right-click card asks the same question and got the same answer, because
 * it is a CDK menu and the CDK moves focus into it as it opens. It was worse
 * there: the first item is the joint's *chosen* type, so the ring landed on the
 * value that already wears the chosen pill and read as a second kind of
 * selected -- reported on Revolute, on a freshly loaded page.
 *
 * Run: node e2e/menu-focus.mjs
 */
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { mkdirSync, writeFileSync } from 'node:fs';
import { openMechanism, waitForReady } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

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

/** How many rows wear a ring, wherever focus happens to be. */
const ringedRows = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.projectMenu .menuItem')].filter(
        (row) => getComputedStyle(row).outlineStyle !== 'none'
      ).length
  );

/** The same question of the right-click card: what the item with focus wears. */
const ringInCard = (page) =>
  page.evaluate(() => {
    const item = document.activeElement?.closest?.('.cm-choice__cell, .cm-row') ?? null;
    const style = item ? getComputedStyle(item) : null;
    return {
      on: item
        ? (item.querySelector('.cm-choice__label, .cm-row__label')?.textContent?.trim() ?? '?')
        : 'nothing in the card',
      kind: !item ? null : item.classList.contains('cm-choice__cell') ? 'value' : 'row',
      ring:
        !style || style.outlineStyle === 'none'
          ? 'none'
          : `${style.outlineWidth} ${style.outlineStyle}`,
      // Everything wearing one, so a ring left on some other item is caught
      // rather than hidden by looking only where focus happens to be.
      ringed: [...document.querySelectorAll('#contextMenu .cm-choice__cell, #contextMenu .cm-row')]
        .filter((el) => getComputedStyle(el).outlineStyle !== 'none')
        .map((el) => el.textContent.trim().slice(0, 14)),
    };
  });

// --- clicked, on a page nobody has touched yet -------------------------------
{
  const { context, page } = await arrive();
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(350);
  const seen = await ringOnFocused(page);
  // The card itself, not a row: a focused row is one Space away from acting,
  // and nothing is drawn on a mouse-opened menu to say which row that is.
  check(
    'the menu takes focus, so the keyboard can reach it -- and arms no row',
    seen.focused === -1 &&
      (await page.evaluate(() => document.activeElement?.id === 'projectMenu')),
    JSON.stringify(seen)
  );
  check(
    'and rings no row, even on the first menu after a load',
    (await ringedRows(page)) === 0,
    JSON.stringify(seen)
  );
  // The reported bug: Space is the play/pause key, and a reader who clicked the
  // hamburger and reached for it opened a new project in place of their work.
  const opened = [];
  context.on('page', (p) => opened.push(p.url()));
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
  check(
    'and Space presses nothing until an arrow has chosen a row',
    opened.length === 0 && (await page.evaluate(() => !!document.querySelector('.projectMenu'))),
    `new tabs: ${opened.length}`
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
  // Opened with a key, and still nothing armed: a reader who opens this menu
  // with Space is a reader about to press Space again.
  check(
    'Enter on the trigger arms no row either',
    seen.focused === -1 && (await ringedRows(page)) === 0,
    JSON.stringify(seen)
  );
  const opened = [];
  context.on('page', (p) => opened.push(p.url()));
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
  check(
    'so Space presses nothing there either',
    opened.length === 0 && (await page.evaluate(() => !!document.querySelector('.projectMenu'))),
    `new tabs: ${opened.length}`
  );
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const armed = await ringOnFocused(page);
  check(
    'and the first arrow rings the row it arms',
    armed.focused === 0 && armed.ring === RING,
    JSON.stringify(armed)
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
  // reader who now needs to see where they are. From the card, the first press
  // lands on the first row rather than stepping over it.
  check(
    'reaching for the arrows arms the first row and rings it',
    seen.focused === 0 && seen.ring === RING,
    JSON.stringify(seen)
  );
  await context.close();
}

// --- the arrows walk past a row they cannot land on --------------------------
// Export Data is a `disabled` button until something has been solved, and a
// disabled button cannot take focus: walking down an empty document's menu used
// to stop dead at Share project, the row above it, however many times the key
// was pressed.
{
  const { context, page } = await arrive();
  await page.locator('.topStrip .iconButton').first().click();
  await page.waitForTimeout(350);
  const grayed = await page.evaluate(
    () => [...document.querySelectorAll('.projectMenu .menuItem')].filter((b) => b.disabled).length
  );
  const walked = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(80);
    walked.push(
      await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 10) ?? 'none')
    );
  }
  // Every live row, and back to the top: nothing repeats until the list wraps.
  const distinct = new Set(walked).size;
  check(
    'the arrows walk every row that can be used, and past the grayed one',
    grayed > 0 && distinct >= 9 && walked.at(-1) !== walked.at(-2),
    JSON.stringify({ grayed, distinct, walked })
  );
  await context.close();
}

// --- the right-click card, on a page nobody has touched yet ------------------
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await startQuiet(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await page.waitForTimeout(400);

  const openCard = async () => {
    const at = await page.locator('#joint_B').boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2, { button: 'right' });
    await page.locator('#contextMenu.show').waitFor();
    await page.waitForTimeout(300);
  };

  await openCard();
  const opened = await ringInCard(page);
  check(
    'the card takes focus too, so the arrows can walk its values',
    opened.on === 'Revolute' && opened.kind === 'value',
    JSON.stringify(opened)
  );
  check(
    'but a right-click draws no ring, even on the first card after a load',
    opened.ring === 'none' && opened.ringed.length === 0,
    JSON.stringify(opened)
  );
  await page.locator('#contextMenu').screenshot({ path: `${OUT}/card-clicked.png` });

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  const walked = await ringInCard(page);
  check(
    'and the first arrow press rings the value it lands on, and only that one',
    walked.on === 'Prismatic' && walked.ring === RING && walked.ringed.length === 1,
    JSON.stringify(walked)
  );
  await page.locator('#contextMenu').screenshot({ path: `${OUT}/card-arrowed.png` });

  // The ring belongs to the reader who asked for it, not to the card: the next
  // one opened with the mouse starts clean.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await openCard();
  const again = await ringInCard(page);
  check(
    'a card opened with the mouse after that is clean again',
    again.ring === 'none' && again.ringed.length === 0,
    JSON.stringify(again)
  );
  await context.close();
}

// --- Space on a card opened with the pointer presses nothing -----------------
// The card's own half of the hazard the project menu has above. The CDK focuses
// the first value as it opens and a `cdkMenuItem` triggers on Space however it
// got focus, and the first value is Revolute -- so right-clicking a slider and
// reaching for the transport (Space is play/pause) took the slider off the
// joint. Measured on the drawing, not on the card: a radio item keeps the menu
// open when it triggers, and the card is a snapshot, so its chosen cell goes on
// reading the old type even after the joint has changed under it.
{
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await startQuiet(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await openMechanism(page, `${BASE}/?${TEMPLATE_LINKAGES['Slider_Crank']}`);
  await page.waitForTimeout(400);

  const jointIds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[id^="joint_"]')].map((el) => el.id).join(',')
    );
  const before = await jointIds();

  const at = await page.locator('#joint_C').boundingBox();
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2, { button: 'right' });
  await page.locator('#contextMenu.show').waitFor();
  await page.waitForTimeout(300);
  const chosen = await page.evaluate(
    () => document.querySelector('.cm-choice__cell--chosen')?.textContent?.trim() ?? 'none'
  );
  check(
    'the slider joint opens its card on Pin-in-slot, so Revolute is a real change',
    chosen === 'Pin-in-slot',
    chosen
  );

  await page.keyboard.press(' ');
  await page.waitForTimeout(900);
  const after = await jointIds();
  check(
    'and Space retypes nothing: the drawing is what it was',
    after === before,
    JSON.stringify({ before, after })
  );
  // What it did instead: armed the value it would press, where it can be seen.
  const armed = await ringInCard(page);
  check(
    'it rings the value it would have pressed instead',
    armed.on === 'Revolute' && armed.ring === RING && armed.ringed.length === 1,
    JSON.stringify(armed)
  );
  await page.locator('#contextMenu').screenshot({ path: `${OUT}/card-space-armed.png` });

  // And a second press does act, on something the reader can now see.
  await page.keyboard.press(' ');
  await page.waitForTimeout(900);
  check(
    'and the second press, on a value that is now ringed, does act',
    (await jointIds()) !== before,
    JSON.stringify({ before, then: await jointIds() })
  );
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
