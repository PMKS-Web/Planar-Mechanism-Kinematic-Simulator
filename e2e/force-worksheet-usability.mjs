import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const out = 'artifacts/force-worksheet-usability';
mkdirSync(out, { recursive: true });
const payload = readFileSync('docs/fixture-urls.md', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('| [TeachingLab four-bar]'))
  .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [],
  report = {};
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const snapshot = (d) =>
  d.evaluate((h) => {
    const c = window.ng.getComponent(h),
      v = c.view;
    return {
      mode: v.force.frame.mode,
      status: v.force.frame.status,
      gravity: v.gravity,
      graph: c.solved.getForceAnalysis('dynamic').frames[c.step].inputEffort.valueSI,
      documentGravity: c.solved.gravity,
      x: v.forceWork.system.x,
      bodies: v.bodies.map((b) => ({
        force: b.forceVector,
        moment: b.momentVector,
        inertia: b.inertia,
        loads: b.loads.map((l) => l.kind),
      })),
    };
  });
try {
  await openMechanism(page, `${process.env.PMKS_BASE_URL || 'http://localhost:4200/'}?${payload}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  const worksheet = page.locator('app-right-panel app-solver-explanation').first();
  await worksheet.waitFor();
  assert.equal(await worksheet.locator('details[open]').count(), 0);
  const overview = worksheet.locator('.overviewDetails');
  await overview.locator(':scope > summary').click();
  await overview.getByRole('button', { name: 'In-motion', exact: true }).click();
  const moving = await snapshot(worksheet);
  assert.equal(moving.mode, 'dynamic');
  assert.equal(moving.status, 'ok');
  assert(moving.bodies[0].force.includes('=m_'));
  assert(moving.bodies[0].moment.includes('=I_'));
  assert(moving.bodies.some((body) => body.inertia.some((value) => Math.abs(value) > 1e-6)));

  const body = worksheet.locator('.bodyCard').first();
  assert.equal(await body.getAttribute('open'), null);
  await body.locator(':scope > summary').click();
  await body.locator('.bodyStep').first().locator(':scope > summary').click();
  const linkShape = () =>
    worksheet.evaluate((host) => {
      const diagram = window.ng.getComponent(host).view.bodies[0].projectionGrid;
      return {
        outlines: diagram.outlines,
        lines: diagram.lines
          .filter((line) => !line.arrow && line.width >= 3)
          .map((line) => ({ from: line.from, to: line.to })),
      };
    });
  const fixed = await linkShape();
  assert(fixed.outlines.length + fixed.lines.length > 0);
  await overview
    .getByRole('combobox', { name: 'Worksheet Gravity' })
    .selectOption({ label: 'Exclude Gravity' });
  const noWeight = await snapshot(worksheet);
  assert.equal(noWeight.gravity, false);
  assert(noWeight.bodies.every((body) => !body.loads.includes('weight')));
  assert.deepEqual(
    noWeight.bodies.map((body) => body.inertia),
    moving.bodies.map((body) => body.inertia)
  );
  assert.notDeepEqual(noWeight.x, moving.x);
  assert.equal(noWeight.graph, moving.graph);
  assert.equal(noWeight.documentGravity, moving.documentGravity);
  assert.deepEqual(await linkShape(), fixed);

  await overview.getByRole('button', { name: 'Static', exact: true }).click();
  assert((await snapshot(worksheet)).x.every((value) => Math.abs(value) < 1e-6));
  await overview.getByRole('button', { name: 'In-motion', exact: true }).click();
  assert.deepEqual((await snapshot(worksheet)).x, noWeight.x);
  await overview.getByRole('combobox', { name: 'Worksheet Gravity' }).selectOption('0');
  assert.deepEqual((await snapshot(worksheet)).x, moving.x);

  await body.locator('.bodyAdjustments > summary').click();
  const direction = body.locator('.bodyAdjustments select').first();
  const film = filmstrip(page, `${out}/arrow-flip`, await direction.boundingBox());
  await film.shot('before');
  await film.during(30, 8, 'flip', () => direction.selectOption('1'));
  assert.deepEqual(await linkShape(), fixed);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  assert.deepEqual(errors, []);
  Object.assign(report, { moving, noWeight, fixedGeometry: true });
  console.log(
    'PASS: collapsed sections, in-motion solve, gravity comparison, stable link geometry, phone layout.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
