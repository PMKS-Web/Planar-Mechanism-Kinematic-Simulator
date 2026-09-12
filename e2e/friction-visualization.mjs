import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4317';
const out = path.resolve('artifacts/friction-visualization');
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((line) => line.startsWith(`| [${name}]`))
    .split('](')[1]
    .split(')')[0]
    .split('?')[1];
const version = readFileSync('src/app/model/whats-new.ts', 'utf8').match(
  /WHATS_NEW_VERSION = '([^']+)'/
)[1];
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript((version) => {
  localStorage.setItem('whatsNewSeen', version);
  localStorage.setItem('tutorialSeen', 'true');
}, version);
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
const record = (name, condition) => {
  assert.ok(condition, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
const filmDir = path.resolve(out, 'filmstrip');
assert.ok(filmDir.startsWith(out + path.sep));
const film = filmstrip(page, filmDir);
const glyph = (id) => page.locator(`[data-friction-contact="${id}"]`);
async function select(id) {
  // The pin is selected through the same service as the canvas; all edits below use native controls.
  await page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((j) => j.id === id));
  }, id);
}
async function edit(id) {
  await select(id);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const panel = page.locator('app-edit-panel app-friction-panel');
  const field = panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true });
  if (
    (await panel.getByRole('button', { name: /^Friction/ }).getAttribute('aria-expanded')) !==
    'true'
  )
    await panel.getByRole('button', { name: /^Friction/ }).click();
  await field.waitFor();
  await panel.locator('.panel-content.settled').waitFor();
  if (await field.isDisabled()) {
    await page.getByRole('button', { name: 'return to the start', exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('app-edit-panel app-friction-panel input')?.disabled
    );
  }
  return panel;
}
async function analysis() {
  await page.getByRole('button', { name: /^Force Analysis/ }).click();
  const panel = page.locator('app-analysis-panel app-friction-panel');
  if (
    (await panel.getByRole('button', { name: /^Friction/ }).getAttribute('aria-expanded')) !==
    'true'
  )
    await panel.getByRole('button', { name: /^Friction/ }).click();
  await panel.locator('.panel-content.settled').waitFor();
  return panel;
}
try {
  await openMechanism(page, `${base}/?${payload('Slider-crank with friction')}`);
  let panel = await edit('C');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  record(
    'Disabled friction has an explicit Off state',
    (await panel.locator('.state-chip').innerText()) === 'Off'
  );
  record(
    'Disabled friction has no contact or actuator results',
    (await panel.locator('dl').count()) === 0
  );
  await panel.getByRole('textbox', { name: 'Static Coefficient', exact: true }).fill('0.3');
  await panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true }).fill('0.2');
  await film.during(60, 6, 'save', () =>
    panel.getByRole('button', { name: 'Save Friction Settings' }).click()
  );
  record(
    'Saving friction visibly confirms the change',
    (await panel.innerText()).includes('Friction settings saved.')
  );
  record(
    'Enabled state persists in the section header',
    (await panel.locator('.state-chip').innerText()) === 'Enabled'
  );
  record('Edit mode does not draw calculated friction overlays', (await glyph('D').count()) === 0);
  panel = await analysis();
  await glyph('D').waitFor();
  record(
    'Guide results identify sliding and the coupled normal load',
    (await panel.innerText()).includes('Sliding') && (await panel.innerText()).includes('93.75 N')
  );
  record(
    'Guide friction is shown separately from the additional input torque',
    (await panel.locator('.contact').innerText()).includes('18.75 N') &&
      (await panel.locator('.input-comparison').innerText()).includes('50 N·cm')
  );
  record(
    'Input comparison includes without, with and additional friction',
    (await panel.locator('.input-comparison dt').allTextContents()).length === 3
  );
  record(
    'Slider glyph lies along the guide and acts on its block',
    Number(await glyph('D').getAttribute('data-fx')) > 0 &&
      Math.abs(Number(await glyph('D').getAttribute('data-fy'))) < 1e-9 &&
      (await glyph('D').getAttribute('data-body')) === 'CD'
  );
  record(
    'Calculated load uses a dashed analysis arrow and friction label',
    !!(await glyph('D').locator('.friction-vector').getAttribute('stroke-dasharray')) &&
      (await glyph('D').locator('text').textContent()).includes('Friction')
  );
  await page.screenshot({ path: path.join(out, 'slider-analysis.png') });
  const initialPath = await glyph('D').locator('.friction-vector').getAttribute('d');
  await film.during(100, 10, 'motion', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  record(
    'Current-sample friction vector updates during motion',
    initialPath !== (await glyph('D').locator('.friction-vector').getAttribute('d'))
  );
  // Return to the same pose before reversing the prescribed drive.
  await page.locator('button.stopButton').click();
  await page.waitForFunction(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.isAtStartPose()
  );
  const before = Number(await glyph('D').getAttribute('data-fx'));
  await film.during(80, 6, 'reverse-guide', () =>
    page.getByRole('button', { name: 'Reverse M1', exact: true }).click()
  );
  record(
    'Reversing relative sliding reverses the contact arrow',
    before * Number(await glyph('D').getAttribute('data-fx')) < 0
  );
  await panel.getByRole('button', { name: 'Show Friction on Drawing' }).click();
  record(
    'Visibility switch hides loads without disabling the contact',
    (await glyph('D').count()) === 0 &&
      (await panel.locator('.state-chip').innerText()) === 'Enabled'
  );
  await panel.getByRole('button', { name: 'Show Friction on Drawing' }).click();
  await glyph('D').waitFor();
  panel = await edit('C');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  await analysis();
  record('Disabling slider friction removes its canvas arrow', (await glyph('D').count()) === 0);
  const baseline = await page.evaluate(() => {
    const mech = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0];
    const frame = mech.getForceAnalysis('static').frames[0];
    return {
      effort: frame.inputEffort.valueSI,
      friction: !!frame.friction,
      additional: !!frame.additionalFrictionEffort,
    };
  });
  record(
    'Disabling friction restores the frictionless force solution',
    !baseline.friction && !baseline.additional && Math.abs(baseline.effort) < 1e-8
  );

  await openMechanism(page, `${base}/?${payload('Pin bearing with friction')}`);
  panel = await edit('A');
  record(
    'Bearing settings show the effective radius',
    (await panel.getByRole('textbox', { name: 'Effective Radius' }).inputValue()) === '0.5'
  );
  panel = await analysis();
  await glyph('A').waitFor();
  record(
    'Bearing has a radial load and calculated resisting torque',
    (await panel.innerText()).includes('Radial Load') &&
      (await panel.innerText()).includes('-10 N·cm')
  );
  const sweep = Number(await glyph('A').getAttribute('data-sweep'));
  record(
    'Bearing is drawn as a clockwise moment rather than a linear arrow',
    sweep < 0 && (await glyph('A').getAttribute('data-kind')) === 'torque'
  );
  await page.screenshot({ path: path.join(out, 'bearing-analysis.png') });
  await film.during(80, 6, 'reverse-bearing', () =>
    page.getByRole('button', { name: 'Reverse M1', exact: true }).click()
  );
  record(
    'Reversing the input reverses bearing friction torque',
    sweep * Number(await glyph('A').getAttribute('data-sweep')) < 0
  );
  panel = await edit('A');
  await panel.getByRole('button', { name: 'Disable Friction', exact: true }).click();
  await analysis();
  record('Disabling bearing friction removes its moment glyph', (await glyph('A').count()) === 0);

  await openMechanism(page, `${base}/?${payload('Combined slider and bearing friction')}`);
  await edit('C');
  panel = await analysis();
  record(
    'Combined friction shows one distinct glyph for each contact',
    (await page.locator('[data-friction-contact]').count()) === 2
  );
  record(
    'Combined contact panel shows the mechanism-level input comparison once',
    (await panel.locator('.input-comparison').count()) === 1
  );
  await page.screenshot({ path: path.join(out, 'combined-analysis.png') });

  await openMechanism(page, `${base}/?${payload('Bearing friction with inertia safeguard')}`);
  await edit('A');
  panel = await analysis();
  await film.during(80, 6, 'in-motion-refusal', () =>
    page.getByText('In-motion', { exact: true }).click()
  );
  await panel.getByText('Friction Results Unavailable', { exact: true }).waitFor();
  record(
    'In-motion diagnostic explains withheld results and the available alternative',
    (await panel.innerText()).includes('scaling error') &&
      (await panel.innerText()).includes('Use Static analysis')
  );
  record(
    'Refused In-motion analysis draws no friction loads or plausible numeric results',
    (await page.locator('[data-friction-contact]').count()) === 0 &&
      (await panel.locator('dl').count()) === 0
  );
  await page.screenshot({ path: path.join(out, 'in-motion-unavailable.png') });
  record('No uncaught browser errors', errors.length === 0);
} finally {
  await page.screenshot({ path: path.join(out, 'last-state.png') });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
