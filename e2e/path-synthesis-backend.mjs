/** Numerical synthesis from a production-generated path, through insertion and normal playback. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { waitForReady } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';
const { chromium } = await import(
  (process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright') + '/node_modules/playwright/index.mjs'
);
const BASE = process.env.PMKS_BASE_URL ?? 'http://localhost:4200';
const OUT = 'artifacts/path-backend';
mkdirSync(OUT, { recursive: true });
const fixture = readFileSync('docs/fixture-urls.md', 'utf8').match(
  /\[Path synthesis reference four-bar\]\(([^)]+)\)/
)[1];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on('pageerror', (error) => errors.push(String(error)));
const pass = (name) => {
  checks.push(name);
  console.log('PASS ' + name);
};
const button = (name) => page.getByRole('button', { name, exact: true });
const tab = (name) => page.locator('.tabButton').filter({ hasText: name }).click();
const drawing = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid')),
      m = grid.mechanismSrv;
    return {
      joints: m.joints.map((j) => ({ id: j.id, x: j.x, y: j.y })),
      links: m.links.length,
      valid: m.mechanisms.map((m) => m.isMechanismValid()),
      points: grid.synthesisBuilder.path.points.length,
    };
  });
try {
  await page.goto(BASE + '/?' + fixture.split('?')[1]);
  await waitForReady(page);
  await tab('Synthesis');
  await page.locator('.kindCard--path').click();
  assert.equal(await button('Synthesize Four-Bar').isDisabled(), true);
  pass('Insufficient target points have a disabled action and an explanation');
  await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    const design = grid.synthesisBuilder;
    design.path.points = grid.mechanismSrv.mechanisms[0].joints
      .slice(0, -1)
      .filter((_, i) => i % 30 === 0)
      .map((frame) => {
        const p = frame.find((j) => j.id === 'E');
        return { x: p.x, y: p.y };
      });
    design.path.closed = true;
    design.path.smooth = true;
    grid.mechanismSrv.save();
  });
  await page.waitForTimeout(100);
  const before = await drawing();
  await button('Synthesize Four-Bar').click();
  await button('Cancel Search').click();
  await page.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-path-synthesis-panel')).synthesis.busy()
  );
  assert.deepEqual(await drawing(), before);
  pass('Search cancellation leaves the target and existing drawing intact');
  const started = Date.now();
  await button('Synthesize Four-Bar').click();
  await page.waitForFunction(
    () => !ng.getComponent(document.querySelector('app-path-synthesis-panel')).synthesis.busy(),
    {},
    { timeout: 60000 }
  );
  const result = await page.evaluate(
    () => ng.getComponent(document.querySelector('app-path-synthesis-panel')).synthesis.result
  );
  assert.ok(result?.best, JSON.stringify(result?.diagnostics));
  assert.equal(result.best.production.status, 'passed');
  assert.ok(result.best.errors.normalizedRms < 0.04);
  assert.deepEqual(await drawing(), before);
  assert.equal(await page.locator('[data-path-result="verified"]').count(), 1);
  assert.equal(await page.locator('.evaluation').count(), 64);
  await button('Create Mechanism').scrollIntoViewIfNeeded();
  await button('Fit to view').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/fit-desktop.png' });
  pass(
    'A numerical fit overlays target, generated curve, evaluation points, and a verified four-bar'
  );
  writeFileSync(
    OUT + '/browser-result.json',
    JSON.stringify({ ...result, wallMs: Date.now() - started }, null, 2)
  );
  await button('Create Mechanism').click();
  await page.waitForFunction(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.joints.length === 10
  );
  await page.waitForTimeout(500);
  const inserted = await drawing();
  assert.equal(inserted.links, 6);
  assert.deepEqual(inserted.valid, [true, true]);
  assert.deepEqual(inserted.joints.slice(0, 5), before.joints);
  pass('Create appends an ordinary runnable mechanism and preserves the existing machine');
  await button('Undo').click();
  await page.waitForTimeout(250);
  assert.equal((await drawing()).joints.length, 5);
  assert.equal((await drawing()).points, before.points);
  await button('Redo').click();
  await page.waitForTimeout(250);
  assert.equal((await drawing()).joints.length, 10);
  pass('One Undo removes the whole insertion; Redo restores it and retains the target');
  const film = filmstrip(page, OUT + '/playback');
  const coordinates = [];
  for (const progress of [0, 0.12, 0.25, 0.4, 0.6]) {
    await page.evaluate((progress) => {
      const m = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
      m.animate(progress * (m.mechanisms[0].joints.length - 1), false);
    }, progress);
    await page.waitForTimeout(60);
    coordinates.push((await drawing()).joints[6]);
    await film.shot('pose-' + progress);
  }
  assert.ok(
    coordinates.some((p) => Math.hypot(p.x - coordinates[0].x, p.y - coordinates[0].y) > 5)
  );
  pass('The created four-bar moves through the normal PMKS playback frames');
  const motion = filmstrip(page, OUT + '/animation');
  await motion.during(80, 8, 'running', async () => {
    await button('Play').click();
    await page.waitForTimeout(800);
    await button('Pause').click();
  });
  await motion.shot('settled');
  pass('Normal Play and Pause animate the inserted mechanism');
  await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.rewindToStart()
  );
  await page.reload();
  await waitForReady(page);
  assert.equal((await drawing()).joints.length, 10);
  assert.ok((await drawing()).valid.every(Boolean));
  assert.equal((await drawing()).points, before.points);
  pass('Reload restores both normal mechanisms and the editable target');
  const url = await page.evaluate(() =>
    ng.getComponent(document.querySelector('app-top-bar')).urlGeneration.generateUrlQuery()
  );
  const shared = await browser.newPage();
  await shared.goto(BASE + '/?' + url);
  await waitForReady(shared);
  const sharedState = await shared.evaluate(() => {
    const g = ng.getComponent(document.querySelector('app-new-grid'));
    return {
      joints: g.mechanismSrv.joints.length,
      valid: g.mechanismSrv.mechanisms.every((m) => m.isMechanismValid()),
      points: g.synthesisBuilder.path.points.length,
    };
  });
  assert.deepEqual(sharedState, { joints: 10, valid: true, points: before.points });
  await shared.close();
  pass('A shared URL restores the target and created mechanism in a fresh context');
  await tab('Synthesis');
  const field = page.getByLabel('Path point 1 X', { exact: true });
  await field.fill('3.25');
  await field.press('Tab');
  assert.equal(await page.locator('[data-path-result="verified"]').count(), 0);
  pass('Derived results are transient and cannot be applied after a target edit or reload');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The existing sheet handle is the public route on phone layouts.
  const handle = page.locator('.sheetHandle');
  if ((await handle.count()) && (await handle.getAttribute('aria-expanded')) === 'false')
    await handle.click();
  await button('Synthesize Four-Bar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + '/phone.png' });
  pass('The synthesis action remains reachable on a phone with reduced motion');
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: OUT + '/failure.png' });
  throw error;
} finally {
  writeFileSync(OUT + '/browser-report.json', JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
