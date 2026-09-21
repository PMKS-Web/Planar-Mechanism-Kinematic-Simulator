import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const out = 'artifacts/force-axes-and-arms';
mkdirSync(out, { recursive: true });
const payload = readFileSync('docs/fixture-urls.md', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('| [TeachingLab four-bar]'))
  .match(/\?([^)]*)\)/)[1];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);
const labelsDoNotOverlap = async (root) => {
  const collisions = await root.locator('svg').evaluateAll((svgs) =>
    svgs.flatMap((svg) => {
      const text = [...svg.querySelectorAll('[data-diagram-label]')]
        .map((t) => ({ label: t.textContent.trim(), r: t.getBoundingClientRect() }))
        .filter((t) => t.r.width && t.r.height);
      return text.flatMap((a, i) =>
        text
          .slice(i + 1)
          .flatMap((b) =>
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 &&
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1
              ? [[a.label, b.label]]
              : []
          )
      );
    })
  );
  assert.deepEqual(collisions, []);
};
const state = (d) =>
  d.locator('app-solver-explanation').evaluate((el) => {
    const v = window.ng.getComponent(el).view;
    return {
      angle: v.axisAngle,
      system: v.forceWork.system,
      bodies: v.bodies.map((b) => ({
        points: b.diagram.points,
        lines: b.diagram.lines,
        loads: b.loads,
        equations: b.components.map((c) => c.symbolic),
        products: b.crossProducts,
      })),
    };
  });
