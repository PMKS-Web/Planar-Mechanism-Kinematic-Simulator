/** Focused browser regressions for the PR 33 visual and copy follow-ups. */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { openMechanism } from './app-ready.mjs';
import { TEMPLATE_LINKAGES as payloads } from './template-payloads.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/pr33-followups';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
}
const field = (name) => page.getByRole('textbox', { name, exact: true });
async function enter(name, value) {
  await field(name).fill(value);
  await field(name).press('Tab');
}
async function settings() {
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.locator('.menuItem', { hasText: 'Settings' }).click();
}
async function openExport() {
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
}

await openMechanism(page, BASE);
const mouseHelp = await page.locator('#editWrapper .helpHints').innerText();
check(
  'desktop help names only right-click',
  /Right-click/.test(mouseHelp) && !/press and hold/i.test(mouseHelp),
  mouseHelp
);

await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
await page.getByRole('button', { name: /Motion — 3 positions/ }).click();
await enter('Position 1 X', '1 cm');
await enter('Position 1 Y', '1 cm');
await enter('Position 1 angle', '0 deg');
await page.getByRole('button', { name: 'Duplicate Last Position' }).click();
const header = await page
  .locator('#synthesisPanel .panel-header__actions')
  .filter({ hasText: 'Add Position' })
  .evaluate((host) => {
    const buttons = [...host.querySelectorAll('button-block button')];
    return buttons.map((button) => {
      const box = button.getBoundingClientRect();
      const icon = button.querySelector('mat-icon').getBoundingClientRect();
      return {
        height: box.height,
        font: parseFloat(getComputedStyle(button).fontSize),
        iconOffset: (icon.left + icon.right - box.left - box.right) / 2,
      };
    });
  });
check(
  'position actions are compact and the copy glyph is centered',
  header.length === 2 &&
    header.every((item) => item.height <= 30 && item.font <= 13) &&
    Math.abs(header[1].iconOffset) < 1.5,
  header
);
await page.screenshot({ path: `${OUT}/position-actions.png` });

await page.getByRole('button', { name: 'Edit', exact: true }).click();
await settings();
const unitFilm = filmstrip(page, `${OUT}/meter-film`);
await unitFilm.during(70, 8, 'switch', () =>
  page.getByRole('button', { name: 'SI (m)', exact: true }).click()
);
await page.getByRole('button', { name: 'Close', exact: true }).click();
await page.locator('#settingsWrapper').waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'Synthesis', exact: true }).click();
await page.locator('#synthesisPanel').waitFor({ state: 'visible' });
await page.waitForTimeout(450); // Let the panel slide finish before taking the static evidence image.
const outlines = await page.locator('.synthChipDot').evaluateAll((dots) =>
  dots.map((dot) => {
    const matrix = dot.getScreenCTM();
    return Number(dot.getAttribute('stroke-width')) * Math.hypot(matrix.a, matrix.b);
  })
);
check(
  'synthesis position outlines remain about one pixel in meters',
  outlines.length === 2 && outlines.every((px) => px > 0.7 && px < 1.4),
  outlines
);
await page.screenshot({ path: `${OUT}/meter-positions.png` });
await contactSheet(`${OUT}/meter-film/*-switch.png`, `${OUT}/meter-film.png`, 4);

