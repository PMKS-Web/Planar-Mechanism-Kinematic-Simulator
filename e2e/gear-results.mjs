import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4330',
  folder = 'artifacts/gears/results';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
await startQuiet(context);
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () =>
  page.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    return {
      gears: s.gears,
      meshes: s.gearMeshes,
      valid: s.mechanisms.map((m) => m.isMechanismValid()),
      q: s.mechanisms[0]?.gearTravel.at(-1),
    };
  });
const menu = async () => {
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.waitForTimeout(300);
};
const grab = async (action, name) => {
  const promise = page.waitForEvent('download');
  await action();
  const download = await promise;
  await download.saveAs(folder + '/' + name);
  return readFileSync(folder + '/' + name);
};
const selectOutput = async () => {
  const g = page.locator('[data-gear-id]').last();
  await g.focus();
  await g.press('Enter');
};
try {
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Simple_Gear_Pair);
  const original = await state();
  await menu();
  const saved = await grab(
    () =>
      page
        .locator('.menuItem')
        .filter({ hasText: /^saveSave$/ })
        .click(),
    'pair.pmks'
  );
  assert(saved.toString().includes('G1~'));
  await menu();
  await page.locator('.menuItem').filter({ hasText: 'Share project' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert(shared.includes('G1~'));
  await openMechanism(page, shared);
  assert.deepEqual(await state(), original);
  await page.reload();
  await page.waitForTimeout(1200);
  assert.deepEqual(await state(), original);
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES['4-Bar']);
  await menu();
  await page.locator('#projectMenu input[type=file]').setInputFiles(folder + '/pair.pmks');
  await page.waitForTimeout(1000);
  assert.deepEqual(await state(), original);
  await selectOutput();
  await page.keyboard.press('Delete');
  assert.equal((await state()).gears.length, 1);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  assert.equal((await state()).gears.length, 2);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(250);
  assert.equal((await state()).gears.length, 1);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  await selectOutput();
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page
    .locator('app-gear-analysis .graphHeader')
    .filter({ hasText: 'Angular velocity' })
    .click();
  await page.waitForTimeout(850);
  await page.screenshot({ path: folder + '/gear-analysis.png' });
  const rates = await page.locator('app-gear-analysis .graphHeader').allInnerTexts();
  assert(rates.join(' ').includes('deg/s'));
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert((await dialog.innerText()).includes('Analytically Prescribed Gear Motion'));
  await dialog.screenshot({ path: folder + '/gear-worksheet.png' });
  assert.equal(await dialog.locator('.katex-error').count(), 0);
  await page.keyboard.press('Escape');
  await page.locator('.historyButton').filter({ hasText: 'Export data' }).click();
  await page.waitForTimeout(350);
  const drawer = page.locator('app-export-panel');
  assert.equal(await drawer.locator('.partKind').filter({ hasText: 'Gears' }).count(), 1);
  for (let i = 0; i < 5 && !(await drawer.locator('.formatBlock').count()); i++)
    await drawer.locator('.nextButton').click();
  const csv = await grab(() => drawer.locator('.nextButton').click(), 'gear.csv');
  assert(csv.toString().includes('Angular Velocity'));
  const lines = csv
    .toString()
    .trim()
    .split('\n')
    .map((l) => l.split(','));
  const travel = lines[0].findIndex((h) => h.includes('Angular Travel'));
  const velocity = lines[0].findIndex((h) => h.includes('Angular Velocity'));
  assert.equal(Math.abs(Number(lines.at(-1)[travel])), 360);
  assert.equal(Number(lines[1][velocity]), 90);
  await drawer.locator('.formatRow').filter({ hasText: 'Excel workbook' }).click();
  const xlsx = await grab(() => drawer.locator('.nextButton').click(), 'gear.xlsx');
  assert(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  await page.screenshot({ path: folder + '/gear-export.png' });
  await page.evaluate(() => {
    new MutationObserver(() => {
      const frame = [...document.querySelectorAll('iframe')].find((f) =>
        f.contentDocument?.querySelector('[data-gear-id]')
      );
      if (frame) window.__gearReport = frame.contentDocument.documentElement.outerHTML;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await drawer.locator('.formatRow').filter({ hasText: 'Report (PDF)' }).click();
  await drawer.locator('.nextButton').click();
  await page.waitForFunction(() => window.__gearReport?.includes('data-gear-id'));
  const report = await page.evaluate(() => window.__gearReport);
  writeFileSync(folder + '/gear-report.html', report);
  const reportPage = await context.newPage();
  await reportPage.setContent(report);
  await reportPage.waitForTimeout(250);
  await reportPage.screenshot({ path: folder + '/gear-report.png' });
  await reportPage.close();

  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Idler_Gear_Train);
  assert.deepEqual((await state()).valid, [true]);
  await selectOutput();
  await page.screenshot({ path: folder + '/idler.png' });
  assert.deepEqual(errors, []);
  writeFileSync(
    folder + '/report.json',
    JSON.stringify({ status: 'PASS', rates, errors }, null, 2)
  );
  console.log(
    'PASS gear save/open/share/reload, delete history, analysis, worksheet, exports and idler'
  );
} catch (e) {
  await page.screenshot({ path: folder + '/failure.png' });
  writeFileSync(
    folder + '/failure.txt',
    String(e) + '\n' + errors.join('\n') + '\n' + (await page.locator('body').innerText())
  );
  throw e;
} finally {
  await browser.close();
}
