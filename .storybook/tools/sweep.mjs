// Visit every entry in the running gallery and report console errors and empty renders.
const ROOT = process.cwd();
const { chromium } = await import(`${ROOT}/node_modules/playwright/index.mjs`);
const BASE = process.env.SB_URL ?? 'http://localhost:6006';

const index = await (await fetch(`${BASE}/index.json`)).json();
const entries = Object.values(index.entries);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
let bad = 0;
for (const entry of entries) {
  const errors = [];
  const onError = (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160));
  const onPageError = (e) => errors.push(String(e).slice(0, 160));
  page.on('console', onError);
  page.on('pageerror', onPageError);
  // 'load' rather than 'networkidle': the notification stack and the dev server's
  // HMR socket keep a page from ever going idle.
  await page
    .goto(`${BASE}/iframe.html?id=${entry.id}&viewMode=${entry.type}`, {
      waitUntil: 'load',
      timeout: 45000,
    })
    .catch((e) => errors.push(`goto: ${String(e).slice(0, 120)}`));
  await page.waitForTimeout(entry.type === 'docs' ? 2500 : 1200);
  const text = (await page.locator('#storybook-root, #storybook-docs').allInnerTexts())
    .join('')
    .trim();
  const html = await page
    .locator('#storybook-root')
    .innerHTML()
    .catch(() => '');
  page.off('console', onError);
  page.off('pageerror', onPageError);
  const empty = entry.type === 'story' && html.replace(/<!--.*?-->/gs, '').trim().length < 40;
  if (errors.length || empty) {
    bad++;
    console.log(`FAIL ${entry.id}${empty ? ' (renders nothing)' : ''}`);
    for (const e of errors.slice(0, 3)) console.log(`     ${e}`);
  } else console.log(`ok   ${entry.id}${entry.type === 'docs' ? '' : `  (${text.length} chars)`}`);
}
console.log(`\n${entries.length} entries, ${bad} failing`);
await browser.close();
process.exit(bad ? 1 : 0);
