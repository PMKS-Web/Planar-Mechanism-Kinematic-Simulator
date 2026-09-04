/**
 * The words themselves, read off the running app.
 *
 * A copy rule is only kept if something checks it, and nothing did: the vocabulary
 * in `docs/ui-vocabulary.md` lived beside code that still said "Make Circular",
 * "Show Joint Path" and "over-constraining the linkage". This walks the surfaces
 * that carry the most prose — the Edit panel's state toggles, Settings, the view
 * switches, the analysis checklist, the two dialogs — and fails on the words the
 * guide bans rather than on a screenshot nobody reads.
 *
 *   PMKS_BASE_URL=<origin> node e2e/ui-copy.mjs
 */

import { readFileSync } from 'node:fs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { ALL_LINKAGES as payloads } from './template-payloads.mjs';

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

/** Every word the guide rules out of the UI, and what it should have said. */
const BANNED = [
  [/\blinkages?\b/i, 'linkage — say mechanism'],
  [/\bmounts?\b/i, 'mount — a code word; a cylinder has two joints'],
  // Narrower than the guide's own wording, on purpose. A slider-crank engine
  // really does have a piston and a shaper really does have a ram; what is
  // banned is either word standing in for *cylinder*, and only the cylinder
  // sense is worth failing a build over.
  [/\b(driven|guided|hydraulic)\s+rams?\b/i, 'ram — say cylinder'],
  [/\bram\s+(mount|barrel|rod|joint)/i, 'ram — say cylinder'],
  [/\bsimulation\b/i, 'simulation — say animation'],
  [/\bactuator\b/i, 'actuator — say driven'],
  [/\bcolour\b/i, 'colour — spell American'],
  [/\bcentred?\b/i, 'centred/centre — spell American'],
  [/\bneighbour/i, 'neighbour — spell American'],
  [/\banalyse[ds]?\b/i, 'analyse — spell American'],
  [/\bTODO\b/, 'TODO placeholder'],
  [/not available yet/i, 'not available yet — say "Not built yet."'],
  [/\bT\s*=\s*0\b/, 'T=0 — the app calls it the start'],
];

/** Read every tooltip on the page by opening each one in turn. */
async function tooltipsOf(scope) {
  const marks = page.locator(`${scope} [matTooltip], ${scope} .label-help, ${scope} .row__help`);
  const found = [];
  for (let i = 0; i < (await marks.count()); i++) {
    const mark = marks.nth(i);
    if (!(await mark.isVisible().catch(() => false))) continue;
    await mark.hover().catch(() => {});
    const tip = await page
      .locator('.mat-mdc-tooltip')
      .first()
      .innerText()
      .catch(() => '');
    if (tip.trim()) found.push(tip.trim());
    await page.mouse.move(0, 0);
  }
  return found;
}

/**
 * Fail the given prose against the banned list.
 *
 * Reported as the offending phrase and forty characters either side, never as
 * the whole surface: a failure that prints the entire mechanism library is one
 * nobody reads to the end, which is the same fault this script is about.
 */
function screen(where, texts) {
  const hits = [];
  for (const text of texts) {
    for (const [pattern, why] of BANNED) {
      const found = text.match(pattern);
      if (!found) continue;
      const at = found.index ?? 0;
      hits.push({ why, near: text.slice(Math.max(0, at - 40), at + found[0].length + 40) });
    }
  }
  record(`${where} uses none of the banned words`, hits.length === 0, hits);
}

async function open(payload) {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page);
}

const tab = (name) => page.locator('.tabButton', { hasText: name }).first();

/** The centre of a joint's own marker, which is what the canvas hit-tests. */
const centreOf = (id) =>
  page.evaluate((jointId) => {
    const el = document.querySelector(`#joint_${jointId}`)?.closest('svg[x]');
    const box = el.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }, id);

const clickJoint = async (id) => {
  const at = await centreOf(id);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
};

const openProjectMenu = () => page.locator('.topStrip .iconButton').first().click();

