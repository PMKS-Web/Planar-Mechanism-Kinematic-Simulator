/**
 * What force analysis actually says in the running app, per template.
 * Investigation script — reads statuses through ng.getComponent.
 *
 *   PMKS_BASE_URL=<origin> node e2e/force-status-survey.mjs
 */

const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
import { waitForReady } from './app-ready.mjs';

const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
import { TEMPLATE_LINKAGES as payloads, assertTemplatesParsed } from './template-payloads.mjs';

assertTemplatesParsed();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

console.log('templates found:', Object.keys(payloads).join(', '));

for (const [name, payload] of Object.entries(payloads)) {
  await page.goto(`${BASE}/?${payload}`, { waitUntil: 'domcontentloaded' });
  await waitForReady(page).catch(() => undefined);
  await page.waitForTimeout(600);
  const report = await page.evaluate(() => {
    const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return srv.mechanisms.map((mech) => {
      const out = { valid: mech.isMechanismValid() };
      if (!out.valid) return out;
      for (const mode of ['static', 'dynamic']) {
        const series = mech.getForceAnalysis(mode);
        const first = series.frames[0];
        out[mode] = {
          ok: `${series.successfulFrames}/${series.frames.length}`,
          status: first?.status,
          message: first?.message,
          diagnostic: series.diagnostic,
        };
      }
      return out;
    });
  });
  console.log(`\n### ${name}`);
  for (const mech of report) console.log(JSON.stringify(mech, null, 1));
}

if (errors.length) console.log('\nPAGE ERRORS:', errors.slice(0, 5));
await browser.close();
