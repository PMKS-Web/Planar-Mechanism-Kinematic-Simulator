/**
 * The panels a cylinder opens, exercised the way they broke.
 *
 * Every case here came from someone driving the app rather than reading it. The
 * old Edit Cylinder panel is gone (Stage 2c, D12): a member states its own
 * Length and the part's Angle, and the slide states *Starts at*. What survives
 * from that panel's bug list is what those fields can still get wrong — a blank
 * box read as zero, a position rounded until the panel disagrees with the
 * drawing, a refusal that leaves the wrong number in the field, and an edit that
 * takes more than one Undo to take back.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-panel.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const payload = TEMPLATE_LINKAGES['Cylinder_Boom'];
const ctx = await chromium.launchPersistentContext('/tmp/pmks-chrome-reg', {
  headless: true,
  viewport: { width: 1600, height: 1000 },
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/** Open the template with one piece of its ram selected. */
async function load(which) {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.evaluate((what) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const one = grid.mechanismSrv.sealedStructures()[0];
    grid.activeObjService.updateSelectedObj(what === 'seal' ? one.seal : one.barrel);
  }, which);
  // The line above ran outside Angular's zone; a nudge across the canvas enters
  // it, so the panel is drawn before anything is read off it.
  await page.mouse.move(900, 300);
  await page.mouse.move(905, 305);
  await page.waitForTimeout(600);
}

/** What the part and the open panel say right now. */
const reading = () =>
  page.evaluate(() => {
    const one = ng
      .getComponent(document.querySelector('app-new-grid'))
      .mechanismSrv.sealedStructures()[0];
    const valueOf = (selector) => document.querySelector(selector)?.value ?? null;
    return {
      startsAt: valueOf('[data-field="cylinderStart"]'),
      length: valueOf('[data-hold-field="length"]'),
      angle: valueOf('[data-hold-field="angle"]'),
      start: one ? Math.round(one.start * 1e6) / 1e6 : null,
      barrel: one
        ? Math.round(Math.hypot(one.inner.x - one.mountA.x, one.inner.y - one.mountA.y) * 1e3) / 1e3
        : null,
      rod: one
        ? Math.round(Math.hypot(one.mountB.x - one.seal.x, one.mountB.y - one.seal.y) * 1e3) / 1e3
        : null,
      alive: !!one,
    };
  });

/** Type into a field and let it commit, the way a reader does. */
async function typeInto(selector, text) {
  const field = page.locator(selector).first();
  await field.click({ clickCount: 3 });
  if (text === '') await page.keyboard.press('Backspace');
  else await field.fill(text);
  await field.press('Enter');
  await page.waitForTimeout(800);
}

const out = {};

// 1 · a blank percentage is not 0%: emptying the box must not retract the rod.
await load('seal');
out.before1 = await reading();
await typeInto('[data-field="cylinderStart"]', '');
out.after1 = await reading();

// 2 · a fractional percentage survives the round trip, to the decimal the field
//     shows. Rounded to a whole number the box said 34 for a rod standing at
//     33.7%, and on a long ram that gap is a real distance.
await load('seal');
await typeInto('[data-field="cylinderStart"]', '33.7');
out.fractional = await reading();

// 3 · outside its own travel there is nowhere further to go, so the ends are
//     what an out-of-range number means.
await load('seal');
await typeInto('[data-field="cylinderStart"]', '140');
out.clamped = await reading();

// 4 · a Length the part cannot fully have goes as far as it can, says how far,
//     and leaves the box on the number it reached (S19). It used to refuse and
//     put the old number back; what "puts the old number back" now guards is
//     that the field and the drawing agree afterwards, whichever they land on.
await load('barrel');
out.beforeShort = await reading();
await typeInto('[data-hold-field="length"]', '0.001');
out.short = {
  ...(await reading()),
  said: await page.locator('.notification').allInnerTexts(),
};

// 4b · and the limit that is now repaired instead: a barrel typed well past
//      the rod's floor takes the rod with it rather than being refused.
await load('barrel');
out.beforeRepair = await reading();
await typeInto('[data-hold-field="length"]', '60');
out.repaired = await reading();

// 5 · a panel edit is one undo step. It was not: a field that re-poses through
//     a drag saved nothing, so Undo took back the gesture before it — on a
//     freshly opened template, the template itself.
//
// The number is worked out from this ram rather than written down: how much
// room a barrel has to grow is the rod's business (decision S3), and this
// template's two members are not the equal pair a fresh drawing has.
await load('barrel');
out.beforeUndo = await reading();
const room = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const one = grid.mechanismSrv.sealedStructures()[0];
  const span = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const barrel = span(one.mountA, one.inner);
  const ceiling = span(one.seal, one.mountB) + 1.4 * 0.15 * grid.settings.objectScale;
  // Halfway to the ceiling, so the check is about the undo rather than about
  // how close to a limit a number may land.
  return { barrel, wanted: (barrel + Math.min(ceiling, barrel * 1.2)) / 2 };
});
const shown = Number(String(out.beforeUndo.length).replace(/[^\d.]/g, ''));
const grown = ((shown * room.wanted) / room.barrel).toFixed(2);
await typeInto('[data-hold-field="length"]', grown);
out.edited = await reading();
await page.locator('button', { hasText: 'Undo' }).first().click();
await page.waitForTimeout(900);
out.afterUndo = await reading();

