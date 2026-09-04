/**
 * Which unit a force is read in, and what changes when the reader picks another.
 *
 * English has one force unit and metric has two, so the choice is a row that
 * appears rather than one that grays: under inches there is nothing to pick.
 * What kilograms-force must not do is change what is *stored* -- magnitudes
 * stay in the length system's own unit, and the panel, the axis, the strip and
 * the URL all convert at their own edges. A pick that leaked into storage would
 * multiply every load by 9.8 on the way to the solver.
 *
 * Also here because it is the same row: a grayed pill must not answer the
 * pointer. Hover darkened a disabled option's ink, which reads as pressable
 * right up until the click does nothing.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/force-units.mjs
 */

import { mkdirSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { openMechanism, waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/force-units';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const results = [];
const record = (what, ok, detail) => {
  results.push([what, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ' — ' + JSON.stringify(detail)}`);
};

/** The Settings drawer, open — through the project menu, as a hand would. */
const openSettings = async () => {
  if ((await page.locator('#settingsWrapper').count()) > 0) return;
  await page.locator('.topStrip .iconButton').first().click();
  await page.locator('.menuItem', { hasText: 'Settings' }).first().click();
  await page.waitForTimeout(700);
};

/** One labeled pill row in Settings: its options and which is chosen. */
const pill = (label) =>
  page.evaluate((wanted) => {
    const block = [...document.querySelectorAll('#settingsWrapper #radio-block')].find((one) =>
      one.textContent.trim().startsWith(wanted)
    );
    if (!block) return null;
    const buttons = [...block.querySelectorAll('.segmented button')];
    return {
      options: buttons.map((one) => one.textContent.trim()),
      chosen: buttons.findIndex((one) => one.classList.contains('chosen')),
      disabled: buttons.every((one) => one.disabled),
    };
  }, label);

const pick = async (label, option) => {
  await page
    .locator('#settingsWrapper #radio-block', { hasText: label })
    .locator('.segmented button', { hasText: option })
    .first()
    .click();
  await page.waitForTimeout(700);
};

/** What the drawing is holding, straight off the services. */
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const settings = grid.mechanismSrv.settingsService;
    return {
      forceUnit: settings.forceUnit.value,
      lengthUnit: settings.lengthUnit.value,
      magnitudes: grid.mechanismSrv.forces.map((one) => Math.round(one.mag * 1e6) / 1e6),
      strip: document.querySelector('app-bottombar')?.textContent ?? '',
    };
  });

await openMechanism(page, `${BASE}/?${payloads['Crane_Two_Loads']}`);
await openSettings();

// ---- English: one force unit, so no row ------------------------------------
await pick('Global Units', 'English (in)');
record(
  'English offers no Force Units row — there is nothing to pick',
  (await pill('Force Units')) === null,
  await pill('Force Units')
);
await page
  .locator('#settingsWrapper')
  .screenshot({ path: 'artifacts/force-units/settings-english.png' });
const english = await state();
record('and stores its magnitudes in pounds-force', english.forceUnit === 20, english);
record('while the strip names lbf', /\blbf\b/.test(english.strip), english.strip);

// ---- Metric: newtons and kilograms-force ------------------------------------
await pick('Global Units', 'Metric (cm)');
const metric = await pill('Force Units');
record(
  'metric raises the row, on newtons',
  metric?.options.join(' · ') === 'Newton (N) · Kilogram-force (kgf)' && metric.chosen === 0,
  metric
);
const inNewtons = await state();
await page.locator('#settingsWrapper').screenshot({ path: `${OUT}/settings-metric-newtons.png` });

await pick('Force Units', 'Kilogram-force (kgf)');
const inKgf = await state();
record(
  'picking kgf moves the pill and nothing else',
  (await pill('Force Units'))?.chosen === 1,
  await pill('Force Units')
);
record(
  'and leaves every stored magnitude exactly where it was',
  JSON.stringify(inKgf.magnitudes) === JSON.stringify(inNewtons.magnitudes) &&
    inKgf.magnitudes.length > 0,
  { was: inNewtons.magnitudes, now: inKgf.magnitudes }
);
record('while the strip follows the pick', /\bkgf\b/.test(inKgf.strip), inKgf.strip);
await page.locator('#settingsWrapper').screenshot({ path: `${OUT}/settings-metric-kgf.png` });

// ---- The panel reads the same number in the new unit -------------------------
// Selected through the service, because a force's arrow is a drag handle and a
// click aimed at one is a gesture; what is being checked is the field's text.
await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  grid.mechanismSrv.activeObjService.updateSelectedObj(grid.mechanismSrv.forces[0]);
});
await page.waitForTimeout(600);
const panelText = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const panel = ng.getComponent(document.querySelector('app-edit-panel'));
  return {
    stored: grid.mechanismSrv.forces[0].mag,
    shown: panel.forceForm.controls['magnitude'].value,
  };
});
record(
  'the panel shows a stored newton value in kilograms-force',
  /kgf$/.test(panelText.shown) &&
    Math.abs(parseFloat(panelText.shown) - panelText.stored / 9.80665) < 0.01,
  panelText
);

// And a number typed in kilograms-force is stored as the newtons it is worth.
const typed = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const panel = ng.getComponent(document.querySelector('app-edit-panel'));
  panel.forceForm.controls['magnitude'].setValue('2');
  return grid.mechanismSrv.forces[0].mag;
});
record(
  'and a magnitude typed in kilograms-force is stored in newtons',
  Math.abs(typed - 2 * 9.80665) < 1e-6,
  { typed, expected: 2 * 9.80665 }
);

// ---- SI keeps the pick; English spends it -----------------------------------
await pick('Global Units', 'SI (m)');
record(
  'kilograms-force survives a move between metric lengths',
  (await state()).forceUnit === 23,
  await state()
);
await pick('Global Units', 'English (in)');
record(
  'and English lands on lbf whatever was chosen before',
  (await state()).forceUnit === 20,
  await state()
);
await pick('Global Units', 'Metric (cm)');
record(
  'coming back reads newtons rather than a kgf it cannot carry',
  (await state()).forceUnit === 21,
  await state()
);

// ---- A torque names both halves of its unit ---------------------------------
// A moment is a force times a length, so its caption follows both -- and the
// length half is the drawing's own. Centimeters was the one system where it did
// not, so a reader measuring in cm read a moment in meters, a hundredth of the
// number the drawing was actually saying.
const torqueCaption = async () => {
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const driven = grid.mechanismSrv.joints.find((joint) => joint.input);
    grid.mechanismSrv.activeObjService.updateSelectedObj(driven);
  });
  await page.locator('.tabButton', { hasText: 'Force' }).first().click();
  await page.waitForTimeout(1400);
  const text = await page
    .locator('app-analysis-graph-section .graphHeader', { hasText: 'Input Torque' })
    .first()
    .innerText();
  await page.locator('.tabButton', { hasText: 'Edit' }).first().click();
  await page.waitForTimeout(600);
  await openSettings();
  return text.replace(/\s+/g, ' ');
};
await pick('Force Units', 'Kilogram-force (kgf)');
const cmCaption = await torqueCaption();
record('a torque in a centimeter drawing reads in kgf·cm', /\bkgf·cm\b/.test(cmCaption), cmCaption);
await pick('Global Units', 'SI (m)');
const mCaption = await torqueCaption();
record('and the same drawing in meters reads in kgf·m', /\bkgf·m\b/.test(mCaption), mCaption);
// The number moves with the unit; the exact factor is pinned where it can be
// stated exactly, in analysis-sample.service.spec.ts.
record(
  'and it is a number either way, not a gap',
  Number.isFinite(parseFloat(cmCaption.match(/(-?[\d.]+) kgf·cm/)?.[1] ?? 'NaN')) &&
    Number.isFinite(parseFloat(mCaption.match(/(-?[\d.]+) kgf·m/)?.[1] ?? 'NaN')),
  { cmCaption, mCaption }
);
await pick('Global Units', 'Metric (cm)');

// ---- The pick rides the URL -------------------------------------------------
await pick('Force Units', 'Kilogram-force (kgf)');
const beforeSharing = await state();
const url = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
);
await openMechanism(page, `${BASE}/?${url}`);
const reopened = await state();
record(
  'a link shared in kilograms-force opens in kilograms-force',
  reopened.forceUnit === 23,
  reopened
);
record(
  // To the codec's own precision, which rounds a magnitude to four decimals:
  // what is being checked is that nothing was converted on the way, not that
  // the URL carries more digits than it does.
  'and its loads come back at the newtons they were saved as',
  reopened.magnitudes.length === beforeSharing.magnitudes.length &&
    reopened.magnitudes.every((now, at) => Math.abs(now - beforeSharing.magnitudes[at]) < 1e-3),
  { was: beforeSharing.magnitudes, now: reopened.magnitudes }
);

// ---- A grayed pill does not answer the pointer ------------------------------
await waitForReady(page);
await openSettings();
// Parked mid-cycle, every unit switch grays.
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.seekMechanism(0, srv.mechanisms[0].cyclePeriod / 3);
});
await page.waitForTimeout(700);
const grayed = await pill('Angle Units');
record(
  'the unit pills gray while the mechanism is parked mid-cycle',
  grayed?.disabled === true,
  grayed
);
const unchosen = page
  .locator('#settingsWrapper #radio-block', { hasText: 'Angle Units' })
  .locator('.segmented button:not(.chosen)')
  .first();
const inkBefore = await unchosen.evaluate((one) => getComputedStyle(one).color);
await unchosen.hover({ force: true });
await page.waitForTimeout(400);
const inkAfter = await unchosen.evaluate((one) => getComputedStyle(one).color);
record('and a grayed option does not darken under the cursor', inkBefore === inkAfter, {
  inkBefore,
  inkAfter,
});
await page.locator('#settingsWrapper').screenshot({ path: `${OUT}/pill-disabled-hover.png` });

record('nothing threw', errors.length === 0, errors.slice(0, 3));
await browser.close();

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
