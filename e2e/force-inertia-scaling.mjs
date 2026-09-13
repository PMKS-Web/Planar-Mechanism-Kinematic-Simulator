/** Physical force/moment values survive URL loading, mode changes and graph readouts.
 * PMKS_PLAYWRIGHT_DIR=.. PMKS_BASE_URL=http://localhost:4318 node e2e/force-inertia-scaling.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '..') + '/node_modules/playwright/index.mjs'
);
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const out = 'artifacts/force-inertia-scaling';
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) => {
  const row = gallery.split('\n').find((line) => line.includes(`[${name}](`));
  assert.ok(row, name);
  return row.match(/https?:\/\/[^?]+\?([^)]*)/)[1];
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const results = [];
try {
  for (const name of ['Centripetal force scaling', 'Physical applied-force moment']) {
    await openMechanism(page, `${base}/?${payload(name)}`);
    // Existing readiness requires gravity or an external force, even in dynamic mode.
    // Keep weight for the first demonstration and inspect the horizontal component.
    await page.evaluate((centripetal) => {
      const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      srv.settingsService.isGravity.next(centripetal);
      srv.updateMechanism();
      srv.activeObjService.updateSelectedObj(srv.joints.find((joint) => joint.id === 'A'));
    }, name === 'Centripetal force scaling');
    await page.locator('.tabButton', { hasText: 'Force' }).first().click();
    await page.locator('.forceModeRow').waitFor();
    const rows = page.locator('app-analysis-graph-section .graphHeader');
    await rows.first().waitFor();
    if (name === 'Centripetal force scaling') {
      const film = filmstrip(page, `${out}/motion`);
      await film.during(60, 8, 'mode', () =>
        page.locator('.forceModeRow button', { hasText: 'In-motion' }).click()
      );
      const reaction = rows.filter({ hasText: 'Force on Link AB' }).first();
      await reaction.click();
      await page.locator('.seriesSplit button', { hasText: 'X & Y components' }).click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.graphHeader')].some(
          (row) => row.textContent.includes('Force on Link AB') && row.textContent.includes('0.02')
        )
      );
      assert.match(await reaction.innerText(), /[−-]0\.02, 9\.81\s*N/);
      const physical = await page.evaluate(() => {
        const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv
          .mechanisms[0];
        const f = m.getForceAnalysis('dynamic').frames[0];
        return { scale: m.coordinateScale, reaction: f.jointReactions.get('A'), status: f.status };
      });
      assert.equal(physical.status, 'ok');
      assert.ok(Math.abs(physical.reaction[0] + 0.02) < 1e-5);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/centripetal.png` });
      results.push({ name, physical, readout: await reaction.innerText() });
    } else {
      await page.locator('.forceModeRow button', { hasText: 'Static' }).click();
      const torque = rows.filter({ hasText: 'Input Torque' }).first();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.graphHeader')].some(
          (row) => row.textContent.includes('Input Torque') && row.textContent.includes('200')
        )
      );
      assert.match(await torque.innerText(), /200(?:\.0+)?\s*N·cm/);
      const physical = await page.evaluate(
        () =>
          ng
            .getComponent(document.querySelector('app-new-grid'))
            .mechanismSrv.mechanisms[0].getForceAnalysis('static').frames[0].inputEffort.valueSI
      );
      assert.ok(Math.abs(physical - 2) < 1e-10);
      await torque.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/applied-moment.png` });
      results.push({ name, physical, readout: await torque.innerText() });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS physical force and moment URL, mode, graph and readout checks');
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
  await page.screenshot({ path: `${out}/last-state.png` });
  await browser.close();
}
