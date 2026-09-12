import { resolve, relative } from 'node:path';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4330';
const folder = 'artifacts/gears/production';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !process.argv.includes('--open'),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await startQuiet(context);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const look = () =>
  page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const s = grid.mechanismSrv;
    return {
      gears: s.gears,
      meshes: s.gearMeshes,
      joints: s.joints.map((j) => ({ id: j.id, x: j.x, y: j.y, input: j.input })),
      solved: s.mechanisms.map((m) => ({
        valid: m.isMechanismValid(),
        dof: m.dof,
        period: m.gearDrive?.periodTurns,
        ratios: m.gearDrive?.bodies.map((b) => b.multiplier),
        diagnostics: m.gearDiagnostics,
      })),
      type: grid.activeObjService?.objType,
    };
  });
const fill = async (field, value) => {
  await page.locator(`[data-field="${field}"]`).fill(String(value));
  await page.locator(`[data-field="${field}"]`).press('Tab');
};
const placeCenter = async (x, y) => {
  await page.getByRole('button', { name: 'Edit Center', exact: true }).click();
  for (const [axis, value] of [
    ['X', x],
    ['Y', y],
  ]) {
    const field = page.getByRole('textbox', { name: 'Joint Position ' + axis, exact: true });
    await field.fill(String(value));
    await field.press('Tab');
  }
  await page.locator('[data-gear-id]').last().focus();
  await page.locator('[data-gear-id]').last().press('Enter');
};
const filmPath = resolve(folder, 'filmstrip');
assert(!relative(resolve('artifacts/gears'), filmPath).startsWith('..'));
const film = filmstrip(page, filmPath);
try {
  await page.goto(base);
  await page.locator('app-new-grid').waitFor({ state: 'attached' });
  await page.waitForTimeout(1400);
  await page.mouse.move(650, 420);
  await page.mouse.click(650, 420, { button: 'right' });
  await page.locator('#contextMenu').getByText('Gear', { exact: true }).click();
  await page.locator('[data-field="gear-teeth"]').waitFor();
  assert.equal((await look()).gears.length, 1);
  await fill('gear-speed', 60);
  await placeCenter(-3, 0);
  const next = await page.evaluate(() => {
    const grid = window.ng.getComponent(document.querySelector('app-new-grid'));
    const a = grid.mechanismSrv.joints[0];
    const p = grid.svgGrid.modelToScreen({ x: a.x + 600, y: a.y });
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(next.x, next.y);
  await page.mouse.click(next.x, next.y, { button: 'right' });
  await page.locator('#contextMenu').getByText('Gear', { exact: true }).click();
  await placeCenter(0, 0);
  await fill('gear-teeth', 40);
  await page.getByRole('button', { name: 'Mesh With…', exact: true }).click();
  await page.getByRole('button', { name: 'Gear 1 · 20T', exact: true }).click();
  await page.getByRole('button', { name: 'Create Mesh', exact: true }).click();
  let state = await look();
  assert.equal(state.gears.length, 2);
  assert.equal(state.meshes.length, 1);
  assert.equal(state.solved.length, 1);
  assert.equal(state.solved[0].valid, true);
  assert.deepEqual(state.solved[0].ratios, [1, -0.5]);
  await film.shot('created-pair-properties');
  await film.during(240, 8, 'pair-playback', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  await page.getByRole('button', { name: 'Back to the start pose', exact: true }).first().click();
  const root = page.locator('[data-gear-id]').first();
  await root.focus();
  await root.press('Enter');
  await fill('gear-speed', -60);
  const reverse = await page.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const m = s.mechanisms[0];
    return {
      q: m.gearTravel.at(-1),
      rates: [...m.gearMotionAtSample(0).angles.values()].map((g) => g.velocity),
    };
  });
  assert(Math.abs(reverse.q + 4 * Math.PI) < 1e-8);
  assert(reverse.rates[0] < 0 && reverse.rates[1] > 0);
  const slider = page.locator('app-playback-bar input[type=range]').first();
  await slider.focus();
  await slider.press('End');
  await film.shot('reverse-two-turn-end');
  await page.getByRole('button', { name: 'Back to the start pose', exact: true }).first().click();
  await fill('gear-speed', 60);
  const output = page.locator('[data-gear-id]').last();
  await output.focus();
  await output.press('Enter');
  await fill('gear-teeth', 60);
  assert.equal((await look()).solved[0].valid, false);
  await film.shot('invalid-spacing');
  await fill('gear-teeth', 40);
  assert.equal((await look()).solved[0].valid, true);
  await page.locator('[data-mesh-id]').click();
  await page.getByRole('button', { name: 'Remove Mesh', exact: true }).waitFor();
  await film.shot('mesh-properties');
  await page.getByRole('button', { name: 'Remove Mesh', exact: true }).click();
  assert.equal((await look()).meshes.length, 0);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.equal((await look()).meshes.length, 1);
  const hosts = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv.links.map((link) => {
      const a = link.joints[0],
        b = link.joints[1];
      const p = grid.svgGrid.modelToScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return { x: p.x, y: p.y };
    });
  });
  await page.keyboard.down('Control');
  for (const p of hosts) {
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.up('Control');
  await page.mouse.click(hosts[1].x, hosts[1].y, { button: 'right' });
  await page.locator('#contextMenu').getByText('Duplicate Selected (2)', { exact: true }).click();
  const copied = await look();
  assert.equal(copied.gears.length, 4);
  assert.equal(copied.meshes.length, 2);
  const copyIds = new Set(copied.gears.slice(2).map((g) => g.id));
  assert(copyIds.has(copied.meshes[1].gearAId) && copyIds.has(copied.meshes[1].gearBId));
  await film.shot('duplicated-pair');
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Gear_Driven_Four_Bar);
  assert.equal((await look()).solved[0].valid, true);
  await film.shot('four-bar');
  await film.during(240, 8, 'four-bar-playback', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  await page.locator('[data-gear-id]').last().focus();
  await page.locator('[data-gear-id]').last().press('Enter');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await film.shot('phone');
  await page.getByRole('button', { name: 'Expand the panel', exact: true }).click();
  await page.waitForTimeout(350);
  await film.shot('phone-properties');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  if (process.argv.includes('--open')) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Simple_Gear_Pair);
  }
  writeFileSync(
    folder + '/browser-check.json',
    JSON.stringify({ status: 'PASS', errors }, null, 2)
  );
  console.log(
    'PASS production gear creation, meshing, editing, playback, history, four-bar and phone layout'
  );
} catch (error) {
  await page.screenshot({ path: folder + '/failure.png' });
  writeFileSync(
    folder + '/failure.txt',
    String(error) +
      '\n' +
      JSON.stringify(errors) +
      '\n' +
      (await page.locator('body').innerText()) +
      '\n' +
      (await page.locator('#gearHolder').evaluate((e) => e.outerHTML))
  );
  throw error;
} finally {
  if (!process.argv.includes('--open')) await browser.close();
}
