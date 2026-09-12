import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.SB_URL ?? 'http://localhost:6017';
const out = path.resolve('artifacts/friction-stories');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  for (const story of [
    'frictionless',
    'prismatic',
    'revolute',
    'radius-in-inches',
    'playback-disabled',
    'stationary',
    'in-motion-unavailable',
    'read-only',
    'invalid-coefficients',
    'slider-analysis',
    'bearing-analysis',
    'saved-settings',
    'collapsed-enabled',
  ]) {
    await page.goto(`${base}/iframe.html?id=structure-friction-panel--${story}&viewMode=story`);
    const panel = page.locator('app-friction-panel');
    await panel.waitFor();
    if (story !== 'collapsed-enabled') await panel.locator('.panel-content').waitFor();
    await page.waitForTimeout(300);
    const text = await panel.innerText();
    if (story !== 'collapsed-enabled')
      assert.ok(text.includes('Friction changes the required input effort'), `${story} opens`);
    else {
      assert.equal(
        await panel.getByRole('button', { name: /^Friction/ }).getAttribute('aria-expanded'),
        'false'
      );
      assert.ok(await panel.getByRole('status', { name: 'Friction Enabled' }).isVisible());
    }
    if (story === 'frictionless') assert.ok(text.includes('Frictionless contact'));
    if (story === 'invalid-coefficients')
      assert.ok((await panel.getByRole('alert').innerText()).includes('at least'));
    if (story === 'playback-disabled') {
      assert.equal(await panel.locator('input:disabled').count(), 2);
      assert.equal(
        await panel.getByRole('button', { name: 'Save Friction Settings' }).isDisabled(),
        true
      );
    }
    if (story === 'read-only') assert.equal(await panel.locator('input').count(), 0);
    if (story === 'radius-in-inches') assert.ok(text.includes('in') && text.includes('-3.937'));
    if (story === 'stationary') assert.ok(text.includes('cannot select a unique holding force'));
    if (story === 'in-motion-unavailable') assert.ok(text.includes('Use Static analysis'));
    if (story === 'saved-settings')
      assert.ok(await panel.getByText('Friction settings saved.', { exact: true }).isVisible());
    if (story.endsWith('-analysis')) {
      assert.equal(await panel.locator('input').count(), 0);
      assert.ok(text.includes('With Friction') && text.includes('Additional from All Friction'));
    }
    const overflow = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, `${story} fits the panel width`);
    await page.screenshot({ path: path.join(out, `${story}.png`), fullPage: true });
    results.push(story);
    console.log(`PASS ${story}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: path.join(out, 'last-state.png') });
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
