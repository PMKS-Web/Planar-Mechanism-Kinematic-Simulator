import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';

const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = gallery
  .split('\n')
  .find((line) => line.startsWith('| [TeachingLab four-bar]'))
  .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1180, height: 720 } });

try {
  await openMechanism(page, `${process.env.PMKS_BASE_URL || 'http://localhost:4318/'}?${payload}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const worksheet = page.locator('#rightPanel app-solver-explanation');
  await worksheet.getByRole('button', { name: 'Definitions', exact: true }).click();
  const collapsedHeight = await worksheet.evaluate((host) => host.scrollHeight);
  await worksheet
    .locator('details')
    .evaluateAll((items) => items.forEach((item) => (item.open = true)));
  await page.evaluate(() => document.fonts.ready);

  const expandedHeight = await worksheet.evaluate((host) => host.scrollHeight);
  assert(expandedHeight > collapsedHeight + 1000, 'Expanded sections must grow the scroll range.');
  const scrollState = await worksheet.evaluate((host) => {
    return [host.clientHeight, host.scrollHeight, getComputedStyle(host).overflowY];
  });
  assert.equal(scrollState[2], 'auto');
  assert(scrollState[1] > scrollState[0]);

  const math = worksheet.locator('app-force-definitions app-solver-math .math').first();
  await math.scrollIntoViewIfNeeded();
  const box = await math.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await worksheet.evaluate((host) => host.scrollTop);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(200);
  const after = await worksheet.evaluate((host) => host.scrollTop);
  assert(after > before, 'Wheeling over an equation must scroll Definitions.');

  const diagram = worksheet.locator('app-force-definitions app-solver-diagram').first();
  await diagram.scrollIntoViewIfNeeded();
  const diagramBox = await diagram.boundingBox();
  await page.mouse.move(diagramBox.x + diagramBox.width / 2, diagramBox.y + diagramBox.height / 2);
  const diagramBefore = await worksheet.evaluate((host) => host.scrollTop);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(200);
  assert(
    (await worksheet.evaluate((host) => host.scrollTop)) > diagramBefore,
    'Wheeling over the diagram must scroll Definitions.'
  );

  await worksheet.evaluate((host) => (host.scrollTop = host.scrollHeight));
  const bottom = await worksheet.evaluate((host) => {
    const last = host.querySelector('app-force-definitions > details:last-of-type');
    return {
      scrollTop: host.scrollTop,
      scrollHeight: host.scrollHeight,
      clientHeight: host.clientHeight,
      lastBottom: last.getBoundingClientRect().bottom,
      hostBottom: host.getBoundingClientRect().bottom,
    };
  });
  assert(bottom.lastBottom <= bottom.hostBottom + 2);

  await page.setViewportSize({ width: 900, height: 560 });
  await worksheet.evaluate((host) => (host.scrollTop = host.scrollHeight));
  const shortWindowBottom = await worksheet.evaluate((host) => {
    const last = host.querySelector('app-force-definitions > details:last-of-type');
    return [last.getBoundingClientRect().bottom, host.getBoundingClientRect().bottom];
  });
  assert(shortWindowBottom[0] <= shortWindowBottom[1] + 2);
  console.log('PASS: Definitions grows with expanded sections and scrolls to the final section.');
} finally {
  await browser.close();
}
