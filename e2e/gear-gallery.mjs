import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.PMKS_STORYBOOK_URL ?? 'http://localhost:4331',
  out = 'artifacts/gears/gallery';
mkdirSync(out, { recursive: true });
const index = JSON.parse(readFileSync('storybook-static/index.json', 'utf8'));
const stories = Object.values(index.entries).filter(
  (e) =>
    e.type === 'story' &&
    [
      'Fields/Gear Properties',
      'Feedback/Gear Mesh',
      'Canvas/Gear',
      'Canvas/Gear Shaft',
      'Fields/Compound Gear Shaft',
    ].includes(e.title)
);
assert.equal(stories.length, 24);
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  page = await browser.newPage({ viewport: { width: 720, height: 750 } }),
  errors = [],
  results = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  for (const story of stories) {
    await page.goto(base + '/iframe.html?id=' + story.id + '&viewMode=story');
    await page.waitForTimeout(450);
    assert.equal((await page.locator('#storybook-root > *').count()) > 0, true);
    assert.equal(await page.locator('.sb-errordisplay').isVisible(), false);
    await page.screenshot({ path: out + '/' + story.id + '.png' });
    results.push(story.id);
  }
  assert.deepEqual(errors, []);
  writeFileSync(out + '/report.json', JSON.stringify({ status: 'PASS', results, errors }, null, 2));
  console.log('PASS ' + results.length + ' gear gallery states');
} finally {
  await browser.close();
}
