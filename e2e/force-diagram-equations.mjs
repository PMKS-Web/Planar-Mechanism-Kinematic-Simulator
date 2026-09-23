import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';

const out = 'artifacts/force-diagram-equations';
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((line) => line.startsWith('| [' + name + ']'))
    .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await openMechanism(
    page,
    (process.env.PMKS_BASE_URL || 'http://localhost:4200/') + '?' + payload('TeachingLab four-bar')
  );
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const worksheet = page.locator('app-right-panel app-solver-explanation').first();
  await worksheet.waitFor();
  assert.equal(await worksheet.getByRole('button', { name: 'Open Full Worksheet' }).count(), 0);

  await worksheet.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  const body = worksheet.locator('.bodyCard').first();
  assert.equal(await body.locator('.bodyStep').count(), 3);
  assert.deepEqual(await body.locator('.bodyStep > summary').allTextContents(), [
    '1 · Build the Free-Body Diagram',
    '2 · Variables in This Example',
    '3 · Build the Force and Moment Equations',
  ]);
  assert.equal(await worksheet.getByText('Solved Directions', { exact: true }).count(), 0);

  await body.locator('.bodyStep').nth(0).locator(':scope > summary').click();
  assert(await body.locator('app-force-balance').first().isVisible());
  assert.equal(await body.getByText('Choose Free-Body Diagram Conventions', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Show the Position-Vector Projection Grid', { exact: true }).count(), 1);
  assert.equal(await body.getByText(/Isolate/).count(), 1);
  assert.equal(await body.locator('.bodyAdjustments app-worksheet-choices').count(), 0);
  await body.locator('.projectionGrid > summary').click();
  assert.equal(await body.locator('.projectionGrid app-solver-diagram').count(), 1);

  await body.locator('.bodyStep').nth(1).locator(':scope > summary').click();
  assert((await body.locator('.bodyStep').nth(1).locator('tbody tr').count()) > 2);

  await body.locator('.bodyStep').nth(2).locator(':scope > summary').click();
  assert.equal(await body.getByText('Sum of Forces in x', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Sum of Forces in y', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Sum of Moments in z', { exact: true }).count(), 1);
  assert.equal(await body.getByText('Show Moment-Arm Calculations', { exact: true }).count(), 0);
  await body.getByText('Sum of Forces in x', { exact: true }).click();
  const xDiagram = body.locator('.equationBuild').first().locator('app-force-balance');
  const highlighted = await xDiagram.locator('app-solver-diagram').evaluate((element) =>
    window.ng
      .getComponent(element)
      .diagram()
      .lines.filter((line) => line.balanceAxes)
      .map((line) => ({ axes: line.balanceAxes, color: line.color }))
  );
  assert(highlighted.some((line) => line.color === 'var(--warning)'));

  await worksheet.getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await worksheet.locator('app-solver-matrix').count(), 1);
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Free Bodies follows the FBD, variables, and equation teaching sequence.');
} finally {
  writeFileSync(out + '/report.json', JSON.stringify({ errors }, null, 2));
  await browser.close();
}
