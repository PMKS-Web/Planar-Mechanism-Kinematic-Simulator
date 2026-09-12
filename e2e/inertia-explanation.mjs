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
    link.comIsCustom = false;
    grid.mechanismSrv.updateMechanism(true);
    grid.activeObjService.updateSelectedObj(link);
    ng.applyChanges(grid);
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const explanation = page.locator('app-edit-panel app-inertia-explanation');
  const toggle = explanation.getByRole('button', {
    name: 'How Inertia Is Calculated',
    exact: true,
  });
  await toggle.scrollIntoViewIfNeeded();
  const film = filmstrip(page, `${out}/opening`, { x: 0, y: 0, width: 280, height: 950 });
  await film.during(25, 10, 'open', () => toggle.click());
  await explanation.locator('section.working').waitFor({ state: 'visible' });
  assert.equal(
    await explanation
      .locator('.katex-mathml')
      .first()
      .evaluate((el) => getComputedStyle(el).position),
    'absolute',
    'The equation stylesheet must hide the accessible MathML duplicate'
  );
  assert.ok(
    await explanation
      .locator('.panel-content[inert]')
      .evaluateAll(
        (nodes) =>
          nodes.length > 0 && nodes.every((el) => getComputedStyle(el).visibility === 'hidden')
      ),
    'Closed steps must be hidden even before their initial animation state is applied'
  );
  assert.match(await explanation.innerText(), /Uniform slender rod/);
  assert.match(await explanation.innerText(), /g·cm²/);
  await explanation.screenshot({ path: `${out}/rod.png` });
  const original = await explanation.locator('.result').first().innerText();
  await page.evaluate(() => {
    const panel = ng.getComponent(document.querySelector('app-edit-panel'));
    panel.sectionExpanded.LMass = true;
    ng.applyChanges(panel);
  });
  const comInputs = ['x', 'y'].map((axis) =>
    page.locator(`app-edit-panel state-input[_formControl="com${axis.toUpperCase()}"] input`)
  );
  const readCenter = () =>
    page.evaluate(() => {
      const panel = ng.getComponent(document.querySelector('app-edit-panel'));
      const link = panel.activeSrv.selectedLink;
      return { x: link.CoM.x / 200, y: link.CoM.y / 200, custom: link.comIsCustom };
    });
  const assertCenter = async () => {
    const center = await readCenter();
    for (const [i, axis] of ['x', 'y'].entries()) {
      assert.ok(
        Math.abs(Number(await comInputs[i].inputValue()) - center[axis]) <= 0.0051,
        `CoM ${axis} must match its grid position`
      );
    }
    return center;
  };
  const center = await assertCenter();
  assert.ok(Math.hypot(center.x, center.y) > 0.1, 'Use a non-origin centroid');
  await page.getByRole('button', { name: 'CoM Reference', exact: true }).click();
  await page.getByRole('combobox', { name: 'Center of Mass Reference' }).selectOption('grid');
  assert.deepEqual(await assertCenter(), center, 'Reference choice must leave CoM in place');
  await page.getByRole('combobox', { name: 'Center of Mass Reference' }).selectOption('centroid');
  await comInputs[0].fill('1.25');
  await comInputs[0].press('Tab');
  assert.ok(Math.abs((await assertCenter()).x - 1.25) < 1e-8, 'Typed X is a grid coordinate');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.deepEqual(await assertCenter(), center, 'Undo restores the derived grid center');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.ok(Math.abs((await assertCenter()).x - 1.25) < 1e-8);
  await page.getByTitle("Back to the shape's centroid", { exact: true }).first().click();
  assert.deepEqual(await assertCenter(), center);
  await page.mouse.move(800, 100);
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.seekMechanism(0, grid.mechanismSrv.mechanisms[0].cyclePeriod / 3);
    ng.applyChanges(grid);
  });
  await page.waitForTimeout(200);
  const posedCenter = await assertCenter();
  assert.notDeepEqual(posedCenter, center, 'Seeking must move the CoM readout');
  await page.screenshot({ path: `${out}/com-posed.png` });
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    grid.mechanismSrv.seekMechanism(0, 0);
    ng.applyChanges(grid);
  });
  await page.getByRole('button', { name: 'CoM Reference', exact: true }).click();
  const distribute = explanation.getByRole('button', {
    name: '2. Distribute the Mass',
    exact: true,
  });
  assert.equal(await distribute.getAttribute('aria-expanded'), 'false');
  const nestedFilm = filmstrip(page, `${out}/nested-opening`, {
    x: 0,
    y: 0,
    width: 280,
    height: 950,
  });
  await nestedFilm.during(25, 10, 'open', () => distribute.click());
  await page.waitForTimeout(250);
  await explanation.screenshot({ path: `${out}/rod-fractions.png` });
  await page.screenshot({ path: `${out}/rod-fractions-viewport.png` });
  assert.ok((await explanation.locator('mfrac').count()) > 0, 'Fractions must use stacked markup');
  assert.equal(await explanation.locator('.katex-error').count(), 0);
  await distribute.click();
  await explanation.getByRole('button', { name: 'About Another Point', exact: true }).click();
  const axis = explanation.locator('app-inertia-axis');
  assert.match(await axis.innerText(), /Inertia about P:/);
  const axisValue = await axis.locator('.result').innerText();
  await axis.getByRole('combobox', { name: 'Axis Through' }).selectOption('grid');
  assert.notEqual(await axis.locator('.result').innerText(), axisValue);
  await axis.getByRole('button', { name: 'Force Moments About P', exact: true }).click();
  assert.match(await axis.innerText(), /general moment equation/);
  await axis.getByRole('combobox', { name: 'Axis Through' }).selectOption({ index: 0 });
  assert.match(await axis.innerText(), /grounded revolute joint/);
  await axis.getByRole('button', { name: 'Parallel-Axis Working', exact: true }).click();
  await axis.screenshot({ path: `${out}/parallel-axis.png` });
  await explanation.getByRole('button', { name: 'About Another Point', exact: true }).click();
  assert.equal(await explanation.getByRole('combobox', { name: 'Axis Through' }).count(), 0);
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
  await explanation.locator('section.working').waitFor({ state: 'detached' });
  await page.keyboard.press('Enter');
  await explanation.locator('section.working').waitFor({ state: 'visible' });
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
  await massTable.getByRole('button', { name: 'How Inertia Is Calculated', exact: true }).click();
  await massTable.locator('section.working').waitFor({ state: 'visible' });
  await massTable.locator('.panel-content.settled').first().waitFor({ state: 'visible' });
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
      const working = gallery.locator('app-inertia-explanation section.working');
      await working.waitFor({ state: 'visible' });
      await gallery.evaluate(() => document.fonts.ready);
      assert.ok((await working.innerText()).includes(expected), `${story} must show ${expected}`);
      if (['rod', 'plate', 'compound'].includes(story)) {
        const steps = working.locator(':scope > collapsible-subsection');
        for (let i = 0; i < (await steps.count()); i++) {
          const button = steps.nth(i).getByRole('button').first();
          if (!/^\d/.test(await button.innerText())) continue;
          await button.click();
          await gallery.waitForTimeout(250);
          const overflows = await steps
            .nth(i)
            .locator('.equation')
            .evaluateAll((nodes) =>
              nodes.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent)
            );
          assert.deepEqual(overflows, [], `${story} equations must fit the panel`);
          assert.equal(await working.locator('.katex-error').count(), 0);
          await steps.nth(i).screenshot({ path: `${out}/gallery-${story}-step-${i}.png` });
          await button.click();
        }
      }
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
