import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openMechanism } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4317';
const out = path.resolve('artifacts/friction');
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
const browser = await chromium.launch({
  channel: process.env.PMKS_CHROME ? undefined : 'chrome',
  executablePath: process.env.PMKS_CHROME,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript((version) => {
  localStorage.setItem('whatsNewSeen', version);
  localStorage.setItem('tutorialSeen', 'true');
}, version);
const page = await context.newPage();
const errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
const record = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log(`PASS ${name}`);
};
const select = async (id) => {
  await page.evaluate((id) => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((one) => one.id === id));
  }, id);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
};
const coefficient = () =>
  page.evaluate(
    () =>
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.joints.find((one) => one.id === 'D').friction.kineticCoefficient
  );
const frame = () =>
  page.evaluate(() => {
    const mechanism = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv
      .mechanisms[0];
    const frame = mechanism.getForceAnalysis('static').frames[0];
    return { status: frame.status, friction: frame.friction?.get('D') };
  });
try {
  await openMechanism(page, `${base}/?${payload('Slider-crank with friction')}`);
  await select('C');
  const panel = page.locator('app-edit-panel app-friction-panel');
  // filmstrip clears its directory. Resolve and fence its only deletion target first.
  const filmDir = path.resolve(out, 'filmstrip');
  assert.ok(filmDir.startsWith(out + path.sep));
  const film = filmstrip(page, filmDir);
  await film.during(50, 6, 'expand', () =>
    panel.getByRole('button', { name: /^Friction/ }).click()
  );
  await panel
    .getByRole('textbox', { name: 'Kinetic Coefficient', exact: true })
    .waitFor({ state: 'visible' });
  record(
    'Slider guide controls are available from its visible pin',
    await panel.getByRole('heading', { name: /^Slider Guide/ }).isVisible()
  );
  record('Known coupled friction is visible', (await panel.innerText()).includes('18.75 N'));
  record(
    'Additional actuator effort is distinguished from the contact force',
    (await panel.locator('.input-comparison').innerText()).includes('50 N·cm')
  );
  await panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true }).fill('0.4');
  await panel.getByRole('button', { name: 'Save Friction Settings' }).click();
  record(
    'Invalid coefficients are explained without changing the model',
    (await panel.getByRole('alert').innerText()).includes('at least') &&
      (await coefficient()) === 0.2
  );
  await panel.getByRole('textbox', { name: 'Kinetic Coefficient', exact: true }).fill('0.1');
  await panel.getByRole('button', { name: 'Save Friction Settings' }).click();
  await page.waitForFunction(
    () =>
      ng
        .getComponent(document.querySelector('app-new-grid'))
        .mechanismSrv.joints.find((one) => one.id === 'D').friction.kineticCoefficient === 0.1
  );
  record(
    'Editing friction invalidates the force cache',
    Math.abs((await frame()).friction.effort - (100 * 0.1) / (1 + 0.1 / 3)) < 1e-6
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  record(
    'One Undo restores both coefficients and solved results',
    (await coefficient()) === 0.2 && Math.abs((await frame()).friction.effort - 18.75) < 1e-6
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  record('Redo restores friction', (await coefficient()) === 0.1);
  await page.screenshot({ path: path.join(out, 'slider-edit.png'), fullPage: true });
  await page.getByRole('button', { name: /^Force Analysis/ }).click();
  const analysis = page.locator('app-analysis-panel app-friction-panel');
  await analysis.getByRole('button', { name: /^Friction/ }).click();
  record(
    'Force Analysis explains the static contact limit',
    (await analysis.innerText()).includes('start the whole mechanism')
  );
  await film.during(100, 8, 'animation', () =>
    page.getByRole('button', { name: 'Play', exact: true }).click()
  );
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const currentFriction = await page.evaluate(() => {
    const mechanism = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return mechanism.mechanisms[0]
      .getForceAnalysis('static')
      .frames[mechanism.currentSampleOf(0)].friction.get('D').effort;
  });
  const shownFriction = Number.parseFloat(await analysis.locator('dd').nth(1).innerText());
  record(
    'Friction readout follows the current animation sample',
    Math.abs(shownFriction - currentFriction) < 0.001
  );
  await page.screenshot({ path: path.join(out, 'slider-analysis.png'), fullPage: true });
  await page.getByRole('button', { name: 'Export data', exact: true }).click();
  const properties = await page.evaluate(() => {
    const flow = ng.getComponent(document.querySelector('app-export-panel')).flow;
    return flow
      .columnGroups('forces')
      .flatMap((group) =>
        group.columns.flatMap((column) => column.series.map((series) => series.mechProp))
      );
  });
  record(
    'Export offers normal load, friction effort and static limit',
    ['Friction Normal', 'Friction Effort', 'Friction Static Limit'].every((property) =>
      properties.includes(property)
    )
  );
  const addedInputColumn = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(grid.mechanismSrv.joints.find((one) => one.id === 'A'));
    const flow = ng.getComponent(document.querySelector('app-export-panel')).flow;
    flow.setParts(
      flow
        .partGroups()
        .flatMap((group) => group.parts)
        .filter((part) => part.id === 'A'),
      true
    );
    return flow
      .columnGroups('forces')
      .some((group) =>
        group.columns.some((column) =>
          column.series.some((series) => series.mechProp === 'Additional Input Effort')
        )
      );
  });
  record('Export includes the additional input effort from friction', addedInputColumn);
  await openMechanism(page, `${base}/?${payload('Pin bearing with friction')}`);
  await select('A');
  const pin = page.locator('app-edit-panel app-friction-panel');
  await pin.getByRole('button', { name: /^Friction/ }).click();
  await pin.locator('.panel-content.settled').waitFor();
  record(
    'Physical bearing radius is editable',
    await pin.getByRole('textbox', { name: /Effective Radius/ }).isVisible()
  );
  record(
    'Bearing torque is converted to displayed length units',
    (await pin.innerText()).includes('-10 N·cm')
  );
  await page.screenshot({ path: path.join(out, 'pin-edit.png'), fullPage: true });
  await page.reload();
  await page.waitForFunction(() =>
    ng
      .getComponent(document.querySelector('app-new-grid'))
      ?.mechanismSrv?.joints?.some((one) => one.friction?.kineticCoefficient === 0.2)
  );
  record('Reload preserves friction', true);
  record('No uncaught browser errors', errors.length === 0);
} finally {
  await page.screenshot({ path: path.join(out, 'last-state.png'), fullPage: true });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(
    await contactSheet(
      path.join(out, 'filmstrip', '*.png'),
      path.join(out, 'contact-sheet.png'),
      3,
      0.4
    )
  );
  await browser.close();
}
