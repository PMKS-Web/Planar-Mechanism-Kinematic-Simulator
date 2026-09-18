import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
const out = 'artifacts/force-diagram-equations';
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
const open = async (name) => {
  await openMechanism(
    page,
    `${process.env.PMKS_BASE_URL || 'http://localhost:4200/'}?${payload(name)}`
  );
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  return page.getByRole('dialog');
};
const geometry = (v) =>
  v
    .locator('svg')
    .evaluate((svg) =>
      [...svg.querySelectorAll('line,circle,polygon')].map((n) =>
        ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'points'].map((a) => n.getAttribute(a))
      )
    );
const equations = (v) =>
  v
    .locator('.equationStep app-solver-math')
    .evaluateAll((nodes) => nodes.map((n) => window.ng.getComponent(n).equation()));
try {
  let d = await open('TeachingLab four-bar');
  assert.equal(await d.locator('.bodyCard[open]').count(), 1);
  const body = d.locator('.bodyCard').first(),
    visual = body.locator('app-force-balance');
  assert(await visual.isVisible());
  assert.equal(await visual.locator('.equationStep').count(), 3);
  assert.equal(await body.locator('.vectorDerivation[open], .bodyAdjustments[open]').count(), 0);
  const fixed = await geometry(visual),
    original = await equations(visual);
  await page.evaluate(() => document.fonts.ready);
  await visual.screenshot({ path: `${out}/complete-fbd.png` });
  for (let i = 1; i <= 3; i++) {
    await visual.getByRole('combobox', { name: 'Read the FBD' }).selectOption(String(i));
    assert.equal(
      await visual.locator('.equationStep.selected').getAttribute('data-balance-axis'),
      String(i - 1)
    );
    assert.deepEqual(await geometry(visual), fixed);
    assert.deepEqual(await equations(visual), original);
    const highlights = await visual.locator('app-solver-diagram').evaluate((h) =>
      window.ng
        .getComponent(h)
        .diagram()
        .lines.filter((l) => l.balanceAxes)
        .map((l) => ({ axes: l.balanceAxes, color: l.color }))
    );
    assert(highlights.some((l) => l.color === 'var(--warning)'));
    highlights.forEach((l) =>
      assert.equal(l.color, l.axes.includes(i - 1) ? 'var(--warning)' : 'var(--text-tertiary)')
    );
  }
  await visual.screenshot({ path: `${out}/moment-balance.png` });
  await d.getByRole('button', { name: 'In-motion', exact: true }).click();
  assert((await equations(visual))[0].includes('=m_'));
  await body.locator('.bodyAdjustments > summary').click();
  await body.getByRole('combobox', { name: /Moment Reference Point/ }).selectOption({ label: 'A' });
  assert((await visual.innerText()).includes('Moment Balance About A'));
  assert((await equations(visual))[2].includes('CoM}/A'));
  const atA = await visual.locator('app-solver-diagram').evaluate((h) =>
    window.ng
      .getComponent(h)
      .diagram()
      .lines.filter((l) => l.label)
      .map((l) => [l.label, l.color])
  );
  assert(atA.some(([label, color]) => label === 'Bx' && color === 'var(--text-tertiary)'));
  assert(atA.some(([label, color]) => label === 'By' && color === 'var(--warning)'));
  const joint = body.locator('[data-convention="Bx on ABH"]');
  const beforeFlip = await equations(visual);
  await joint.getByRole('button', { name: '−X ←', exact: true }).click();
  assert.notEqual((await equations(visual))[0], beforeFlip[0]);
  assert.equal((await equations(visual))[1], beforeFlip[1]);
  await body.locator('.bodyAdjustments > summary').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await visual.scrollIntoViewIfNeeded();
  await visual.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await d.getByRole('button', { name: 'Assemble & Solve', exact: true }).click();
  assert(await d.locator('app-solver-matrix').isVisible());
  await page.setViewportSize({ width: 1440, height: 1100 });
  d = await open('TeachingLab slider-crank');
  const slider = d.locator('.bodyCard').filter({ hasText: 'Slider block' });
  assert.equal(await slider.count(), 1);
  if (!(await slider.evaluate((el) => el.open))) await slider.locator(':scope > summary').click();
  assert.equal(await slider.locator('.equationStep').count(), 2);
  assert.equal(await slider.getByRole('option', { name: 'Moment Balance' }).count(), 0);
  assert.equal(await d.locator('.katex-error').count(), 0);
  if (process.env.PMKS_STORYBOOK_URL) {
    await page.route(`${process.env.PMKS_STORYBOOK_URL}/favicon.ico`, (route) =>
      route.fulfill({ status: 204 })
    );
    for (const state of ['static', 'in-motion']) {
      await page.goto(
        `${process.env.PMKS_STORYBOOK_URL}/iframe.html?id=analysis-from-fbd-to-equations--${state}&viewMode=story`
      );
      await page.locator('app-force-balance').waitFor();
      await page.getByRole('combobox', { name: 'Read the FBD' }).selectOption('3');
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.equationStep.selected').count(), 1);
      await page.screenshot({ path: `${out}/story-${state}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: FBD-first entry, visible body equations, axis highlighting, fixed geometry, dynamic balance, references, signs, system navigation, slider and phone.'
  );
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ errors }, null, 2));
  await browser.close();
}
