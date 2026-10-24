/** Retained audit cases in the running app; numerical oracles and visible graph evidence. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { AUDIT_FIXTURES } from '../src/test-utils/verification/audit-fixtures.ts';
import { openMechanism } from './app-ready.mjs';
import { startQuiet } from './quiet-start.mjs';
import { filmstrip, contactSheet } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/mechanism-audit';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const evidence = {};
const open = async (id) => {
  const fixture = AUDIT_FIXTURES.find((entry) => entry.id === id);
  await openMechanism(page, `${BASE}/?${fixture.payload}`);
  assert.equal(
    await page.evaluate(
      () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length
    ),
    fixture.joints
  );
};
try {
  await open(1);
  evidence.immobile = await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0];
    return { dof: m.dof, valid: m.isMechanismValid(), frames: m.joints.length };
  });
  assert.deepEqual(evidence.immobile, { dof: 0, valid: false, frames: 1 });
  console.log('PASS #1: immobile welded drawing is refused without deforming');

  await open(64);
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  evidence.clockwise = await page.evaluate(() => {
    const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.mechanisms[0];
    const c0 = m.joints[0].find((j) => j.id === 'C');
    return {
      valid: m.isMechanismValid(),
      period: m.cyclePeriod,
      sliderDrift: Math.max(
        ...m.joints.map((row) => {
          const c = row.find((j) => j.id === 'C');
          return Math.hypot(c.x - c0.x, c.y - c0.y);
        })
      ),
      frames: m.joints.length,
    };
  });
  assert.equal(evidence.clockwise.valid, true);
  assert.ok(Math.abs(evidence.clockwise.period - 6) < 1e-8);
  assert.ok(evidence.clockwise.sliderDrift < 1e-6);
  await page.waitForTimeout(300);
  const film = filmstrip(page, `${OUT}/clockwise`);
  for (let turn = 0; turn <= 4; turn++) {
    await page.evaluate((quarter) => {
      const srv = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      srv.animate(Math.round((quarter * (srv.mechanisms[0].joints.length - 1)) / 4), false);
    }, turn);
    await film.shot(`quarter-${turn}`);
  }
  await contactSheet(`${OUT}/clockwise/*.png`, `${OUT}/clockwise-filmstrip.png`, 3);
  console.log('PASS #64: clockwise cycle closes in six seconds with stationary slider');

  await open(58);
  // The overview's member button selects the member in Edit; return to analysis afterward.
  await page.getByRole('button', { name: 'BC', exact: true }).click();
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: /Angular acceleration/ }).click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('app-analysis-graph')].some(
      (el) => ng.getComponent(el).mechProp === 'Angular Link Acc'
    )
  );
  evidence.smallAcceleration = await page.evaluate(() => {
    const graph = [...document.querySelectorAll('app-analysis-graph')]
      .map((el) => ng.getComponent(el))
      .find((c) => c.mechProp === 'Angular Link Acc');
    const values = graph.chartOptions.series.flatMap((s) => s.data.map((point) => point.y));
    return { peak: Math.max(...values.map(Math.abs)), samples: values.length };
  });
  assert.ok(Math.abs(evidence.smallAcceleration.peak - 0.0000162187913) < 1e-10);
  assert.ok(evidence.smallAcceleration.samples > 300);
  await page
    .locator('app-analysis-graph-section', { hasText: 'Angular acceleration' })
    .screenshot({ path: `${OUT}/small-acceleration.png` });
  console.log('PASS #58: visible degree-acceleration graph retains independent nonzero peak');

  await open(68);
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  const overview = await page.locator('app-analysis-panel').innerText();
  assert.doesNotMatch(overview, /Jansen|Strandbeest/);
  console.log('PASS #68: independent four-bar bank is not labeled a Jansen leg');
  assert.deepEqual(errors, []);
  writeFileSync(`${OUT}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log('PASS no browser exceptions');
} finally {
  await browser.close();
}
