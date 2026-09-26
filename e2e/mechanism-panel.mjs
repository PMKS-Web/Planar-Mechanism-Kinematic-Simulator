/**
 * A whole machine, rather than a part of one.
 *
 * With nothing selected, the left panel is about a machine: Edit's shows its
 * name to change, its links and Delete; the analysis modes' show its facts,
 * its links' jobs and the What Is This? note. Picking a machine -- its row in
 * the transport, its name in the setup drawer, or the switcher when there are
 * several -- no longer paints every part of it as selected, which left nothing
 * for the panel's part links to point at; the other machines step back
 * instead, and with one machine nothing on the grid changes at all.
 *
 *   PMKS_BASE_URL=<origin> node e2e/mechanism-panel.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

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

const editText = () =>
  page
    .locator('app-edit-mechanism-panel')
    .innerText()
    .catch(() => '');
/** How many joints and links wear each state class. */
const classes = () =>
  page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const count = {};
    for (const part of [...srv.joints, ...srv.links]) {
      const kind = (part.links ? srv.getJointCSSClass(part) : srv.getLinkCSSClass(part)).split(
        ' '
      )[0];
      count[kind] = (count[kind] ?? 0) + 1;
    }
    return count;
  });
const clearSelection = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(null);
    ng.applyChanges(grid);
  });

// --- one machine: the panel is about it without anything being picked --------
await page.goto(`${BASE}/?${payloads['4-Bar']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await tab('Kinematic').click();
await page.waitForTimeout(800);
let text = await panelText();
record('with nothing selected, analysis shows the machine', text.includes('Mechanism M1'), text);
record(
  'and reports what it is',
  /Degrees of freedom[\s\S]*Input joint[\s\S]*Cycle time/.test(text),
  text
);
record('with a line per link', (await page.locator('app-mechanism-panel .linkRow').count()) >= 3);
record('and the note', text.includes('What Is This?'), text);
record('with one machine there is nothing to switch between', !text.includes('M2'), text);

await page.locator('.mechChip').first().click();
await page.waitForTimeout(700);
let seen = await classes();
record(
  'picking the only machine changes nothing on the grid',
  !seen['joint-selected'] && !seen['link-selected'] && !seen['joint-muted'] && !seen['link-muted'],
  seen
);

// --- Edit's own panel ---------------------------------------------------------
await tab('Edit').click();
await page.waitForTimeout(800);
text = await editText();
record('Edit shows Edit Mechanism for it', text.includes('Edit Mechanism M1'), text);
record('which offers Rename', text.includes('Rename'), text);
record('and no note, which is for the analysis modes', !text.includes('What Is This?'), text);
await clearSelection();
await page.waitForTimeout(400);
record(
  'clicking away in Edit still shows the machine, with the ways to build on it',
  (await editText()).includes('Edit Mechanism M1') &&
    (await page.locator('app-edit-panel').innerText()).includes('Right-click the grid'),
  await page.locator('app-edit-panel').innerText()
);

// --- a name ------------------------------------------------------------------
await page.locator('app-edit-mechanism-panel button', { hasText: 'Rename' }).click();
await page.locator('#title-input-box').fill('Wiper drive');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
record('a machine can be named', (await editText()).includes('Edit Wiper drive'), await editText());
await tab('Kinematic').click();
await page.waitForTimeout(700);
text = await panelText();
record(
  'and the analysis panel calls it by its name, with its code for the playback row',
  text.includes('Wiper drive') && text.includes('M1'),
  text
);
await tab('Edit').click();
await page.waitForTimeout(500);
await page.locator('body').click({ position: { x: 1100, y: 700 } });
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForTimeout(700);
record(
  'and one Undo takes the name back',
  (await editText()).includes('Edit Mechanism M1'),
  await editText()
);

// --- several machines: the others step back -----------------------------------
await page.goto(`${BASE}/?${payloads['Pumping_Field']}`, { waitUntil: 'domcontentloaded' });
await waitForReady(page);
await tab('Kinematic').click();
await page.waitForTimeout(800);
const switcher = page.locator('app-mechanism-panel app-mechanism-switcher button');
record('several machines get a switcher', (await switcher.count()) === 3, await switcher.count());
await switcher.nth(1).click();
await page.waitForTimeout(700);
text = await panelText();
seen = await classes();
record('the switcher picks one', text.includes('Mechanism M2'), text);
record(
  'and the others step back rather than it lighting up',
  seen['joint-muted'] > 0 &&
    seen['link-muted'] > 0 &&
    !seen['joint-selected'] &&
    !seen['link-selected'],
  seen
);
await page.locator('app-mechanism-panel part-link button').first().hover();
await page.waitForTimeout(300);
seen = await classes();
record(
  'so a part link in its panel still lights its part',
  (seen['link-pointed'] ?? 0) + (seen['joint-pointed'] ?? 0) === 1,
  seen
);
await page.mouse.move(1100, 700);

await openSetupFor('Kinematic');
await page.waitForTimeout(700);
await page.locator('.mechLink').nth(2).click();
await page.waitForTimeout(700);
record(
  'the drawer name picks a machine too',
  (await panelText()).includes('Mechanism M3'),
  await panelText()
);

// --- the facts appear once, not twice ---------------------------------------
const drawer = await page.locator('app-analysis-setup').innerText();
record('and the drawer does not repeat the facts', !drawer.includes('Degrees of freedom'), drawer);

record('nothing threw', errors.length === 0, errors.slice(0, 3));

await browser.close();
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
