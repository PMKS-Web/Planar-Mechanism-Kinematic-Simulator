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

// 4 · a refused Length changes nothing and puts the old number back. A barrel
//     may not grow past the rod's own floor (decision S3), and 60 cm is well
//     past it on this ram.
await load('barrel');
out.beforeRefusal = await reading();
await typeInto('[data-hold-field="length"]', '60');
out.refused = {
  ...(await reading()),
  said: await page.locator('.notification').allInnerTexts(),
};

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

const checks = [
  [
    'emptying the percentage moves nothing',
    out.after1.start === out.before1.start && out.after1.startsAt === out.before1.startsAt,
  ],
  ['a fractional percentage survives the round trip', out.fractional.startsAt === '33.7'],
  ['a percentage past the end stops at the end', out.clamped.startsAt === '100'],
  [
    'a refused Length changes nothing, says why, and puts the old number back',
    out.refused.barrel === out.beforeRefusal.barrel &&
      out.refused.length === out.beforeRefusal.length &&
      out.refused.said.some((text) => /rod|travel|barrel/i.test(text)),
  ],
  [
    'one panel edit is one undo step, and the cylinder survives it',
    out.edited.barrel > out.beforeUndo.barrel &&
      Math.abs(out.afterUndo.barrel - out.beforeUndo.barrel) < 0.5 &&
      out.afterUndo.alive,
  ],
  ['nothing threw', errs.length === 0],
];
for (const [what, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
await ctx.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
