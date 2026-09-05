import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';

const { chromium } = await import(
  `${process.env.PMKS_PLAYWRIGHT_DIR || '/tmp/pmks-playwright'}/node_modules/playwright/index.mjs`
);
const base = process.env.PMKS_BASE_URL || 'http://localhost:4200';
const out = 'artifacts/release-export-ui';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await startQuiet(context);
  const page = await context.newPage();
  const crashes = [];
  page.on('pageerror', (error) => crashes.push(error.message));

  for (const address of ['?%', '#%', '?%E0%A4%A', '#backdrop=%E0%A4%A']) {
    // A fresh document matters: navigating from / to /#% is a same-document
    // fragment change and does not exercise startup URL parsing at all.
    const arrival = await context.newPage();
    arrival.on('pageerror', (error) => crashes.push(error.message));
    await arrival.goto(`${base}/${address}`);
    await arrival.locator('#canvas').waitFor({ state: 'visible' });
    await arrival.locator('#bootSplash').waitFor({ state: 'detached' });
    await arrival.getByText(/That shared link could not be opened/).waitFor();
    assert.equal(new URL(arrival.url()).search + new URL(arrival.url()).hash, '');
    assert.deepEqual(crashes, []);
    checks.push(`Malformed address recovers: ${address}`);
    await arrival.close();
  }

  await openMechanism(page, `${base}/?${TEMPLATE_LINKAGES['4-Bar']}`);
  await page.locator('#joint_B').click();
  assert.equal(
    await page.getByRole('textbox', { name: 'Joint Position X', exact: true }).count(),
    1
  );
  assert.equal(
    await page.getByRole('textbox', { name: 'Joint Position Y', exact: true }).count(),
    1
  );
  assert.ok((await page.getByRole('textbox', { name: /Joint .+ Distance/ }).count()) > 0);
  assert.ok((await page.getByRole('textbox', { name: /Joint .+ Angle/ }).count()) > 0);
  writeFileSync(
    `${out}/accessible-fields.txt`,
    await page.locator('app-edit-panel').ariaSnapshot()
  );
  checks.push('Joint coordinates and relative dimensions have quantity and axis names');

  await page.setViewportSize({ width: 390, height: 844 });
  await openMechanism(page, `${base}/?${TEMPLATE_LINKAGES.Three_Machines}`);
  await page.getByRole('button', { name: 'Project menu' }).click();
  await page.getByRole('button', { name: 'CAD Export' }).click();
  await page.locator('.sectionHead[data-section="geometry"]').click();
  await page.getByRole('button', { name: 'Choose a joint…', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Joint', exact: true });
  assert.equal(await select.locator('option').count(), 12);
  await select.selectOption('P');
  assert.equal(await select.inputValue(), 'P');
  assert.equal(
    await page
      .locator('app-drawing-export')
      .evaluate((element) => ng.getComponent(element).options.originJointId),
    'P'
  );
  const overflow = await select.evaluate((element) => {
    const results = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) {
        results.push({
          tag: node.tagName,
          class: node.className,
          width: node.clientWidth,
          content: node.scrollWidth,
        });
      }
    }
    return results;
  });
  assert.deepEqual(overflow, []);
  await page.screenshot({ path: `${out}/cad-origin-mobile.png` });
  checks.push('All 12 CAD origins are available on a 390px screen without horizontal overflow');
  assert.deepEqual(crashes, []);
  writeFileSync(`${out}/results.json`, JSON.stringify({ checks, crashes }, null, 2));
  for (const check of checks) console.log(`PASS ${check}`);
} finally {
  await browser.close();
}
