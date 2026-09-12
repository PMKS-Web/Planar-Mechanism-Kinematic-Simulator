/** Live mass edits, selection, custom/reset, keyboard, narrow layout and the
 * disclosure's animation. Run against the branch's development server. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const out = 'artifacts/inertia-explanation';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  await page.goto(`${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await waitForReady(page);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.mechanismSrv.links[0];
    link.mass = 12;
    link.moiIsCustom = false;
    grid.mechanismSrv.updateMechanism(true);
    grid.activeObjService.updateSelectedObj(link);
    ng.applyChanges(grid);
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const explanation = page.locator('app-edit-panel app-inertia-explanation');
  const toggle = explanation.getByRole('button', {
    name: 'How inertia is calculated',
    exact: true,
  });
  await toggle.scrollIntoViewIfNeeded();
  const film = filmstrip(page, `${out}/opening`, { x: 0, y: 0, width: 280, height: 950 });
  await film.during(25, 10, 'open', () => toggle.click());
  await explanation.locator('.working').waitFor({ state: 'visible' });
  assert.match(await explanation.innerText(), /Uniform slender rod/);
  assert.match(await explanation.innerText(), /g·cm²/);
  await explanation.screenshot({ path: `${out}/rod.png` });
  const original = await explanation.locator('.result').first().innerText();
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-edit-panel'));
    panel.sectionExpanded.LMass = true;
    ng.applyChanges(panel);
  });
  const mass = page.locator('app-edit-panel input-block[_formControl="mass"] input');
  await mass.fill('24');
  await mass.press('Tab');
  await page.waitForTimeout(300);
  const doubled = await explanation.locator('.result').first().innerText();
  assert.equal(Number(doubled.match(/[\d.]+/)[0]), 2 * Number(original.match(/[\d.]+/)[0]));
  const moi = page.locator('app-edit-panel input-block[_formControl="massMoI"] input');
  await moi.fill('75');
  await moi.press('Tab');
  await page.waitForTimeout(300);
  assert.match(await explanation.innerText(), /Value used: 75 g·cm²/);
  assert.match(await explanation.innerText(), /set by you or a saved file/);
  await explanation.screenshot({ path: `${out}/custom.png` });
  await page.getByTitle("Back to the shape's own inertia", { exact: true }).click();
  assert.doesNotMatch(await explanation.innerText(), /set by you or a saved file/);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await explanation.locator('.working').waitFor({ state: 'detached' });
  await page.keyboard.press('Enter');
  await explanation.locator('.working').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const link = grid.mechanismSrv.links[1];
    link.mass = 0;
    grid.mechanismSrv.updateMechanism(true);
    grid.activeObjService.updateSelectedObj(link);
    ng.applyChanges(grid);
  });
  assert.match(await explanation.innerText(), /Zero mass gives zero inertia/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  // The phone sheet begins collapsed; its own handle opens it.
  const handle = page.locator('app-left-tabs .sheetHandle');
  if (await handle.count()) await handle.click();
  await toggle.scrollIntoViewIfNeeded();
  await explanation.screenshot({ path: `${out}/phone.png` });
  const overflow = await explanation.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false, 'Explanation must fit the phone sheet');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    const drawer = ng.getComponent(document.querySelector('app-right-panel'));
    drawer.constructor.insistOn(6);
    ng.applyChanges(drawer);
  });
  const massTable = page.locator('app-analysis-setup app-inertia-explanation').first();
  await massTable.getByRole('button', { name: 'How inertia is calculated', exact: true }).click();
  await massTable.locator('.working').waitFor({ state: 'visible' });
  await massTable.locator('.panel-content.settled').waitFor({ state: 'visible' });
  assert.match(await massTable.innerText(), /Uniform slender rod/);
  await page.screenshot({ path: `${out}/force-setup.png` });
  if (process.env.SB_URL) {
    const gallery = await browser.newPage({ viewport: { width: 500, height: 2100 } });
    gallery.on('pageerror', (error) => errors.push(String(error)));
    for (const [story, expected] of [
      ['rod', '25 g·cm²'],
      ['plate', '40 g·cm²'],
      ['compound', 'Welded compound'],
      ['custom', '75 g·cm²'],
      ['zero-mass', 'Zero mass gives zero inertia'],
      ['point-mass', 'Point mass'],
      ['si', '25 kg·m²'],
      ['english', '25 lbm·in²'],
    ]) {
      await gallery.goto(
        `${process.env.SB_URL}/iframe.html?id=feedback-inertia-explanation--${story}&viewMode=story`
      );
      const working = gallery.locator('app-inertia-explanation .working');
      await working.waitFor({ state: 'visible' });
      await gallery.evaluate(() => document.fonts.ready);
      assert.ok((await working.innerText()).includes(expected), `${story} must show ${expected}`);
      await gallery
        .locator('app-inertia-explanation')
        .screenshot({ path: `${out}/gallery-${story}.png` });
    }
    await gallery.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${out}/report.json`,
    JSON.stringify({ passed: true, original, doubled, errors }, null, 2)
  );
  await contactSheet(`${out}/opening/*.png`, `${out}/opening.png`, 5);
  console.log(
    'PASS inertia explanation: edit, custom/reset, selection, keyboard, phone, filmstrip'
  );
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
