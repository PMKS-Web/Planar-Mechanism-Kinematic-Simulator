// PROTOTYPE: rasterise each case's SVG drawing to PNG with Playwright's Chromium.
//   node src/app/prototype/what-is-this/run/render.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../../../../../artifacts/what-is-this/v2/', import.meta.url);
const { cases } = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
for (const svg of new Set(cases.filter((c) => c.svg).map((c) => c.svg))) {
  await page.setContent(
    `<body style="margin:0">${readFileSync(new URL(svg, root), 'utf8')}</body>`
  );
  await page.screenshot({ path: new URL(svg.replace(/\.svg$/, '.png'), root).pathname });
  console.log('rendered', svg);
}
await browser.close();
