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
const accessibility = [];
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
    'expanded-calculation',
    'expanded-input-effort',
    'playback-rewind',
    'unsupported-guide',
  ]) {
    await page.goto(`${base}/iframe.html?id=structure-friction-panel--${story}&viewMode=story`);
    const panel = page.locator('app-friction-panel');
    await panel.waitFor();
    if (story !== 'collapsed-enabled') await panel.locator('.panel-content').first().waitFor();
    await page.waitForTimeout(300);
    const text = await panel.innerText();
    if (story !== 'collapsed-enabled')
      assert.ok(text.includes('Guide at') || text.includes('Bearing at'), `${story} opens`);
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
    if (story === 'stationary') assert.ok(text.includes('Indeterminate at Rest'));
    if (story === 'in-motion-unavailable') assert.ok(text.includes('Use Static analysis'));
    if (story === 'saved-settings')
      assert.ok(await panel.getByText('Friction settings saved.', { exact: true }).isVisible());
    if (story.endsWith('-analysis')) {
      assert.equal(await panel.locator('input').count(), 0);
      assert.ok(!text.includes('With Friction') && text.includes('Additional from Friction'));
      assert.equal(
        await panel
          .getByRole('button', { name: 'How Friction Is Calculated' })
          .getAttribute('aria-expanded'),
        'false'
      );
      assert.equal(
        await panel
          .getByRole('button', { name: 'Input Effort Details' })
          .getAttribute('aria-expanded'),
        'false'
      );
      assert.ok(!text.includes('start the whole mechanism'));
    }
    if (story === 'expanded-calculation') {
      assert.equal(
        await panel
          .getByRole('button', { name: 'How Friction Is Calculated' })
          .getAttribute('aria-expanded'),
        'true'
      );
      assert.ok(text.includes("already included in the guide's reported reaction"));
      assert.ok(text.includes('start the whole mechanism'));
    }
    if (story === 'playback-rewind') {
      assert.ok(text.includes('does not reverse the prescribed drive'));
      assert.equal(await panel.locator('dl').count(), 0);
    }
    if (story === 'unsupported-guide') {
      assert.ok(text.includes('Unsupported Friction Contact'));
      assert.equal(await panel.locator('dl').count(), 0);
    }
    if (
      ['stationary', 'in-motion-unavailable', 'playback-rewind', 'unsupported-guide'].includes(
        story
      )
    ) {
      const header = panel.getByRole('button', { name: /^Friction/ });
      await header.focus();
      await header.press('Enter');
      assert.equal(await header.getAttribute('aria-expanded'), 'false');
      assert.ok(
        (await panel.locator('.state-chip').innerText()).includes(
          story === 'stationary' ? 'Indeterminate at Rest' : 'Unavailable'
        )
      );
      await header.press('Space');
      await page.waitForTimeout(230);
      const why = panel.getByRole('button', { name: /^Why Is This/ });
      assert.equal(await why.getAttribute('aria-expanded'), 'false');
      assert.ok(await panel.locator('.diagnostic > strong').isVisible());
    }
    if (story === 'collapsed-enabled') {
      await panel
        .locator('input')
        .first()
        .evaluate((el) => el.focus());
      assert.equal(
        await panel
          .locator('input')
          .first()
          .evaluate((el) => document.activeElement === el),
        false
      );
      const header = panel.getByRole('button', { name: /^Friction/ });
      await header.focus();
      await header.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('[inert]')), false);
    }
    if (story === 'expanded-input-effort') {
      assert.ok(text.includes('Without Friction') && text.includes('With Friction'));
      assert.ok(text.includes('Includes all friction contacts'));
    }
    const overflow = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, `${story} fits the panel width`);
    await page.screenshot({ path: path.join(out, `${story}.png`), fullPage: true });
    await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
    const audit = await page.evaluate(() => axe.run(document.querySelector('app-friction-panel')));
    accessibility.push({ story, violations: audit.violations });
    assert.deepEqual(
      audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
      `${story} axe accessibility`
    );
    results.push(story);
    console.log(`PASS ${story}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: path.join(out, 'last-state.png') });
  writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify({ results, errors, accessibility }, null, 2)
  );
  await browser.close();
}
