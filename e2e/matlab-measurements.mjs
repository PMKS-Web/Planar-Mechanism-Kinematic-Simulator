/** MATLAB downloads and measured-data comparison, including phone layout and stale-result refusal. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const dir = 'artifacts/matlab-measurements';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1450, height: 1050 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const checks = [];
const pass = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};

try {
  await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await waitForReady(page);
  await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(
      grid.mechanismSrv.joints.find((joint) => !joint.ground && !joint.input)
    );
    ng.applyChanges(grid);
  });
  const section = page
    .locator('app-analysis-graph-section')
    .filter({ has: page.locator('.graphTitle', { hasText: 'Position' }) })
    .first();
  const film = filmstrip(page, `${dir}/opening`, { x: 0, y: 60, width: 430, height: 920 });
  if ((await section.locator('.graphHeader').getAttribute('aria-expanded')) !== 'true') {
    await film.during(30, 8, 'expand', () => section.locator('.graphHeader').click());
  }
  const comparison = section.locator('app-measurement-comparison');
  await comparison.getByRole('button', { name: 'Compare Measurements', exact: true }).click();
  const data = await section.evaluate((element) => {
    const section = ng.getComponent(element);
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const mechanism = grid.mechanismSrv.mechanismForId(section.mechPart());
    const rows = [0, 15, 30].map((step) => {
      const point = mechanism.joints[step].find((joint) => joint.id === section.mechPart());
      return `${mechanism.timeNum[step]},${point.x / 200 + 2}`;
    });
    return { rows: rows.join('\n'), last: mechanism.timeNum.at(-1) };
  });
  await comparison
    .getByRole('textbox', { name: /Measured Values/ })
    .fill(data.rows + `\n${data.last + 1},100`);
  await comparison.getByRole('button', { name: 'Calculate RMSE' }).click();
  await comparison.locator('.measurementResult').waitFor();
  assert.match(await comparison.locator('.measurementResult').innerText(), /RMSE: 2 /);
  assert.match(
    await comparison.locator('.measurementResult').innerText(),
    /3 compared · 1 excluded/
  );
  await comparison.locator('.apexcharts-svg').waitFor();
  await comparison.locator('.measurementResult').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/comparison-desktop.png` });
  pass('Measured points overlay the theory; known offset gives RMSE 2 and one excluded sample');

  await section.locator('.graphHeader').click();
  await section.locator('.graphHeader').click();
  assert.match(await comparison.locator('.measurementResult').innerText(), /RMSE: 2 /);
  pass('Collapsing the quantity preserves measurements and comparison');

  await comparison.getByRole('textbox', { name: /Measured Values/ }).fill('0,1\n0,2');
  assert.equal(await comparison.locator('.measurementResult').count(), 0);
  await comparison.getByRole('button', { name: 'Calculate RMSE' }).click();
  assert.match(await comparison.getByRole('alert').innerText(), /no duplicates/);
  await comparison.getByRole('textbox', { name: /Measured Values/ }).fill(data.rows);
  await comparison.getByRole('button', { name: 'Calculate RMSE' }).click();
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.updateMechanism(false);
    ng.applyChanges(grid);
  });
  assert.equal(await comparison.locator('.measurementResult').count(), 0);
  assert.match(await comparison.innerText(), /analysis changed/);
  pass('Invalid data is refused and a rebuilt mechanism invalidates its previous RMSE');

  await comparison.getByRole('button', { name: 'Calculate RMSE' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const handle = page.locator('.sheetHandle');
  await handle.waitFor({ state: 'visible' });
  if ((await handle.getAttribute('aria-expanded')) !== 'true') await handle.click();
  await page.waitForTimeout(300);
  await comparison.getByRole('button', { name: 'Calculate RMSE' }).scrollIntoViewIfNeeded();
  const bounds = await comparison.boundingBox();
  assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= 391, JSON.stringify(bounds));
  const buttonBounds = await comparison
    .getByRole('button', { name: 'Calculate RMSE' })
    .boundingBox();
  assert.ok(
    buttonBounds && buttonBounds.y >= 0 && buttonBounds.y + buttonBounds.height < 844,
    JSON.stringify(buttonBounds)
  );
  await page.screenshot({ path: `${dir}/comparison-phone.png` });
  pass('Measurement controls fit a 390px phone with reduced motion');

  await page.setViewportSize({ width: 1450, height: 1050 });
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
  const drawer = page.locator('app-export-panel');
  for (let step = 0; step < 5 && !(await drawer.locator('.formatBlock').count()); step++) {
    await drawer.locator('.nextButton').click();
  }
  await drawer.getByRole('button', { name: /MATLAB Script/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${dir}/matlab-export.png` });
  const downloadPromise = page.waitForEvent('download');
  await drawer.locator('.nextButton').click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith('.m'));
  await download.saveAs(`${dir}/example-analysis.m`);
  const script = readFileSync(`${dir}/example-analysis.m`, 'utf8');
  assert.match(script, /reference = \[/);
  assert.match(script, /initial_q = \[/);
  assert.match(script, /function result = pmks_kinematics/);
  assert.match(script, /function result = pmks_compare/);
  assert.ok(
    script.indexOf('geometry = pmks_kinematics') < script.indexOf('function result = pmks_compare')
  );
  assert.match(script, /No rounding is applied/);
  pass('Downloaded MATLAB file contains geometry, independent kinematics, reference data and RMSE');

  assert.deepEqual(errors, []);
  pass('No browser runtime errors');
  writeFileSync(`${dir}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await contactSheet(`${dir}/opening/*expand*.png`, `${dir}/opening-filmstrip.png`, 4);
} catch (error) {
  await page.screenshot({ path: `${dir}/failure.png` });
  writeFileSync(`${dir}/failure.txt`, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