out.errs = errs;
console.log(JSON.stringify(out, null, 2));

// 6 · clicking a field selects what is in it, so the next keystroke replaces
//     the value. `select()` on the click is not enough on a field that already
//     has focus: the browser sets the caret that click asks for *after* the
//     handler runs, so the second click on the Length field read as doing
//     nothing at all.
/** Click a field twice, a second apart, and say what was selected each time. */
async function clickTwice(selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return { first: null, second: null };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const state = () =>
    page.evaluate((one) => {
      const field = document.querySelector(one);
      return field ? `${field.selectionStart}-${field.selectionEnd}/${field.value.length}` : null;
    }, selector);
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const first = await state();
  await page.waitForTimeout(900);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(350);
  return { first, second: await state() };
}

const selects = {};
await load('barrel');
selects.barrelLength = await clickTwice('[data-hold-field="length"]');
await load('barrel');
selects.barrelAngle = await clickTwice('[data-hold-field="angle"]');
await load('seal');
selects.startsAt = await clickTwice('[data-field="cylinderStart"]');
await load('seal');
selects.sliderAngle = await clickTwice('[data-field="sliderAngle"]');
const wholeValue = (seen) => seen.first === seen.second && /^0-(\d+)\/\1$/.test(seen.first ?? '');

// 7 · a member's Mass Settings offers Mass and nothing else (decision S14).
//     Its inertia and its center follow its own shape, and the decode clears
//     both custom flags on every cylinder member -- so a field for either would
//     be promising to keep a number the next reload throws away.
await load('barrel');
await page.locator('collapsible-subsection', { hasText: 'Mass Settings' }).first().click();
await page.waitForTimeout(500);
const massArea = await page.evaluate(() => {
  const area = document.querySelector('app-edit-panel .massArea');
  if (!area) return null;
  return {
    fields: [...area.querySelectorAll('input')].map((one) =>
      (one.closest('input-block, state-input') ?? one).textContent.trim().slice(0, 24)
    ),
    note: area.querySelector('.massNote')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
    legend: !!area.querySelector('.dotLegend'),
    comRow: !!area.querySelector('.comPairRow'),
    moi: !!area.querySelector('.moiBlock'),
  };
});

const checks = [
  [
    'emptying the percentage moves nothing',
    out.after1.start === out.before1.start && out.after1.startsAt === out.before1.startsAt,
  ],
  ['a fractional percentage survives the round trip', out.fractional.startsAt === '33.7'],
  ['a percentage past the end stops at the end', out.clamped.startsAt === '100'],
  [
    'a Length that cannot be fully had stops short, says so, and the box reads what landed',
    out.short.barrel < out.beforeShort.barrel &&
      out.short.barrel > 0.001 &&
      out.short.length === `${(out.short.barrel / 200).toFixed(2)} cm` &&
      out.short.said.some((text) => /stopped at/i.test(text) && /no travel left in it/i.test(text)),
  ],
  [
    'a barrel past the rod’s floor takes the rod with it rather than being refused',
    out.repaired.barrel > out.beforeRepair.barrel && out.repaired.rod > out.beforeRepair.rod,
  ],
  [
    'one panel edit is one undo step, and the cylinder survives it',
    out.edited.barrel > out.beforeUndo.barrel &&
      Math.abs(out.afterUndo.barrel - out.beforeUndo.barrel) < 0.5 &&
      out.afterUndo.alive,
  ],
  [
    'clicking a member’s Length or Angle selects it, twice running',
    wholeValue(selects.barrelLength) && wholeValue(selects.barrelAngle),
  ],
  [
    'and so do the slide’s Starts at and Slider Angle',
    wholeValue(selects.startsAt) && wholeValue(selects.sliderAngle),
  ],
  [
    'a member’s Mass Settings offers Mass alone, and says why',
    !!massArea &&
      massArea.fields.length === 1 &&
      !massArea.legend &&
      !massArea.comRow &&
      !massArea.moi &&
      /computed from its own shape/.test(massArea.note),
  ],
  ['nothing threw', errs.length === 0],
];
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
if (checks.some(([, ok]) => !ok)) {
  console.log(JSON.stringify({ out, selects, massArea }, null, 2));
}
await ctx.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
