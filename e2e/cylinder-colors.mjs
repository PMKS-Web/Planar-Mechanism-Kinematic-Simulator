/**
 * A cylinder's barrel and rod are colored independently (decision S15).
 *
 * The model rules are unit-checked; this is the gate that asks the *app*. A
 * cylinder is one color when it is placed, and after that the Rod Color field
 * moves the rod alone and the Barrel Color field the barrel alone — including
 * the case that made the flag necessary, where the rod has chosen nothing yet
 * and is being drawn in the barrel's ink. Pressing the barrel's swatch there
 * has to leave the rod looking exactly as it did.
 *
 * And what must not have changed: `Cylinder_Boom` stores a rod color nothing
 * has ever drawn, like every cylinder in circulation, so it has to open in
 * exactly the colors it opened in before.
 *
 *   PMKS_PLAYWRIGHT_DIR=<dir> PMKS_BASE_URL=<origin> node e2e/cylinder-colors.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/cylinder-colors';

const results = [];
const consoleErrors = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
mkdirSync(OUT, { recursive: true });
let shots = 0;
const shot = async (tag) =>
  page.screenshot({ path: `${OUT}/${String(shots++).padStart(2, '0')}-${tag}.png` });

/** What the canvas actually paints the two members, read off the drawn paths. */
const painted = () =>
  page.evaluate(() => {
    const pick = (selector, attribute) =>
      document.querySelector(selector)?.getAttribute(attribute) ?? null;
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const found = grid.mechanismSrv.sealedStructures()[0];
    return {
      barrel: pick('.cylinder-barrel', 'fill'),
      rod: pick('.cylinder-rod', 'fill'),
      // The stroke follows the fill on both, so a member drawn in two colors
      // would read as correct on the fill alone.
      barrelStroke: pick('.cylinder-barrel', 'stroke'),
      rodStroke: pick('.cylinder-rod', 'stroke'),
      // And what the records say, which is the half a reload has to carry.
      stored: found
        ? { barrel: found.barrel.fill, rod: found.rod.fill, own: !!found.rod.ownColor }
        : null,
    };
  });

/** Select one member of the cylinder, so the Edit panel opens on it. */
async function select(which) {
  await page.evaluate((role) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const found = grid.mechanismSrv.sealedStructures()[0];
    grid.activeObjService.updateSelectedObj(role === 'rod' ? found.rod : found.barrel);
  }, which);
  await page.waitForTimeout(500);
}

/** The label the Visual Settings color field is wearing right now. */
const colorFieldLabel = () =>
  page.evaluate(() => {
    for (const picker of document.querySelectorAll('app-edit-panel .color-picker')) {
      const label = picker.querySelector('.label')?.textContent?.trim();
      if (label) return label;
    }
    return null;
  });

/**
 * Press the nth swatch of the panel's color field.
 *
 * Centered in the panel before it is clicked: the subsection headers are
 * sticky, and a swatch sitting under one takes the click on the header instead.
 */
async function pressSwatch(index) {
  const swatch = page.locator('app-edit-panel .color-picker .swatch').nth(index);
  await swatch.waitFor({ timeout: 5000 });
  await swatch.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await swatch.click({ timeout: 8000 });
  await page.waitForTimeout(600);
}

/**
 * Open the Visual Settings section, which starts collapsed.
 *
 * Read off the chevron rather than off the swatches: a collapsed section keeps
 * its content in the DOM, laid out under the section below it, so "the swatches
 * exist" is true either way and the click lands on the next header.
 */
async function openVisualSettings() {
  const expanded = () =>
    page.evaluate(() => {
      const section = [...document.querySelectorAll('app-edit-panel collapsible-subsection')].find(
        (one) =>
          one.querySelector('.panel-header__toggle')?.textContent?.includes('Visual Settings')
      );
      return !!section?.querySelector('.panel-header__toggle mat-icon.rotate180');
    });
  if (await expanded()) return true;
  await page
    .locator('app-edit-panel .panel-header__toggle', { hasText: 'Visual Settings' })
    .first()
    .click();
  await page.waitForTimeout(600);
  return expanded();
}

const undoEnabled = () =>
  page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((n) => /Undo/.test(n.textContent));
    return !!button && !button.disabled;
  });

async function clickUndo() {
  if ((await undoEnabled()) !== true) return false;
  await page.click('text=Undo');
  await page.waitForTimeout(700);
  return true;
}