// --- the Edit panel's joint section -----------------------------------------
await open(payloads['4-Bar']);
await tab('Edit').click();
await page.waitForTimeout(600);
await clickJoint('B');

const jointLabels = await page.locator('app-edit-panel toggle-block .row').allInnerTexts();
const jointText = jointLabels.map((t) => t.trim().split('\n')[0]);
record(
  'the joint toggles are named after the state, as the right-click menu is',
  ['Grounded', 'Slider', 'Welded'].every((label) => jointText.some((t) => t.startsWith(label))),
  jointText
);
record(
  'the path switch is Trace Path here too, not "Show Joint Path"',
  !jointText.some((t) => t.includes('Show Joint Path')),
  jointText
);
// Behind a collapsed section, which is also where its tooltip lives.
await page
  .locator('app-edit-panel collapsible-subseciton', { hasText: 'Visual Settings' })
  .locator('.panel-header__toggle')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(400);
const jointColorMark = page.locator('app-edit-panel color-picker .label-help').first();
if (await jointColorMark.isVisible().catch(() => false)) {
  await jointColorMark.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/ui-copy/tip-joint-color.png' });
  await page.mouse.move(0, 0);
}

const editTips = await tooltipsOf('app-edit-panel');
record(
  'no Edit panel tooltip runs past two sentences',
  editTips.every((t) => (t.match(/[.!?](\s|$)/g) ?? []).length <= 2),
  editTips.filter((t) => (t.match(/[.!?](\s|$)/g) ?? []).length > 2)
);
screen('the Edit panel', [...editTips, ...jointText]);

// --- the Edit panel's link section ------------------------------------------
const linkBox = await page.locator('#linkHolder path[id]').first().boundingBox();
await page.mouse.move(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
await page.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);
await page.waitForTimeout(500);
const shape = await page
  .locator('app-edit-panel .shapeToggle')
  .innerText()
  .catch(() => '');
record(
  'the shape button says Draw as a Disc rather than reaching for "Make"',
  /Draw as a (Disc|Bar)/.test(shape) && !/Make /.test(shape),
  shape
);

// --- Settings ----------------------------------------------------------------
await openProjectMenu();
await page.locator('.menuItem', { hasText: 'Settings' }).first().click();
await page.waitForTimeout(700);
for (const [name, label] of [
  ['gravity', 'Gravity'],
  ['angle-units', 'Angle Units'],
  ['object-scale', 'Object Scale'],
]) {
  const mark = page
    .locator('app-settings-panel .row', { hasText: label })
    .locator('.label-help')
    .first();
  if (!(await mark.isVisible().catch(() => false))) continue;
  await mark.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `artifacts/ui-copy/tip-${name}.png` });
  await page.mouse.move(0, 0);
}

const settingsTips = await tooltipsOf('app-settings-panel');
record('Settings tooltips are readable', settingsTips.length > 0, settingsTips.length);
screen('Settings', settingsTips);
record(
  'the alignment-snap tooltip parses as a sentence',
  settingsTips.some((t) =>
    /^Dragging squares a joint up with one it is nearly level with\./.test(t)
  ),
  settingsTips.filter((t) => t.startsWith('Dragging squares'))
);

