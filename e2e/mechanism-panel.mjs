/**
 * Selecting a whole machine, rather than a part of one.
 *
 * The facts about a mechanism — its mobility, what drives it, how long a cycle
 * takes — used to appear in the setup drawer beside the blockers, which meant
 * the same six numbers in two places and no way to act on the mechanism as a
 * thing. They live in its own panel now, and this checks the two routes to it:
 * the transport chip while analyzing, and the drawer's own name in either mode,
 * which is the only route Edit has.
 *
 *   PMKS_BASE_URL=<origin> node e2e/mechanism-panel.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const shots = 'artifacts/degrees-of-freedom';
mkdirSync(shots, { recursive: true });

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';

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
// One button per mode now. Pressing a mode you can enter switches to it;
// pressing the mode you are already in toggles its setup drawer. So reaching
// the drawer for an enterable mode takes up to two presses, and this asks the
// drawer itself rather than counting clicks.
const setupTitleFor = (name) => (name === 'Force' ? 'Force Analysis setup' : 'Analysis setup');
const openSetupFor = async (name) => {
  for (let press = 0; press < 2; press++) {
    const showing = await page
      .locator('app-analysis-setup')
      .innerText()
      .catch(() => '');
    if (showing.includes(setupTitleFor(name))) return;
    await tab(name).click();
    await page.waitForTimeout(700);
  }
  const showing = await page
    .locator('app-analysis-setup')
    .innerText()
    .catch(() => '');
  if (!showing.includes(setupTitleFor(name))) {
    throw new Error(`the ${name} setup drawer never opened`);
  }
};
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

// The worked count is the one used by this machine's solver.
const explanation = page.locator('app-mobility-explanation');
const substitution = () => explanation.getByTestId('mobility-substitution').innerText();
record(
  'four-bar shows its substituted mobility equation',
  /3\(4 \u2212 1\) \u2212 2 \u00d7 4 \u2212 0 =\s*1/.test(await substitution())
);
record(
  'four-bar reports one DOF without a geometry adjustment',
  (await explanation.innerText()).includes('Reported DOF: 1') &&
    (await explanation.getByTestId('mobility-rescue').count()) === 0
);
await page.screenshot({ path: `${shots}/four-bar.png` });
const equations = explanation.getByRole('button', { name: 'Equations and Rules' });
await equations.focus();
const film = filmstrip(page, `${shots}/expansion`, { x: 0, y: 50, width: 415, height: 850 });
await film.during(25, 10, 'open-equations', () => equations.press('Enter'));
record(
  'keyboard opens both named equations',
  (await explanation.innerText()).includes("Kutzbach's planar equation") &&
    (await explanation.innerText()).includes("Gr\u00fcbler's lower-pair form")
);
await equations.press('Enter');
await explanation.getByRole('button', { name: 'Bodies and Joints' }).click();
record(
  'joint contribution table sums four lower pairs',
  (await explanation.locator('tfoot').innerText()).includes('4')
);
await page.screenshot({ path: `${shots}/joint-contributions.png` });
await explanation.getByRole('button', { name: 'Bodies and Joints' }).click();
await contactSheet(`${shots}/expansion/*.png`, `${shots}/expansion.png`, 5);

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

await openSetupFor('Kinematic');
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

// Use the published fixture URL so this special case remains reviewable.
const gallery = readFileSync(new URL('../docs/fixture-urls.md', import.meta.url), 'utf8');
const redundantUrl = gallery.match(/\[Parallelogram with a third parallel crank\]\(([^)]+)\)/)[1];
await page.goto(`${BASE}/?${redundantUrl.split('?')[1]}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await page.locator('.mechChip').first().click();
record(
  'redundant crank retains the zero count',
  /3\(5 \u2212 1\) \u2212 2 \u00d7 6 \u2212 0 =\s*0/.test(await substitution())
);
record(
  'redundant crank explains the geometry rescue to one DOF',
  (await explanation.getByTestId('mobility-rescue').innerText()).includes('geometry check finds 1')
);
await page.screenshot({ path: `${shots}/geometry-rescue.png` });

// The explanation must fit the narrow Edit card and the phone sheet.
await tab('Edit').click();
await page.screenshot({ path: `${shots}/edit.png` });
record(
  'Edit card keeps the equation inside its width',
  await explanation.evaluate((host) => host.scrollWidth <= host.clientWidth + 1)
);
await page.setViewportSize({ width: 390, height: 844 });
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.locator('.sheetHandle').click();
await explanation.getByTestId('mobility-substitution').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${shots}/phone.png` });
record(
  'phone shows the worked equation with reduced motion',
  await explanation.getByTestId('mobility-substitution').isVisible()
);
record(
  'phone has no horizontal equation overflow',
  await explanation.evaluate((host) => host.scrollWidth <= host.clientWidth + 1)
);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