/** A fresh grid with one cylinder drawn through the same call the canvas makes. */
async function freshRam() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    m.createCylinderFrom({ x: -600, y: 0 }, { x: 600, y: 0 });
  });
  await page.waitForTimeout(700);
}

// ------------------------------------------------- 1. placed as one color
console.log('\na cylinder is one color when it is placed');
await freshRam();
let ink = await painted();
await shot('placed');
check(
  'the rod is drawn in the barrel’s color, and stores it',
  ink.barrel !== null && ink.rod === ink.barrel && ink.stored.rod === ink.stored.barrel,
  JSON.stringify(ink)
);
check(
  'and nobody has chosen a rod color yet',
  ink.stored.own === false,
  JSON.stringify(ink.stored)
);

// ------------------------------------- 2. the barrel, on a fresh cylinder
console.log('\nthe barrel’s swatch on a cylinder whose rod has chosen nothing');
await select('barrel');
check('the field is called Barrel Color', (await colorFieldLabel()) === 'Barrel Color');
check('and the Visual Settings section opens', await openVisualSettings());
const wasBarrel = ink.barrel;
await pressSwatch(5);
ink = await painted();
await shot('barrel-recolored');
check(
  'the barrel changes and the rod keeps the color it was standing in',
  ink.barrel !== wasBarrel && ink.rod === wasBarrel,
  JSON.stringify({ wasBarrel, ...ink })
);
check(
  'the rod was handed that color to keep, rather than left following the barrel',
  ink.stored.own === true && ink.stored.rod === wasBarrel,
  JSON.stringify(ink.stored)
);
check(
  'both paths are drawn in one color each, stroke and fill',
  ink.barrelStroke === ink.barrel && ink.rodStroke === ink.rod,
  JSON.stringify(ink)
);

// ------------------------------------------------------ 3. the rod’s own
console.log('\nthe rod’s own swatch');
await select('rod');
check('the field is called Rod Color', (await colorFieldLabel()) === 'Rod Color');
await openVisualSettings();
const barrelNow = ink.barrel;
await pressSwatch(2);
ink = await painted();
await shot('rod-recolored');
check(
  'the rod changes and the barrel does not',
  ink.rod !== ink.barrel && ink.barrel === barrelNow,
  JSON.stringify({ barrelNow, ...ink })
);

// ---------------------------------------------------------- 4. undo, once
console.log('\nundo steps back one change at a time');
const both = { barrel: ink.barrel, rod: ink.rod };
check('the color entered the history', (await undoEnabled()) === true);
await clickUndo();
let stepped = await painted();
check(
  'one undo takes back the rod color alone',
  stepped.rod !== both.rod && stepped.barrel === both.barrel,
  JSON.stringify({ both, stepped })
);
await clickUndo();
stepped = await painted();
check(
  'and the one before it takes back the barrel color, leaving one color again',
  stepped.barrel === wasBarrel && stepped.rod === wasBarrel,
  JSON.stringify({ wasBarrel, stepped })
);