// --- the view switches -------------------------------------------------------
// --- the units note, which should only be there when it can help ------------
const unitsTip = async () => {
  const mark = page
    .locator('app-settings-panel .row', { hasText: 'Angle Units' })
    .locator('.label-help')
    .first();
  // Away first, and long enough for whatever was open to close: a tooltip left
  // over from the mode button reads as this one's answer otherwise.
  await page.mouse.move(700, 500);
  await page.waitForTimeout(700);
  await mark.hover({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);
  const tip = await page
    .locator('.mat-mdc-tooltip')
    .first()
    .innerText()
    .catch(() => '');
  await page.mouse.move(0, 0);
  return tip;
};
const inEdit = await unitsTip();
record(
  'the units tooltip does not tell a reader in Edit mode to switch to Edit mode',
  !/Switch to Edit/.test(inEdit),
  inEdit
);
await tab('Kinematic').click();
await page.waitForTimeout(700);
const inAnalysis = await unitsTip();
// A clause, not a second sentence. The note used to paste the permission
// model's whole refusal in here, which restated what the tooltip's own first
// line had already said before naming a way out; what a grayed switch owes the
// reader is the way out. Which way is still the model's answer -- the note used
// to read a master-only playing flag, so an unsynced row running in Edit was
// told to switch to Edit mode while standing in it.
record(
  'and does say the way out once the switch is actually greyed',
  /^The unit for angles/.test(inAnalysis) && /Switch to Edit mode to change\.$/.test(inAnalysis),
  inAnalysis
);
await page.screenshot({ path: 'artifacts/ui-copy/tip-angle-units-locked.png' });
await tab('Edit').click();
await page.waitForTimeout(500);

// The other half of the same clause: in Edit, parked away from the start, the
// way out is the transport rather than the mode.
await page.evaluate(() => {
  const srv = window.ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
  srv.seekMechanism(0, srv.mechanisms[0].cyclePeriod / 3);
});
await page.waitForTimeout(700);
const midCycle = await unitsTip();
record(
  'and sends a reader parked mid-cycle to the start rather than to Edit',
  /^The unit for angles/.test(midCycle) && /Return to the start pose to change\.$/.test(midCycle),
  midCycle
);
await page
  .getByRole('button', { name: /Stop|start/i })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(500);

const viewTips = await page
  .locator('app-view-controls button')
  .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
record(
  'the view switches are Title Case, as controls are',
  viewTips.every((label) => !label || !/\b(joint IDs|traced paths)\b/.test(label)),
  viewTips
);

// --- what answers for a mechanism that cannot run ---------------------------
// Taking the input off a four-bar is the shortest way to a drawing that will not
// solve. Nothing is written into the analysis panel about it any more: the mode
// button refuses to enter and opens the setup drawer instead, which names the
// blocker per mechanism rather than listing six general conditions.
await open(payloads['4-Bar']);
await tab('Edit').click();
for (const id of ['A', 'B', 'C', 'D']) {
  await clickJoint(id);
  const button = page.locator('app-edit-panel button-block', { hasText: 'Remove Input' }).first();
  if (await button.count()) {
    await button.click();
    break;
  }
}
await page.waitForTimeout(500);
await tab('Kinematic').click();
await page.waitForTimeout(800);

record(
  'pressing Kinematic on an unsolvable drawing opens the setup drawer, not the mode',
  (await page.locator('app-analysis-panel').count()) === 0,
  await page
    .locator('app-left-tabs')
    .innerText()
    .catch(() => '')
);
const drawer = await page
  .locator('app-analysis-setup')
  .innerText()
  .catch(() => '');
record(
  'and the drawer names the blocker for the mechanism at fault',
  /Nothing drives this mechanism/.test(drawer),
  drawer.slice(0, 240)
);
screen('the setup drawer', [drawer]);
await page.screenshot({ path: 'artifacts/ui-copy/unsolvable-drawing.png' });

// The old mobility checklist lived in the analysis panel and rendered on the
// same predicate that stops the mode being entered, so it could not be reached.
// It is gone; this is what keeps it from growing back.
record(
  'no mobility checklist has grown back in the analysis panel',
  !/#_of_|defined as a input|doubles as a ground joint/.test(
    readFileSync('src/app/component/analysis-panel/analysis-panel.component.html', 'utf8')
  )
);

// --- the library dialog ------------------------------------------------------
await openProjectMenu();
await page.locator('.projectMenu #templatesButton').click();
await page.waitForTimeout(800);
const library = await page
  .locator('#templates')
  .innerText()
  .catch(() => '');
screen('the mechanism library', [library]);
await page.keyboard.press('Escape');

console.log(`\nconsole errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));

await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
