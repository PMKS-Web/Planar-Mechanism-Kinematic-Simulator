// An isolated fixture viewer, deliberately outside the production application.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv.includes('--reuse')) {
  const built = spawnSync(
    process.execPath,
    [
      resolve(root, 'node_modules/@angular/cli/bin/ng.js'),
      'test',
      '--watch=false',
      '--include=src/tests/verification/gear-preview.spec.ts',
    ],
    {
      cwd: root,
      env: { ...process.env, PMKS_WRITE_GEAR_PREVIEW: '1' },
      stdio: 'inherit',
    }
  );
  if (built.status !== 0) process.exit(built.status ?? 1);
}
const files = new Map([
  ['/', ['scripts/gear-preview.html', 'text/html']],
  ['/viewer.js', ['scripts/gear-preview-viewer.mjs', 'text/javascript']],
  ['/samples.json', ['artifacts/gears/samples.json', 'application/json']],
]);
// Fail before opening a port when there is no successful solver export.
JSON.parse(readFileSync(resolve(root, 'artifacts/gears/samples.json'), 'utf8'));
const server = createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': `${file[1]}; charset=utf-8`,
    'Cache-Control': 'no-store',
  });
  response.end(readFileSync(resolve(root, file[0])));
});
const port = Number(process.env.PMKS_GEAR_PORT ?? 4329);
server.listen(port, 'localhost', async () => {
  const url = `http://localhost:${port}`;
  console.log(`Gear solver preview: ${url}`);
  if (process.argv.includes('--open')) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
  }
});
