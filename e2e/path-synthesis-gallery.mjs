/** Render and audit every path-result state against the built gallery's real styles. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const root = resolve('storybook-static'),
  out = 'artifacts/path-backend/gallery';
mkdirSync(out, { recursive: true });
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const server = createServer(async (request, response) => {
  const path = resolve(
    root,
    '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  );
  if (!path.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, 'localhost', resolve));
const base = 'http://localhost:' + server.address().port;
const browser = await chromium.launch(),
  page = await browser.newPage({ viewport: { width: 700, height: 900 } });
const report = [],
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  const index = JSON.parse(await readFile(resolve(root, 'index.json'), 'utf8'));
  const entries = Object.values(index.entries).filter(
    (e) => e.type === 'story' && e.title === 'Feedback/Path synthesis'
  );
  assert.equal(entries.length, 9);
  for (const entry of entries) {
    await page.goto(base + '/iframe.html?id=' + entry.id + '&viewMode=story');
    await page.locator('app-path-synthesis-result').waitFor();
    await page.waitForTimeout(250);
    await page.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') });
    const audit = await page.evaluate(() =>
      axe.run(document.querySelector('app-path-synthesis-result'))
    );
    report.push({ story: entry.id, violations: audit.violations });
    assert.deepEqual(audit.violations, [], entry.id);
    await page.screenshot({ path: out + '/' + entry.id + '.png' });
    console.log('PASS ' + entry.id);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(out + '/report.json', JSON.stringify({ report, errors }, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
