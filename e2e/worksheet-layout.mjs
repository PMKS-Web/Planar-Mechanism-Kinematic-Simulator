import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const out = 'artifacts/worksheet-layout';
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) =>
  gallery
    .split('\n')
    .find((l) => l.startsWith(`| [${name}]`))
    .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const snapshot = (d) =>
  d.locator('app-solver-explanation').evaluate((h) => {
    const c = window.ng.getComponent(h),
      v = c.view;
    return {
      x: v.forceWork.system.x,
      bodies: v.bodies.map((b) => ({
        id: b.id,
        start: b.startRow,
        eq: b.components.map((e) => e.symbolic),
        loads: b.loads.map((l) => ({ column: l.column, sign: l.sign, vector: l.vector })),
        choices: b.signChoices,
      })),
      unknowns: v.forceWork.system.unknowns.map((u) => u.label),
      A: v.forceWork.system.A,
      b: v.forceWork.system.b,
    };
  });
try {
  await openMechanism(
    page,
    `${process.env.PMKS_BASE_URL || 'http://localhost:4318/'}?${payload('TeachingLab four-bar')}`
  );
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  assert.equal(await page.locator('#analysisWrapper app-solver-explanation').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Graphs', exact: true }).count(), 0);
  const film = filmstrip(page, `${out}/drawer`);
  await film.shot('before');
  await film.during(40, 8, 'open', () =>
    page.getByRole('button', { name: 'How it works', exact: true }).click()
  );
  const drawer = page.locator('#rightPanel');
  await drawer.locator('app-solver-explanation').waitFor();
  assert((await drawer.boundingBox()).x > 700);
  await drawer.getByRole('button', { name: 'Definitions', exact: true }).click();
  assert.equal(
    await drawer.locator('.overviewDetails,.conventions,.forceAssumptions,.controlRow').count(),
    0
  );
  assert(await drawer.locator('app-force-definitions').isVisible());
  const definitions = await drawer.locator('app-force-definitions').innerText();
  assert(definitions.includes('three equations'));
  await drawer.screenshot({ path: `${out}/definitions.png` });
  await drawer.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  assert.equal(await drawer.locator('.conventions').count(), 0);
  assert.equal(
    await drawer.getByText('Substitute This Sample & Check the Balance', { exact: true }).count(),
    0
  );
  await drawer.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  let d = page.getByRole('dialog');
  const before = await snapshot(d);
  const first = d.locator('.bodyCard').first();
  await first.locator('.bodyAdjustments > summary').click();
  const choice = first.locator('[data-convention="Bx on ABH"]');
  await choice.getByRole('button', { name: '−X ←', exact: true }).click();
  const changed = await snapshot(d),
    changedCol =
      before.bodies[0].choices
        .find((c) => c.label === 'Bx on ABH')
        .key.split(':')
        .at(-1) * 1;
  assert.deepEqual(
    changed.x,
    before.x.map((x, i) => (i === changedCol ? -x : x))
  );
  for (let i = 0; i < before.bodies.length; i++)
    changed.bodies[i].loads.forEach((l, j) =>
      assert.deepEqual(l.vector, before.bodies[i].loads[j].vector)
    );
  const second = d.locator('.bodyCard').nth(1);
  await second.locator(':scope > summary').click();
  await second.locator('.bodyAdjustments > summary').click();
  const other = second.locator('[data-convention="Bx on BCFG"]');
  assert.equal(
    await other.getByRole('button', { name: '+X →', exact: true }).getAttribute('aria-pressed'),
    'true'
  );
  await other.getByRole('button', { name: '−X ←', exact: true }).click();
  assert.deepEqual((await snapshot(d)).x, before.x);
  await first
    .locator('[data-convention="Input Moment on ABH"]')
    .getByRole('button', { name: 'CW ↻', exact: true })
    .click();
  await first
    .getByRole('combobox', { name: /Moment Reference Point/ })
    .selectOption({ label: 'A' });
  await first.locator('app-force-balance').screenshot({ path: `${out}/body-assumptions.png` });
  await first.locator('.bodyAdjustments > summary').click();
  await first.locator('app-force-balance').screenshot({ path: `${out}/free-body.png` });
  const current = await snapshot(d);
  const numbers = await d
    .locator('app-force-balance [data-equation-number]')
    .evaluateAll((ns) => ns.map((n) => Number(n.getAttribute('data-equation-number'))));
  assert.deepEqual(
    numbers,
    current.A.map((_, i) => i + 1)
  );
  await d.getByRole('button', { name: 'System', exact: true }).click();
  assert.equal(await d.locator('.conventions,.bodyAdjustments,.forceAssumptions').count(), 0);
  const systemEquations = await d
    .locator('.systemEquations app-solver-math')
    .evaluateAll((ns) => ns.map((n) => window.ng.getComponent(n).equation()));
  assert.deepEqual(
    systemEquations,
    current.bodies.flatMap((b) => b.eq)
  );
  assert.equal(await d.locator('[data-matrix-equation]').count(), current.A.length);
  const headers = await d
    .locator('.coefficientMatrix thead app-solver-math')
    .evaluateAll((ns) => ns.map((n) => window.ng.getComponent(n).equation()));
  assert.deepEqual(headers, current.unknowns);
  assert(await d.locator('.matrixScroll').isVisible());
  const rowPositions = await d
    .locator('.matrixProduct')
    .evaluate((el) =>
      ['.coefficientMatrix', '.unknownVector', '.knownVector'].map((s) =>
        [...el.querySelectorAll(s + ' tbody tr')].map((r) => r.getBoundingClientRect().y)
      )
    );
  rowPositions[0].forEach((y, i) => {
    assert(Math.abs(y - rowPositions[1][i]) < 1);
    assert(Math.abs(y - rowPositions[2][i]) < 1);
  });
  assert.equal(await d.getByText('Equation Row Order', { exact: true }).count(), 0);
  await d.locator('app-solver-matrix').screenshot({ path: `${out}/system.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await d.locator('.matrixScroll').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone-system.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await d.locator('.katex-error').count(), 0);
  await d.getByRole('button', { name: 'Close Worksheet', exact: true }).click();
  await d.waitFor({ state: 'hidden' });
  assert(await page.getByRole('button', { name: 'How it works', exact: true }).isVisible());
  const stripBox = await page.locator('.topStrip').boundingBox();
  assert(
    (await drawer.locator('app-solver-explanation').boundingBox()).y >= stripBox.y + stripBox.height
  );
  await page.screenshot({ path: `${out}/phone-before-mode-change.png` });
  writeFileSync(
    `${out}/phone-layout.json`,
    JSON.stringify(
      await page.evaluate(() => ({
        scroll: [scrollX, scrollY],
        doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        boxes: [
          '.topStrip',
          '.tabCard',
          '#rightPanel',
          '.worksheetPage',
          'app-solver-explanation',
        ].map((s) => {
          const e = document.querySelector(s);
          const r = e.getBoundingClientRect();
          return {
            s,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            overflow: getComputedStyle(e).overflow,
          };
        }),
      })),
      null,
      2
    )
  );
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  assert((await drawer.locator('h2').innerText()).includes('Kinematic Analysis'));
  await page.screenshot({ path: `${out}/phone-kinematic-drawer.png` });
  assert.equal(await page.locator('#analysisWrapper app-solver-explanation').count(), 0);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await drawer.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Velocity', exact: true }).click();
  assert((await d.locator('app-worksheet-loop-visual').count()) > 0);
  assert.equal(await d.locator('.katex-error').count(), 0);
  if (process.env.PMKS_STORYBOOK_URL) {
    await page.route(`${process.env.PMKS_STORYBOOK_URL}/favicon.ico`, (route) =>
      route.fulfill({ status: 204 })
    );
    for (const id of [
      'analysis-force-definitions--without-a-mechanism',
      'analysis-numbered-force-matrix--expanded',
      'analysis-numbered-force-matrix--phone',
    ]) {
      await page.goto(`${process.env.PMKS_STORYBOOK_URL}/iframe.html?id=${id}&viewMode=story`);
      await page.locator('app-force-definitions,app-solver-matrix').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.katex-error').count(), 0);
      await page.screenshot({ path: `${out}/story-${id}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: right drawer, independent definitions, per-body reciprocal signs, moment reference, numbered equations/matrix, unknown headers, kinematics, phone.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ errors }, null, 2));
  await browser.close();
}
