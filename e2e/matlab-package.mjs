/** Actual PMKS export workflow, optional verification, independent files and refusal. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { waitForReady } from './app-ready.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import('../node_modules/playwright/index.mjs');
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4302';
const dir = 'artifacts/matlab-package';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1450, height: 1050 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const checks = [];
function pass(label) {
  checks.push(label);
  console.log('PASS ' + label);
}
function unzip(bytes) {
  const entries = [];
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const size = bytes.readUInt32LE(at + 18),
      length = bytes.readUInt16LE(at + 26),
      extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + length).toString('utf8'),
      start = at + 30 + length + extra;
    assert.ok(!name.includes('..') && !name.startsWith('/') && !name.includes('\\'));
    entries.push({ name, text: bytes.subarray(start, start + size).toString('utf8') });
    at = start + size;
  }
  return entries;
}
try {
  await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await waitForReady(page);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.links.forEach((b) => {
      b.mass = 100;
      b.massMoI = 1;
    });
    grid.mechanismSrv.updateMechanism(false);
    ng.applyChanges(grid);
  });
  await page.locator('.tabButton', { hasText: 'Force' }).click();
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.activeObjService.updateSelectedObj(
      grid.mechanismSrv.joints.find((j) => !j.ground && !j.input)
    );
    ng.applyChanges(grid);
  });
  const film = filmstrip(page, `${dir}/opening`, { x: 950, y: 0, width: 500, height: 1050 });
  await film.during(40, 8, 'export', () =>
    page.locator('.historyButton', { hasText: 'Export Data' }).click()
  );
  const drawer = page.locator('app-export-panel');
  const previewUrl = await drawer.evaluate((el) =>
    ng.getComponent(el).writer.urls.generateFullUrl()
  );
  writeFileSync(`${dir}/preview-url.txt`, previewUrl);
  await drawer.getByRole('button', { name: 'Select All', exact: true }).click();
  for (let step = 0; step < 5 && !(await drawer.locator('.formatBlock').count()); step++) {
    const all = drawer.getByRole('button', { name: 'Select All', exact: true });
    if (await all.count()) await all.click();
    const motion = drawer.getByText('In-motion', { exact: true });
    if (await motion.count()) await motion.click();
    await drawer.locator('.nextButton').click();
  }
  await drawer.getByRole('button', { name: /MATLAB Analysis Package/ }).click();
  assert.equal(await drawer.locator('[role="alert"]').count(), 0);
  assert.equal(await drawer.locator('.nextButton').isEnabled(), true);
  await page.screenshot({ path: `${dir}/export-format.png` });
  await drawer.locator('.settingBlock').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/export-desktop.png` });
  async function download(name) {
    const pending = page.waitForEvent('download');
    await drawer.locator('.nextButton').click();
    const file = await pending;
    assert.match(file.suggestedFilename(), /_analysis\.zip$/);
    await file.saveAs(`${dir}/${name}.zip`);
    return unzip(readFileSync(`${dir}/${name}.zip`));
  }
  const files = await download('independent-analysis');
  const get = (name) => files.find((f) => f.name.endsWith('/' + name))?.text;
  assert.ok(get('mechanism_data.m'));
  assert.match(get('mechanism_data.m'), /'force_mode','dynamic'/);
  for (const name of [
    'run_pmks_analysis.m',
    'solve_position.m',
    'solve_velocity.m',
    'solve_acceleration.m',
    'solve_forces.m',
    'plot_results.m',
    'position_equations.m',
    'velocity_equations.m',
    'acceleration_equations.m',
    'force_equations.m',
    'named_results.m',
    'validate_equations.m',
    'ANALYSIS_README.md',
    '+pmks/constraints.m',
  ])
    assert.ok(get(name), name);
  assert.ok(!get('pmks_reference.csv'));
  assert.match(get('position_equations.m'), /c_B_on_AB_x/);
  assert.match(get('force_equations.m'), /A_on_AB_x \+ B_on_AB_x/);
  assert.match(get('named_results.m'), /r\.bodies\.BC\.angularVelocity/);
  for (const name of [
    'solve_position.m',
    'solve_velocity.m',
    'solve_acceleration.m',
    'solve_forces.m',
  ])
    assert.ok(!get(name).includes('reference'));
  for (const file of files) {
    const path = `${dir}/extracted/${file.name}`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.text);
  }
  pass('Actual app downloads a geometry-driven analysis package without PMKS reference data');
  const reference = drawer
    .locator('.settingRow')
    .filter({ hasText: 'Include PMKS reference results for verification' });
  await reference.getByText('Yes', { exact: true }).click();
  const verified = await download('analysis-with-verification');
  assert.ok(verified.some((f) => f.name.endsWith('/pmks_reference.csv')));
  for (const f of files.filter((f) => f.name.endsWith('.m')))
    assert.equal(verified.find((v) => v.name === f.name)?.text, f.text);
  pass('Optional reference data changes no solver file');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  for (const close of await page.locator('.notificationClose').all()) await close.click();
  await drawer.locator('.matlabOption').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  for (const option of await drawer.locator('.matlabOption').all()) {
    const bounds = await option.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    assert.equal(await option.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  }
  await page.screenshot({ path: `${dir}/export-phone.png` });
  const button = await drawer.locator('.nextButton').boundingBox();
  assert.ok(button.x >= 0 && button.x + button.width <= 391);
  pass('Package controls and Export remain accessible at phone width');
  await page.setViewportSize({ width: 1450, height: 1050 });
  // Change an actual model driver into an unsupported one; the export guard must reject it.
  await drawer.evaluate((el) => {
    const c = ng.getComponent(el);
    const mechanism = c.mechanism.mechanisms[0];
    mechanism.joints[0].find((j) => j.input).ground = false;
    ng.applyChanges(c);
  });
  await drawer.getByRole('alert').waitFor();
  assert.equal(await drawer.locator('.nextButton').isDisabled(), true);
  assert.match(await drawer.getByRole('alert').innerText(), /grounded rotary driver/);
  pass('Unsupported driver is refused before export');
  // Reopen the original zero-mass M1 and export only kinematics.
  await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await waitForReady(page);
  await page.locator('.tabButton', { hasText: 'Kinematic' }).click();
  await page.locator('.historyButton', { hasText: 'Export Data' }).click();
  await drawer.getByRole('button', { name: 'Select All', exact: true }).click();
  for (let step = 0; step < 5 && !(await drawer.locator('.formatBlock').count()); step++) {
    const all = drawer.getByRole('button', { name: 'Select All', exact: true });
    if (await all.count()) await all.click();
    if (await drawer.getByText('In-motion', { exact: true }).count())
      await drawer.getByRole('button', { name: 'Select None', exact: true }).click();
    await drawer.locator('.nextButton').click();
  }
  await drawer.getByRole('button', { name: /MATLAB Analysis Package/ }).click();
  await page.screenshot({ path: `${dir}/export-kinematics.png` });
  const kinematic = await download('kinematics-only-analysis');
  assert.ok(kinematic.some((f) => f.name.endsWith('/position_equations.m')));
  assert.ok(kinematic.some((f) => f.name.endsWith('/ANALYSIS_README.md')));
  assert.ok(!kinematic.some((f) => /\/(solve_forces|force_equations)\.m$/.test(f.name)));
  assert.ok(
    !kinematic.find((f) => f.name.endsWith('/run_pmks_analysis.m')).text.includes('solve_forces(')
  );
  pass(
    'Kinematics-only browser export omits force files and retains readable independent equations'
  );
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${dir}/report.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
