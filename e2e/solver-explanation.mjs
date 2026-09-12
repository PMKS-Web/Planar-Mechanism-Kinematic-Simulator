import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL || 'http://localhost:4200/';
const out = path.resolve('artifacts/solver-worksheet');
mkdirSync(out, { recursive: true });
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const payload = (name) => {
  const line = gallery.split('\n').find((l) => l.startsWith(`| [${name}]`));
  assert(line, `Fixture ${name}`);
  return line.match(/\?([^)]*)\)/)[1];
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PMKS_CHROME_CHANNEL || 'chrome',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];
const report = {};
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const cleanMath = async () =>
  assert.equal(await page.locator('.katex-error').count(), 0, 'Every equation must typeset');
const open = async (name, force = false) => {
  await openMechanism(page, `${base}?${payload(name)}`);
  await page.getByRole('button', { name: force ? /Force Analysis/ : /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await page.evaluate(() => document.fonts.ready);
  return dialog;
};
const setSample = async (dialog, value) => {
  const input = dialog.getByRole('spinbutton', { name: 'Explanation sample number' });
  await input.fill(String(value));
  await input.press('Tab');
};
try {
  let dialog = await open('TeachingLab four-bar');
  await setSample(dialog, 30);
  report.positionCards = await dialog.locator('.positionCard').count();
  assert(report.positionCards >= 7);
  await cleanMath();
  await page.screenshot({ path: `${out}/position-worksheet.png` });
  await dialog
    .locator('.circleCard')
    .first()
    .screenshot({ path: `${out}/two-circles.png` });
  for (const name of ['Velocity', 'Acceleration']) {
    await dialog.getByRole('button', { name, exact: true }).click();
    await cleanMath();
    assert(
      (await dialog.locator('.motionCard').count()) >= 10,
      'Joint and center-of-mass derivations'
    );
    await dialog
      .locator('.loopCard')
      .first()
      .screenshot({ path: `${out}/${name.toLowerCase()}-loop.png` });
    await dialog
      .locator('.motionCard')
      .last()
      .screenshot({ path: `${out}/${name.toLowerCase()}-com.png` });
  }
  await dialog.getByRole('button', { name: 'Close Worksheet', exact: true }).click();
  dialog = await open('TeachingLab four-bar', true);
  await dialog.getByRole('button', { name: 'In-motion', exact: true }).click();
  await setSample(dialog, 30);
  await cleanMath();
  await page.screenshot({ path: `${out}/force-definitions.png` });
  await dialog.getByRole('button', { name: 'Free Bodies', exact: true }).click();
  assert.equal(await dialog.locator('.bodyCard').count(), 3);
  await cleanMath();
  report.force = await dialog.locator('app-solver-explanation').evaluate((host) => {
    const c = window.ng.getComponent(host),
      d = c.view.force;
    return {
      step: c.step,
      trace: d.frame.inputEffort.valueSI,
      graph: c.solved.getForceAnalysis('dynamic').frames[c.step].inputEffort.valueSI,
    };
  });
  assert.equal(report.force.trace, report.force.graph);
  for (let i = 0; i < 3; i++)
    await dialog
      .locator('.bodyCard')
      .nth(i)
      .screenshot({ path: `${out}/free-body-${i + 1}.png` });
  await dialog.getByRole('button', { name: 'Solved Directions', exact: true }).click();
  await dialog
    .locator('.bodyCard')
    .first()
    .screenshot({ path: `${out}/free-body-solved.png` });
  await dialog.getByRole('button', { name: 'System', exact: true }).click();
  await cleanMath();
  await dialog.locator('app-solver-matrix').screenshot({ path: `${out}/force-system.png` });
  await dialog.getByRole('button', { name: 'Close Worksheet', exact: true }).click();

  dialog = await open('TeachingLab slider-crank');
  await setSample(dialog, 40);
  await cleanMath();
  assert.equal(await dialog.locator('.circleLineCard').count(), 1);
  await dialog.locator('.circleLineCard').screenshot({ path: `${out}/circle-line.png` });
  await dialog.getByRole('button', { name: 'Velocity', exact: true }).click();
  await cleanMath();
  await dialog
    .locator('.loopCard')
    .first()
    .screenshot({ path: `${out}/slider-velocity.png` });
  await dialog.getByRole('button', { name: 'Position', exact: true }).click();
  const slider = dialog.getByRole('slider', { name: 'Explanation sample', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  const framesDir = path.resolve(out, 'scrub');
  assert(framesDir.startsWith(out + path.sep));
  const film = filmstrip(page, framesDir);
  await film.shot('before');
  await film.during(40, 8, 'scrub', async () => {
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 18 });
    await page.mouse.up();
  });
  await film.shot('settled');
  await cleanMath();
  report.slider = await dialog.locator('app-solver-explanation').evaluate((host) => {
    const c = window.ng.getComponent(host);
    return { step: c.step, errors: c.view.circleLines.map((l) => l.residual) };
  });
  assert(report.slider.errors.every((e) => e < 1e-6));
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.locator('.circleLineCard').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/phone.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  dialog = await open('Two four-bars');
  await dialog.getByRole('combobox', { name: 'Explanation mechanism' }).selectOption('M2');
  report.machine = await dialog.locator('app-solver-explanation').evaluate((host) => {
    const c = window.ng.getComponent(host);
    return { id: c.machineId, joints: c.view.circles.map((p) => p.jointId) };
  });
  assert.equal(report.machine.id, 'M2');
  assert(report.machine.joints.includes('G'));
  await page.keyboard.press('Escape');
  dialog = await open('Cylinder-driven boom');
  await dialog.getByRole('button', { name: 'Velocity', exact: true }).click();
  assert(await dialog.getByRole('heading', { name: 'Differentiated Constraints' }).isVisible());
  await cleanMath();
  assert.deepEqual(errors, []);
  const sheet = await context.newPage();
  const frames = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  await sheet.setViewportSize({ width: 1450, height: 500 });
  await sheet.setContent(
    `<style>body{margin:5px;background:#ddd;display:grid;grid-template-columns:repeat(5,280px);gap:6px}img{width:280px}</style>${frames.map((f) => `<img src="data:image/png;base64,${readFileSync(path.join(framesDir, f)).toString('base64')}">`).join('')}`
  );
  await sheet.screenshot({ path: `${out}/scrub-sheet.png`, fullPage: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