await openMechanism(page, `${BASE}/?${payloads['4-Bar']}`);
await page.locator('#linkHolder path').nth(1).click({ force: true });
await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
await page.getByRole('tab', { name: 'Center of mass', exact: true }).click();
const analysis = await page.locator('app-analysis-panel').evaluate((host) => {
  const chips = [...host.querySelectorAll('.drawingChips .viewButton')];
  const labels = [...host.querySelectorAll('.drawingChips .viewButtonLabel')];
  const heading = host.querySelector('.panelTitleText');
  const comRows = host.querySelector('.rowList--com');
  const switches = host.querySelector('.drawingSwitches');
  const rowNames = [...comRows.querySelectorAll('.graphTitle')];
  const rowButtons = [...comRows.querySelectorAll('.graphHeader')];
  const controlsHead = switches.querySelector('.drawingSwitchesHead');
  const leftEdges = [heading, ...rowNames, controlsHead, switches.querySelector('.viewButton')].map(
    (node) => node.getBoundingClientRect().left
  );
  return {
    rows: new Set(chips.map((node) => Math.round(node.getBoundingClientRect().top))).size,
    labelsFit: labels.every((node) => node.clientWidth >= node.scrollWidth),
    heading: heading?.textContent.trim(),
    headingSize: heading && parseFloat(getComputedStyle(heading).fontSize),
    rowNames: rowNames.map((node) => node.textContent.replace('help_outline', '').trim()),
    fullNames: rowButtons.map((node) => node.getAttribute('aria-label')),
    leftSpread: Math.max(...leftEdges) - Math.min(...leftEdges),
    rowSize: parseFloat(getComputedStyle(rowNames[0]).fontSize),
    controlsSize: parseFloat(getComputedStyle(controlsHead).fontSize),
    comRule: comRows && getComputedStyle(comRows, '::after').display,
    switchRule: switches && getComputedStyle(switches).borderTopWidth,
  };
});
check(
  'CoM panel places three fully named switches in one row',
  analysis.rows === 1 && analysis.labelsFit,
  analysis
);
check(
  'CoM tab uses the same aligned graph rows and drawing controls',
  analysis.heading.startsWith('Kinematics for Link') &&
    analysis.headingSize === 20 &&
    analysis.rowNames.join('|') === 'Position|Velocity|Acceleration' &&
    analysis.fullNames.every((name) => name.startsWith('Center of mass ')) &&
    analysis.leftSpread < 1.5 &&
    analysis.rowSize === 13.5 &&
    analysis.controlsSize < analysis.rowSize &&
    analysis.comRule === 'block' &&
    analysis.switchRule === '0px',
  analysis
);
await page.locator('.drawingChips').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/analysis-wide.png` });

await page.setViewportSize({ width: 390, height: 844 });
const expand = page.getByRole('button', { name: 'Expand the panel', exact: true });
if (await expand.isVisible()) await expand.click();
await page.locator('.drawingChips').scrollIntoViewIfNeeded();
const narrow = await page.locator('.drawingChips').evaluate((host) => ({
  rows: new Set(
    [...host.querySelectorAll('.viewButton')].map((node) =>
      Math.round(node.getBoundingClientRect().top)
    )
  ).size,
  labelsFit: [...host.querySelectorAll('.viewButtonLabel')].every(
    (node) => node.clientWidth >= node.scrollWidth
  ),
}));
check(
  'three CoM switches remain legible on a narrow panel',
  narrow.rows === 1 && narrow.labelsFit,
  narrow
);
await page.screenshot({ path: `${OUT}/analysis-narrow.png` });
await page.setViewportSize({ width: 1280, height: 900 });

await openExport();
const exportPanel = page.locator('app-export-panel');
await exportPanel.getByRole('button', { name: 'Select All', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Next', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Select None', exact: true }).click();
const noForceHint = await exportPanel.locator('.quantityHint').innerText();
check(
  'kinematics-only export hint does not suggest returning to kinematics',
  noForceHint === 'Select at least one quantity to export.',
  noForceHint
);
const componentRow = await exportPanel.locator('.barRow--components').evaluate((host) => {
  const name = host.querySelector('.settingName').getBoundingClientRect();
  const pick = host.querySelector('segmented-block').getBoundingClientRect();
  return {
    label: host.querySelector('.settingName').textContent.trim(),
    sameLine: Math.abs(name.top - pick.top) < 12,
    fits: host.scrollWidth <= host.clientWidth + 1,
  };
});
check(
  'export components and choices share one line',
  componentRow.label === 'Components' && componentRow.sameLine && componentRow.fits,
  componentRow
);
await page.screenshot({ path: `${OUT}/export-components.png` });

await openMechanism(page, `${BASE}/?${payloads['Punch_Press']}`);
await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
await openExport();
await exportPanel.getByRole('button', { name: 'Select All', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Next', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Select None', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Next', exact: true }).click();
await exportPanel.getByRole('button', { name: 'Select None', exact: true }).click();
const forceHint = await exportPanel.locator('.quantityHint').innerText();
check(
  'force export alone explains the route back to kinematic quantities',
  /go back to choose kinematic quantities/.test(forceHint),
  forceHint
);

const touch = await browser.newContext({
  viewport: { width: 900, height: 800 },
  isMobile: true,
  hasTouch: true,
});
await startQuiet(touch);
const tablet = await touch.newPage();
await openMechanism(tablet, BASE);
const touchHelp = await tablet.locator('#editWrapper .helpHints').innerText();
check(
  'wide touch device names only press and hold',
  /Press and hold/.test(touchHelp) && !/Right-click/.test(touchHelp),
  touchHelp
);
await touch.close();

check('no browser errors', errors.length === 0, errors);
await context.close();
await browser.close();
console.log(`${checks.filter((item) => item.ok).length}/${checks.length} checks passed`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