try {
  await openMechanism(page, `${process.env.PMKS_BASE_URL || 'http://localhost:4318/'}?${payload}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Definitions', exact: true }).click();
  const defs = d.locator('app-force-definitions');
  const example = await defs
    .locator('app-solver-diagram')
    .nth(1)
    .evaluate((el) => window.ng.getComponent(el).diagram());
  assert.equal(example.outlines[0].length, 4);
  const com = example.points.find((p) => p.label === 'CoM');
  assert.equal(com.x, 95);
  assert.equal(com.y, 35);
  assert(
    example.outlines[0].some((p) => p.y < com.y) && example.outlines[0].some((p) => p.y > com.y)
  );
  assert(example.lines.some((l) => l.label === 'W_AB'));
  assert(example.lines.some((l) => l.label === 'F_1'));
  assert(example.couples.some((couple) => couple.label === 'M_A'));
  assert.equal(example.axisMomentLabel, 'M');
  assert.equal(await defs.locator('table').count(), 1);
  assert.equal(await defs.locator('.definitionStep').count(), 4);
  assert(
    await defs.locator('details').evaluateAll((details) => details.every((detail) => !detail.open))
  );
  await defs
    .locator('details')
    .evaluateAll((details) => details.forEach((detail) => (detail.open = true)));
  assert((await defs.innerText()).includes('Sum of Forces'));
  assert((await defs.innerText()).includes('Sum of Moments'));
  const reference = defs.getByRole('combobox', { name: 'Moment reference for definition' });
  const xDiagram = defs.locator('app-solver-diagram').nth(2);
  const yDiagram = defs.locator('app-solver-diagram').nth(3);
  assert(
    (await xDiagram.evaluate((el) => window.ng.getComponent(el).diagram())).lines
      .filter((line) => line.label?.endsWith('x'))
      .every((line) => line.color === 'var(--warning)')
  );
  assert(
    (await yDiagram.evaluate((el) => window.ng.getComponent(el).diagram())).lines
      .filter((line) => line.label?.endsWith('y'))
      .every((line) => line.color === 'var(--warning)')
  );
  const referenceExample = defs.locator('app-solver-diagram').nth(4);
  const armGrid = defs.locator('app-solver-diagram').nth(5);
  let referenceDiagram = await referenceExample.evaluate((el) =>
    window.ng.getComponent(el).diagram()
  );
  let gridDiagram = await armGrid.evaluate((el) => window.ng.getComponent(el).diagram());
  assert(gridDiagram.lines.some((l) => l.label === 'r_B/A,x'));
  assert(gridDiagram.lines.some((l) => l.label === 'r_P/A,y'));
  await reference.selectOption('B');
  referenceDiagram = await referenceExample.evaluate((el) => window.ng.getComponent(el).diagram());
  gridDiagram = await armGrid.evaluate((el) => window.ng.getComponent(el).diagram());
  assert.equal(referenceDiagram.axisMomentLabel, 'M');
  assert(referenceDiagram.points.find((p) => p.label === 'B').reference);
  assert(gridDiagram.lines.some((l) => l.label === 'r_A/B,x'));
  await labelsDoNotOverlap(defs);
  await defs.screenshot({ path: `${out}/definitions.png` });
  await defs
    .locator('.definitionStep')
    .nth(3)
    .screenshot({ path: `${out}/definition-equations.png` });
  await armGrid.screenshot({ path: `${out}/definition-moment-grid.png` });
  assert((await defs.textContent()).includes('Static condition'));
  await d.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  await d.locator('.overviewDetails > summary').click();
  const before = await state(d);
  const angleInput = d.getByRole('spinbutton', { name: 'Worksheet X-axis angle' });
  const film = filmstrip(page, `${out}/axis-change`);
  await film.during(35, 8, 'rotate', async () => {
    await angleInput.fill('30');
    await angleInput.press('Tab');
  });
  const rotated = await state(d);
  assert.equal(rotated.angle, 30);
  rotated.bodies.forEach((b, i) =>
    b.points.forEach((p, j) => {
      near(p.x, before.bodies[i].points[j].x);
      near(p.y, before.bodies[i].points[j].y);
    })
  );
  rotated.system.A.forEach((row, i) =>
    near(
      row.reduce((s, a, j) => s + a * rotated.system.x[j], 0),
      rotated.system.b[i]
    )
  );
  assert.notDeepEqual(rotated.system.x, before.system.x);
  const body = d.locator('.bodyCard').first();
  await body.locator('app-force-balance').screenshot({ path: `${out}/rotated-fbd.png` });
  assert(rotated.bodies[0].equations[0].startsWith('\\sum F_x='));
  await body.locator('.bodyAdjustments > summary').click();
  assert((await body.innerText()).includes('joint B assumption on link BCFG'));
  await body
    .locator('[data-convention="Bx on ABH"]')
    .getByRole('button', { name: '−X', exact: true })
    .click();
  assert.equal((await state(d)).angle, 30);
  await body.getByRole('combobox', { name: /Moment Reference Point/ }).selectOption({ label: 'A' });
  await body.locator('.bodyAdjustments > summary').click();
  await body.locator('.vectorDerivation > summary').click();
  const product = body
    .locator('.crossProduct')
    .filter({ has: page.locator('summary', { hasText: 'Force at B' }) });
  await product.locator('summary').click();
  await labelsDoNotOverlap(body);
  await product.screenshot({ path: `${out}/moment-arm.png` });
  const current = await state(d);
  const cross = current.bodies[0].products.find((p) => p.point === 'B');
  assert(cross.evaluation.includes('B_{'));
  assert(!cross.numbers.includes('\\mathrm N'));
  assert.equal(cross.diagram.axisAngle, 30);
  await page.setViewportSize({ width: 390, height: 844 });
  await product.locator('app-solver-diagram').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/phone-arm.png` });
  await labelsDoNotOverlap(body);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1100 });
  for (const angle of [90, 180, 270]) {
    await angleInput.fill(String(angle));
    await angleInput.press('Tab');
    const turned = await state(d);
    turned.system.A.forEach((row, i) =>
      near(
        row.reduce((s, a, j) => s + a * turned.system.x[j], 0),
        turned.system.b[i]
      )
    );
    assert(
      await body.locator('app-force-balance .axisLabel').evaluateAll((labels) =>
        labels.every((t) => {
          const b = t.getBBox();
          return b.x >= 0 && b.y >= 0 && b.x + b.width <= 360 && b.y + b.height <= 250;
        })
      ),
      JSON.stringify({
        angle,
        labels: await body.locator('app-force-balance .axisLabel').evaluateAll((labels) =>
          labels.map((t) => ({
            text: t.textContent,
            box: {
              x: t.getBBox().x,
              y: t.getBBox().y,
              width: t.getBBox().width,
              height: t.getBBox().height,
            },
          }))
        ),
      })
    );
    await labelsDoNotOverlap(body);
  }
  await angleInput.fill('30');
  await angleInput.press('Tab');
  await d.getByRole('button', { name: 'System', exact: true }).click();
  assert.equal((await state(d)).angle, 30);
  assert.equal(await d.locator('.katex-error').count(), 0);
  if (process.env.PMKS_STORYBOOK_URL) {
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.route(`${process.env.PMKS_STORYBOOK_URL}/favicon.ico`, (r) =>
      r.fulfill({ status: 204 })
    );
    for (const story of ['rotated-axes', 'negative-components', 'crowded-labels']) {
      await page.goto(
        `${process.env.PMKS_STORYBOOK_URL}/iframe.html?id=analysis-force-axes-and-moment-arms--${story}&viewMode=story`
      );
      await page.locator('app-solver-diagram').waitFor();
      await labelsDoNotOverlap(page.locator('app-solver-diagram'));
      await page.screenshot({ path: `${out}/story-${story}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: centered two-joint bar, vector moments, rotated axes and matrix balance, fixed body geometry, reciprocal assumptions, symbolic forces, moment-arm sketches, label collision checks, phone.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ errors }, null, 2));
  await browser.close();
}
