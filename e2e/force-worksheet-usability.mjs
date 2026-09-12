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
  d.locator('app-solver-explanation').evaluate((h) => {
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
const geometry = (part) =>
  part.locator('app-solver-diagram > svg').evaluateAll((svgs) =>
    svgs.map((svg) => ({
      polygons: [...svg.querySelectorAll('polygon')].map((p) => p.getAttribute('points')),
      points: [...svg.querySelectorAll('circle')].map((p) => [
        p.getAttribute('cx'),
        p.getAttribute('cy'),
      ]),
    }))
  );
try {
  await openMechanism(page, `${process.env.PMKS_BASE_URL || 'http://localhost:4200/'}?${payload}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const d = page.getByRole('dialog');
  assert.equal(await d.locator('.definitionSection[open], .overviewDetails[open]').count(), 0);
  await page.screenshot({ path: `${out}/definitions-collapsed.png` });
  await d.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  assert.equal(await d.locator('.bodyCard[open]').count(), 0);
  await d.getByRole('button', { name: 'In-motion', exact: true }).click();
  const moving = await snapshot(d);
  assert.equal(moving.mode, 'dynamic');
  assert.equal(moving.status, 'ok');
  assert(moving.bodies[0].force.includes('=m_'));
  assert(moving.bodies[0].moment.includes('=I_'));
  assert(moving.bodies.some((b) => b.inertia.some((v) => Math.abs(v) > 1e-6)));
  await page.screenshot({ path: `${out}/bodies-collapsed.png` });
  const body = d.locator('.bodyCard').first();
  await body.locator(':scope > summary').click();
  assert.equal(await body.locator('.crossProduct[open], .componentBalances[open]').count(), 0);
  const fixed = await geometry(body);
  await d
    .getByRole('combobox', { name: 'Worksheet Gravity' })
    .selectOption({ label: 'Exclude Gravity' });
  const noWeight = await snapshot(d);
  assert.equal(noWeight.gravity, false);
  assert(noWeight.bodies.every((b) => !b.loads.includes('weight')));
  assert.deepEqual(
    noWeight.bodies.map((b) => b.inertia),
    moving.bodies.map((b) => b.inertia)
  );
  assert.notDeepEqual(noWeight.x, moving.x);
  assert.equal(noWeight.graph, moving.graph);
  assert.equal(noWeight.documentGravity, moving.documentGravity);
  assert.deepEqual(await geometry(body), fixed);
  assert(await body.evaluate((el) => el.open));
  await d.getByRole('button', { name: 'Static', exact: true }).click();
  assert((await snapshot(d)).x.every((v) => Math.abs(v) < 1e-6));
  await d.getByRole('button', { name: 'In-motion', exact: true }).click();
  assert.deepEqual((await snapshot(d)).x, noWeight.x);
  await d.getByRole('combobox', { name: 'Worksheet Gravity' }).selectOption('0');
  assert.deepEqual((await snapshot(d)).x, moving.x);
  await body.locator('.inertiaTerms > summary').click();
  await body.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/in-motion-body.png` });
  await d.locator('.conventions > summary').click();
  const joint = d.locator('[data-force-choice="Joint B"]');
  await joint.locator(':scope > summary').click();
  await joint.scrollIntoViewIfNeeded();
  const initial = await geometry(joint);
  const film = filmstrip(page, `${out}/arrow-flip`, await joint.boundingBox());
  await film.shot('before');
  await film.during(30, 8, 'flip', () =>
    joint.getByRole('button', { name: '−X ←', exact: true }).click()
  );
  assert.deepEqual(await geometry(joint), initial);
  assert.deepEqual(await geometry(body), fixed);
  await joint.getByRole('button', { name: '−Y ↓', exact: true }).click();
  assert.deepEqual(await geometry(joint), initial);
  const couple = d
    .locator('.forceConvention')
    .filter({ has: page.getByRole('button', { name: 'CW ↻', exact: true, includeHidden: true }) });
  await couple.locator(':scope > summary').click();
  const coupleGeometry = await geometry(couple);
  await couple.getByRole('button', { name: 'CW ↻', exact: true }).click();
  assert.deepEqual(await geometry(couple), coupleGeometry);
  assert.deepEqual(await geometry(body), fixed);
  await d.locator('.conventions > summary').click();
  await d.getByRole('button', { name: 'Solved Directions', exact: true }).click();
  assert.deepEqual(await geometry(body), fixed);
  await page.setViewportSize({ width: 390, height: 844 });
  await body.locator(':scope > summary').click();
  await d.locator('.forceAssumptions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await d.locator('.katex-error').count(), 0);
  assert.deepEqual(errors, []);
  Object.assign(report, { moving, noWeight, fixedGeometry: true });
  console.log(
    'PASS: collapsed sections, immediate in-motion solve, gravity comparison, unchanged graph, stable force/couple geometry, phone layout.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
