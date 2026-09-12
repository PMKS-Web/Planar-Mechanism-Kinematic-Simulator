import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL || 'http://localhost:4200/';
const out = path.resolve('artifacts/solver-explanation');
mkdirSync(out, { recursive: true });
const templates = readFileSync('src/app/component/MODALS/templates/template-linkages.ts', 'utf8');
const gallery = readFileSync('docs/fixture-urls.md', 'utf8');
const galleryPayload = (name) => {
  const line = gallery.split('\n').find((one) => one.startsWith(`| [${name}]`));
  assert(line, `No fixture ${name}`);
  return line.match(/\?([^)]*)\)/)[1];
};
const payload = (key) => {
  const match = templates.match(new RegExp(`(?:'${key}'|${key}):\\s*'([^']+)'`));
  assert(match, `No template ${key}`);
  return match[1];
};
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PMKS_CHROME_CHANNEL || 'chrome',
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const report = {};
try {
  await openMechanism(page, `${base}?${payload('Punch_Press')}`);
  await page.getByRole('button', { name: /Force Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.locator('.bodyCard').first().waitFor();
  await page.waitForTimeout(300);
  report.bodies = await page.locator('.bodyCard').count();
  assert(report.bodies > 1, 'All moving bodies must be shown');
  await page.screenshot({ path: `${out}/force-desktop.png` });
  await page
    .locator('.bodyCard')
    .first()
    .screenshot({ path: `${out}/force-body.png` });
  await page.getByRole('button', { name: 'In-motion', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Explanation sample number', exact: true }).fill('30');
  await page
    .getByRole('spinbutton', { name: 'Explanation sample number', exact: true })
    .press('Tab');
  report.force = await page.locator('app-solver-explanation').evaluate((host) => {
    const component = window.ng.getComponent(host);
    const data = component.view.force;
    const cached = component.solved.getForceAnalysis('dynamic').frames[component.step];
    return {
      step: component.step,
      status: data.frame.status,
      traceEffort: data.frame.inputEffort.valueSI,
      plottedEffort: cached.inputEffort.valueSI,
    };
  });
  assert.equal(report.force.step, 30);
  assert.equal(report.force.traceEffort, report.force.plottedEffort);
  await page.screenshot({ path: `${out}/force-in-motion.png` });
  for (let i = 0; i < report.bodies; i++) {
    await page.locator('.bodyCard').nth(i).screenshot({ path: `${out}/force-body-${i + 1}.png` });
  }
  await page.getByText('Force matrix and solution', { exact: false }).click();
  await page.locator('app-solver-matrix').screenshot({ path: `${out}/force-matrix.png` });

  await openMechanism(page, `${base}?${payload('4-Bar')}`);
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.locator('.loopCard').waitFor();
  await page.locator('.loopCard').screenshot({ path: `${out}/loop.png` });
  await page.getByRole('button', { name: 'Position steps', exact: true }).click();
  assert(
    (await page.locator('.circleCard').count()) > 0,
    'Four-bar should explain its circle intersection'
  );
  await page
    .locator('.circleCard')
    .first()
    .screenshot({ path: `${out}/circles.png` });
  const slider = page.getByRole('slider', { name: 'Explanation sample', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  // filmstrip clears its own directory; this resolved target is inside our artifact folder.
  const framesDir = path.resolve(out, 'scrub');
  assert(framesDir.startsWith(out + path.sep));
  const film = filmstrip(page, framesDir, { x: 0, y: 60, width: 410, height: 850 });
  await film.shot('before');
  await film.during(40, 8, 'scrub', async () => {
    await page.mouse.move(box.x + box.width * 0.12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 15 });
    await page.mouse.up();
  });
  await film.shot('settled');
  report.position = await page.locator('app-solver-explanation').evaluate((host) => {
    const component = window.ng.getComponent(host);
    return { step: component.step, residuals: component.view.circles.map((c) => c.residual) };
  });
  assert(report.position.step > 0);
  assert(report.position.residuals.every((r) => r < 1e-6));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Expand the panel', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.circleCard').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/mobile.png` });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Page overflow on phone'
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await openMechanism(page, `${base}?${galleryPayload('Two four-bars')}`);
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Position steps', exact: true }).click();
  await page.getByRole('combobox', { name: 'Explanation mechanism' }).selectOption('M2');
  const readMachine = () =>
    page.locator('app-solver-explanation').evaluate((host) => {
      const component = window.ng.getComponent(host);
      return {
        id: component.machineId,
        step: component.step,
        joints: component.view.circles.map((c) => c.jointId),
        residuals: component.view.circles.map((c) => c.residual),
      };
    });
  report.m2 = await readMachine();
  assert.equal(report.m2.id, 'M2');
  assert(report.m2.joints.includes('G'));
  await page.getByRole('spinbutton', { name: 'Explanation sample number', exact: true }).fill('45');
  await page
    .getByRole('spinbutton', { name: 'Explanation sample number', exact: true })
    .press('Tab');
  assert.equal((await readMachine()).step, 45);
  await page.getByRole('combobox', { name: 'Explanation mechanism' }).selectOption('M1');
  report.m1 = await readMachine();
  assert(report.m1.joints.includes('C'));
  assert(report.m1.residuals.every((r) => r < 1e-6));
  await openMechanism(page, `${base}?${galleryPayload('Cylinder-driven boom')}`);
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  assert(await page.getByRole('heading', { name: 'Differentiated constraints' }).isVisible());
  assert.equal(await page.locator('.loopCard').count(), 0);
  assert.deepEqual(errors, []);
  // Tile filmstrip in a separate disposable page, avoiding platform-specific image dependencies.
  const sheet = await context.newPage();
  const files = readdirSync(framesDir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  await sheet.setViewportSize({ width: 1035, height: 860 });
  await sheet.setContent(
    `<style>body{margin:5px;background:#e8e8ec;display:grid;grid-template-columns:repeat(5,200px);gap:6px}img{width:200px}</style>${files.map((f) => `<img src="data:image/png;base64,${readFileSync(path.join(framesDir, f)).toString('base64')}">`).join('')}`
  );
  await sheet.screenshot({ path: `${out}/scrub-sheet.png`, fullPage: true });
  console.log(JSON.stringify(report, null, 2));
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ ...report, errors }, null, 2));
  await browser.close();
}
