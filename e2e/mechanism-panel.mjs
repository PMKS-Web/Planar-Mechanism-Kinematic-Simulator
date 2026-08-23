/**
 * Selecting a whole machine, rather than a part of one.
 *
 * The facts about a mechanism — its mobility, what drives it, how long a cycle
 * takes — used to appear in the setup drawer beside the blockers, which meant
 * the same six numbers in two places and no way to act on the mechanism as a
 * thing. They live in its own panel now, and this checks the two routes to it:
 * the transport chip while analysing, and the drawer's own name in either mode,
 * which is the only route Edit has.
 *
 *   PMKS_BASE_URL=<origin> node e2e/mechanism-panel.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://127.0.0.1:4200';
const source = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const payloads = Object.fromEntries(
  [...source.matchAll(/^ {2}'?([\w-]+)'?:\n {4}'([^']+)',$/gm)].map(([, id, p]) => [id, p])
);

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

const tab = (name) => page.locator('.tabButton', { hasText: name });
// The readiness chip is a sibling of the mode button inside `.tabSlot`, not a
// child of it — it used to be nested, which made it unreachable by keyboard.
const chipFor = (name) => page.locator('.tabSlot', { hasText: name }).locator('.chip');
const panelText = () =>
  page
    .locator('app-mechanism-panel')
    .innerText()
    .catch(() => '');

await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);

// --- the transport chip selects the machine it names ------------------------
await tab('Kinematic').click();
await page.waitForTimeout(800);
await page.locator('.mechChip').first().click();
await page.waitForTimeout(700);
let text = await panelText();
record(
  'the transport chip selects the whole mechanism',
  text.includes('Analysis for Mechanism M1'),
  text
);
record(
  'and the panel reports what it is',
  /Degrees of freedom[\s\S]*Driven joint[\s\S]*Cycle time/.test(text),
  text
);
record('with a line per link', (await page.locator('.linkRow').count()) >= 3);

// --- selecting the machine highlights all of it -----------------------------
const selected = await page.evaluate(() => {
  const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  return {
    joints: srv.joints.filter((j) => srv.getJointCSSClass(j) === 'joint-selected').length,
    links: srv.links.filter((l) => srv.getLinkCSSClass(l) === 'link-selected').length,
    total: { joints: srv.joints.length, links: srv.links.length },
  };
});
record(
  'every joint and link of it reads as selected, not just one',
  selected.joints === selected.total.joints && selected.links === selected.total.links,
  selected
);

// --- the same selection in Edit is the editable panel ------------------------
await tab('Edit').click();
await page.waitForTimeout(800);
text = await panelText();
record(
  'switching to Edit shows Edit Mechanism for the same selection',
  text.includes('Edit Mechanism M1'),
  text
);
record('which offers to delete it', text.includes('Delete'), text);

// --- and Edit has a route of its own ----------------------------------------
await page.evaluate(() => {
  const active = ng.getComponent(document.querySelector('app-new-grid')).activeObjService;
  active.updateSelectedObj(null);
});
await page.waitForTimeout(400);
record('deselecting clears the panel', (await panelText()) === '');

await chipFor('Kinematic').click();
await page.waitForTimeout(700);
await page.locator('.mechLink').first().click();
await page.waitForTimeout(700);
record(
  'the drawer name selects it too, which is the route Edit has',
  (await panelText()).includes('Mechanism M1'),
  await panelText()
);

// --- the facts appear once, not twice ---------------------------------------
const drawer = await page.locator('app-analysis-setup').innerText();
record(
  'and the drawer no longer repeats the facts',
  !drawer.includes('Degrees of freedom'),
  drawer
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
