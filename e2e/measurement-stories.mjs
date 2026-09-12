/** Check the comparison gallery states after building Storybook and serving its output. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = await import('../node_modules/playwright/index.mjs');
const base = process.env.SB_URL ?? 'http://localhost:6006';
const dir = 'artifacts/measurement-stories';
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 600, height: 1100 } });
const page = await context.newPage();
const errors = [];
const checked = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  for (const state of [
    'collapsed',
    'empty',
    'invalid-times',
    'compared',
    'unsolved',
    'narrow-angular-quantity',
  ]) {
    await page.goto(
      `${base}/iframe.html?id=feedback-measurement-comparison--${state}&viewMode=story`
    );
    const component = page.locator('app-measurement-comparison');
    await component.waitFor();
    if (state === 'collapsed') {
      await component.getByRole('button', { name: 'Compare Measurements' }).waitFor();
      assert.equal(await component.locator('textarea').count(), 0);
    } else if (state === 'invalid-times' || state === 'unsolved') {
      await component.getByRole('alert').waitFor();
      assert.match(
        await component.getByRole('alert').innerText(),
        state === 'unsolved' ? /Solve this mechanism/ : /no duplicates/
      );
    } else if (state === 'compared') {
      await component.getByText('RMSE: 2 cm', { exact: true }).waitFor();
      await component.locator('.apexcharts-svg').waitFor();
      assert.match(await component.innerText(), /3 compared · 1 excluded/);
    } else {
      await component.locator('textarea').waitFor();
      assert.equal(
        await component.getByRole('button', { name: 'Calculate RMSE' }).isDisabled(),
        true
      );
    }
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await component.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
    await component.screenshot({ path: `${dir}/${state}.png`, animations: 'disabled' });
    checked.push(state);
    console.log(`PASS ${state}`);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${dir}/report.json`, JSON.stringify({ checked, errors }, null, 2));
  await browser.close();
}
