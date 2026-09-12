import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { filmstrip, contactSheet } from './filmstrip.mjs';

const directory = resolve('artifacts/gears');
const captures = resolve(directory, 'filmstrip');
assert(captures.startsWith(directory + sep), 'Filmstrip cleanup must stay in gear artifacts.');
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.PMKS_GEAR_URL ?? 'http://localhost:4329');
  await page.locator('#omega').filter({ hasText: '-30.0 RPM' }).waitFor();
  assert.equal(await page.locator('#drawing circle').count(), 8);
  const film = filmstrip(page, captures);
  await film.shot('start');
  await film.during(180, 8, 'playback', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  assert.notEqual(await page.locator('#travel').textContent(), '0.000 turns');
  await page.locator('#scrub').fill('360');
  await page.locator('#scrub').dispatchEvent('input');
  assert.equal(await page.locator('#travel').textContent(), '1.000 turns');
  assert.equal(await page.locator('#angle').textContent(), '-120.0°');
  await film.shot('scrubbed');
  await page.locator('#direction').selectOption('-1');
  assert.equal(await page.locator('#omega').textContent(), '30.0 RPM');
  await page.locator('#speed').fill('120');
  await page.locator('#speed').dispatchEvent('input');
  assert.equal(await page.locator('#omega').textContent(), '60.0 RPM');
  await page.locator('#fixture').selectOption('five');
  assert.equal(await page.locator('#time').textContent(), '0.000 / 2.50 s');
  await page.locator('#scrub').fill('1800');
  await page.locator('#scrub').dispatchEvent('input');
  assert.equal(await page.locator('#travel').textContent(), '-5.000 turns');
  await film.shot('five-turns');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#fixture').selectOption('fourbar');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await film.shot('phone');
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(directory, 'browser-check.json'),
    JSON.stringify(
      {
        status: 'PASS',
        errors,
        checks: [
          'playback filmstrip',
          'scrubbing',
          'reverse drive',
          'speed scaling',
          'five-turn cycle',
          'phone layout',
        ],
      },
      null,
      2
    )
  );
  await contactSheet(
    resolve(captures, '*playback*.png'),
    resolve(directory, 'playback-sheet.png'),
    4
  );
  console.log('PASS: gear fixture preview, controls and filmstrip');
} finally {
  await browser.close();
}