// ------------------------------------------------- 5. a reload carries both
console.log('\nreloading from the URL keeps both');
await freshRam();
await select('barrel');
await openVisualSettings();
await pressSwatch(5);
await select('rod');
await openVisualSettings();
await pressSwatch(2);
const chosen = await painted();
const shared = await page.evaluate(() =>
  ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
);
check('the URL says the rod was asked', /KR/.test(shared), shared.slice(-40));
await page.goto(`${BASE}/?${shared}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
const reopened = await painted();
await shot('reopened');
check(
  'and it opens in exactly the two colors it was left in',
  reopened.barrel === chosen.barrel && reopened.rod === chosen.rod,
  JSON.stringify({ chosen, reopened })
);

// ------------------------------------------ 6. nothing in circulation moved
console.log('\nCylinder_Boom opens exactly as it did');
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
const boom = await painted();
await shot('cylinder-boom');
check(
  'its rod wears its barrel’s color, as it always has',
  boom.rod === boom.barrel && boom.stored.own === false,
  JSON.stringify(boom)
);
check(
  'even though the payload stores a different color for it',
  boom.stored.rod !== boom.stored.barrel,
  JSON.stringify(boom.stored)
);

// ------------------------------- 7. the start-pose ghost wears the same colors
//
// The ghost is the real linkage carried back to where the machine starts --
// "the same shapes in the same colors, at 22%" -- so it is a painter of a
// cylinder like any other, and it has to ask the same rule. It did not: it
// took each body's stored `fill`, and every cylinder in circulation stores a
// rod color that has never been drawn, so the faded part behind a navy ram was
// a mint-green rod in a lavender barrel.
console.log('\nthe ghost of the start pose is the same part, earlier');
const GHOST_OUT = 'artifacts/cylinder-ghost';
mkdirSync(GHOST_OUT, { recursive: true });
await page.goto(`${BASE}/?${payloads['Cylinder_Boom']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.waitForTimeout(400);
await page.screenshot({ path: `${GHOST_OUT}/00-at-the-start.png` });
// Parked a third of the way through the stroke, which is where the ghost
// appears at all: at the start pose there is nothing to be a ghost of.
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.seekMechanism(0, srv.mechanisms[0].cyclePeriod / 3);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${GHOST_OUT}/01-displaced.png` });

/** Each ghost body beside the live body it is a picture of. */
const ghosted = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const found = srv.sealedStructures()[0];
  // The paths are in DOM order, which is the order the bodies are listed in.
  // The command letters alone: the ghost is the same shape somewhere else, so
  // its numbers differ and its commands cannot.
  const shape = (d) => (d ?? '').replace(/[^A-Za-z]/g, '');
  const drawn = [...document.querySelectorAll('.ghostBody')].map((node) => ({
    fill: node.getAttribute('fill'),
    shape: shape(node.getAttribute('d')),
  }));
  const bodies = srv.startPoseGhosts()[0].bodies;
  const live = (selector) => ({
    fill: document.querySelector(selector)?.getAttribute('fill') ?? null,
    shape: shape(document.querySelector(selector)?.getAttribute('d')),
  });
  const at = (id) => drawn[bodies.findIndex((body) => body.linkId === id)] ?? null;
  return {
    barrel: { ghost: at(found.barrel.id), live: live('.cylinder-barrel') },
    rod: { ghost: at(found.rod.id), live: live('.cylinder-rod') },
    // The stored rod color, which is the one the ghost used to read.
    stored: found.rod.fill,
    bars: drawn.length,
  };
});
check(
  'the fixture is one that could show the bug: its rod stores a color it is not drawn in',
  ghosted.stored !== ghosted.live?.fill && ghosted.stored !== ghosted.rod.live.fill,
  JSON.stringify({ stored: ghosted.stored, drawn: ghosted.rod.live.fill })
);
check(
  'the ghost paints both members in the inks the part is wearing',
  ghosted.barrel.ghost?.fill === ghosted.barrel.live.fill &&
    ghosted.rod.ghost?.fill === ghosted.rod.live.fill,
  JSON.stringify(ghosted)
);
check(
  'and draws them as the part rather than as the two bars its joints describe',
  ghosted.barrel.ghost?.shape === ghosted.barrel.live.shape &&
    ghosted.rod.ghost?.shape === ghosted.rod.live.shape,
  JSON.stringify({ barrel: ghosted.barrel, rod: ghosted.rod })
);

// And a rod given a color of its own: the ghost follows the choice, not the
// record it was following a moment ago.
await select('rod');
await openVisualSettings();
// A swatch the barrel is not already wearing: this boom is drawn in the navy
// that swatch 2 hands out, and a rod given the color it is standing in would
// prove nothing.
await pressSwatch(5);
await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.seekMechanism(0, srv.mechanisms[0].cyclePeriod / 3);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${GHOST_OUT}/02-rod-recolored.png` });
const afterChoice = await page.evaluate(() => {
  const grid = ng.getComponent(document.querySelector('app-new-grid'));
  const srv = grid.mechanismSrv;
  const found = srv.sealedStructures()[0];
  const bodies = srv.startPoseGhosts()[0].bodies;
  const drawn = [...document.querySelectorAll('.ghostBody')].map((node) =>
    node.getAttribute('fill')
  );
  const at = (id) => drawn[bodies.findIndex((body) => body.linkId === id)] ?? null;
  return {
    rod: at(found.rod.id),
    barrel: at(found.barrel.id),
    liveRod: document.querySelector('.cylinder-rod')?.getAttribute('fill') ?? null,
    liveBarrel: document.querySelector('.cylinder-barrel')?.getAttribute('fill') ?? null,
  };
});
check(
  'the rod’s own color reaches the ghost too, and the barrel keeps its own',
  afterChoice.rod === afterChoice.liveRod &&
    afterChoice.barrel === afterChoice.liveBarrel &&
    afterChoice.rod !== afterChoice.barrel,
  JSON.stringify(afterChoice)
);

// ------------------------------------------------------------------ wrap up
check('nothing threw', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ results, consoleErrors }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
