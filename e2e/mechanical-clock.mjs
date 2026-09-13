import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4336';
const folder = 'artifacts/clock/browser';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: !process.argv.includes('--open'),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  hasTouch: true,
  permissions: ['clipboard-read', 'clipboard-write'],
});
await startQuiet(context);
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const film = filmstrip(page, folder + '/filmstrip');
const clockUrl = base + '?' + TEMPLATE_LINKAGES.Mechanical_Clock + '#backdrop=Mechanical_Clock';
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid')),
      s = grid.mechanismSrv,
      m = s.mechanisms[0];
    return {
      gears: s.gears,
      meshes: s.gearMeshes,
      links: s.links.map((l) => ({ id: l.id, name: l.name })),
      joints: s.joints.map((j) => ({ id: j.id, x: j.x, y: j.y, input: j.input })),
      selected: grid.activeObjService.selectedGearId,
      selectedLink: grid.activeObjService.selectedLink?.id,
      type: grid.activeObjService.objType,
      valid: m?.isMechanismValid(),
      samples: m?.joints.length,
      period: m?.gearDrive?.periodTurns,
      duration: m?.cyclePeriod,
      bodies: m?.gearDrive?.bodies.length,
      q: m?.gearTravel.at(-1),
      backdrop: grid.bgImage.image()?.src,
      backdropWidth: grid.bgImage.image()?.width,
    };
  });
const menu = async () => {
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.waitForTimeout(250);
};
const select = async (id) => {
  const item = page.locator('[data-gear-id="' + id + '"]');
  await item.focus();
  await item.press('Enter');
};
const fill = async (field, value) => {
  const input = page.locator('[data-field="' + field + '"]');
  await input.fill(String(value));
  await input.press('Tab');
};
const point = (x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const p = ng
        .getComponent(document.querySelector('app-new-grid'))
        .svgGrid.modelToScreen({ x, y });
      return { x: p.x, y: p.y };
    },
    { x, y }
  );
const grab = async (action, name) => {
  const ready = page.waitForEvent('download');
  await action();
  await (await ready).saveAs(folder + '/' + name);
  return readFileSync(folder + '/' + name);
};
try {
  await openMechanism(page, base);
  await page.waitForTimeout(1200);
  await menu();
  await page.locator('#templatesButton').click();
  await page.getByRole('textbox', { name: 'Search the library' }).fill('Mechanical Clock');
  await page
    .locator('[data-template="Mechanical_Clock"]')
    .screenshot({ path: folder + '/library-card.png' });
  await page.getByRole('button', { name: 'Open Mechanical Clock', exact: true }).click();
  await page.waitForFunction(
    () => ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv.gears.length === 4
  );
  await page.waitForFunction(
    () =>
      ng.getComponent(document.querySelector('app-new-grid')).bgImage.image()?.src ===
      'assets/backdrops/clock-face.svg'
  );
  await page.waitForTimeout(600);
  const initial = await state();
  assert.equal(initial.valid, true);
  assert.equal(initial.samples, 4321);
  assert.equal(initial.period, 12);
  assert.equal(initial.bodies, 3);
  assert(Math.abs(initial.duration - 12) < 1e-9);
  assert.equal(initial.joints.filter((j) => j.input).length, 1);
  assert(Math.abs(initial.q + 24 * Math.PI) < 1e-9);
  const a = initial.joints.find((j) => j.id === 'A'),
    e = initial.joints.find((j) => j.id === 'E');
  assert.deepEqual([a.x, a.y], [e.x, e.y]);
  const dialTop = await point(0, 1140),
    dialBottom = await point(0, -1140);
  assert(dialTop.y > 60 && dialBottom.y < 900, 'The library opens with the whole dial visible');
  await film.shot('clock-start');
  // Both ordinary hand bodies remain reachable at the aligned starting pose.
  for (const [y, id] of [
    [860, 'AB'],
    [540, 'EF'],
  ]) {
    const p = await point(0, y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    assert.equal((await state()).selectedLink, id);
    await film.shot('selected-hand-' + id);
  }
  for (const [x, id] of [
    [-120, 'GA'],
    [-450, 'GD'],
  ]) {
    const p = await point(x, 0);
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    assert.equal(
      (await state()).selected,
      id,
      'Concentric gear pitch circles have distinct hit targets'
    );
  }
  for (const id of ['GA', 'GB', 'GC', 'GD']) {
    await select(id);
    assert.equal((await state()).selected, id);
    await film.shot('selected-gear-' + id);
  }
  await page.getByRole('button', { name: 'Select Host Body', exact: true }).click();
  assert.equal((await state()).selectedLink, 'EF');
  await select('GA');
  assert.equal(await page.locator('[data-field="gear-speed"]').inputValue(), '-60');
  await film.during(350, 10, 'clock-motion', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(3650);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  const slider = page.locator('app-playback-bar input[type=range]').first();
  for (const [fraction, tag] of [
    [0.25, 'quarter-cycle'],
    [0.5, 'half-cycle'],
  ]) {
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
    await page.waitForTimeout(180);
    await film.shot(tag);
  }
  await slider.focus();
  await slider.press('End');
  await film.shot('full-twelve-turn-endpoint');
  const endpoint = await page.evaluate(() => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv,
      m = s.mechanisms[0];
    return {
      q: m.gearTravel[s.mechanismTimeStep],
      minute: m.gearMotionAtSample(s.mechanismTimeStep).angles.get('GA').angle,
      hour: m.gearMotionAtSample(s.mechanismTimeStep).angles.get('GD').angle,
    };
  });
  assert(Math.abs(endpoint.q + 24 * Math.PI) < 1e-9);
  assert(Math.abs(endpoint.hour - Math.PI / 2 + 2 * Math.PI) < 1e-9);
  await select('GA');
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page
    .locator('app-gear-analysis .graphHeader')
    .filter({ hasText: 'Angular velocity' })
    .click();
  await page.waitForTimeout(650);
  assert((await page.locator('app-gear-analysis').innerText()).includes('\u2212360.00'));
  await page.screenshot({ path: folder + '/minute-analysis.png' });
  await select('GB');
  await page.waitForTimeout(400);
  const intermediateValues = await page.locator('app-gear-analysis .graphHeader').allTextContents();
  assert((await page.locator('app-gear-analysis').innerText()).includes('90.00'));
  await page.screenshot({ path: folder + '/intermediate-b-analysis.png' });
  await select('GC');
  await page.waitForTimeout(400);
  assert.deepEqual(
    await page.locator('app-gear-analysis .graphHeader').allTextContents(),
    intermediateValues
  );
  await page.screenshot({ path: folder + '/intermediate-c-analysis.png' });
  await select('GD');
  await page.waitForTimeout(650);
  assert((await page.locator('app-gear-analysis').innerText()).includes('\u221230.00'));
  await page.screenshot({ path: folder + '/hour-analysis.png' });
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const worksheet = page.getByRole('dialog');
  await worksheet.waitFor();
  await page.waitForTimeout(400);
  const derivation = await worksheet.innerText();
  for (const expected of [
    '-12/48 = -1/4',
    '-15/45 = -1/3',
    'Same shaft CD',
    '(-1/4) × (-1/3) = +1/12',
  ])
    assert(derivation.includes(expected));
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  await worksheet.screenshot({ path: folder + '/clock-worksheet.png' });
  await page.keyboard.press('Escape');
  await page.locator('.historyButton').filter({ hasText: 'Export data' }).click();
  await page.waitForTimeout(300);
  const drawer = page.locator('app-export-panel');
  for (let i = 0; i < 5 && !(await drawer.locator('.formatBlock').count()); i++)
    await drawer.locator('.nextButton').click();
  const csvStart = performance.now();
  const csv = await grab(() => drawer.locator('.nextButton').click(), 'hour.csv');
  const csvMs = performance.now() - csvStart;
  const rows = csv
    .toString()
    .trim()
    .split('\n')
    .map((r) => r.split(','));
  const travel = rows[0].findIndex((h) => h.includes('Angular Travel'));
  const velocity = rows[0].findIndex((h) => h.includes('Angular Velocity'));
  assert.equal(rows.length, 4322);
  assert.equal(Number(rows.at(-1)[travel]), -360);
  assert.equal(Number(rows[1][velocity]), -30);
  await drawer.locator('.formatRow').filter({ hasText: 'Excel workbook' }).click();
  const xlsxStart = performance.now();
  const xlsx = await grab(() => drawer.locator('.nextButton').click(), 'hour.xlsx');
  const xlsxMs = performance.now() - xlsxStart;
  assert(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  await openMechanism(page, clockUrl);
  await menu();
  await grab(
    () =>
      page
        .locator('.menuItem')
        .filter({ hasText: /^saveSave$/ })
        .click(),
    'Mechanical Clock.pmks'
  );
  await menu();
  await page.locator('.menuItem').filter({ hasText: 'Share project' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  await openMechanism(page, shared);
  assert.deepEqual((await state()).gears, initial.gears);
  await page.reload();
  await page.waitForTimeout(1100);
  assert.equal((await state()).period, 12);
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES['4-Bar']);
  await menu();
  await page
    .locator('#projectMenu input[type=file]')
    .setInputFiles(folder + '/Mechanical Clock.pmks');
  await page.waitForTimeout(900);
  assert.deepEqual((await state()).gears, initial.gears);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert.equal((await state()).gears.length, 0);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  assert.equal((await state()).period, 12);
  await select('GA');
  await fill('gear-speed', -30);
  assert(Math.abs((await state()).duration - 24) < 1e-9);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  assert(Math.abs((await state()).duration - 12) < 1e-9);
  await openMechanism(page, clockUrl);
  await menu();
  await page.locator('.menuItem').filter({ hasText: 'Settings' }).click();
  for (const label of ['SI (m)', 'English (in)', 'Metric (cm)']) {
    await page
      .locator('#settingsWrapper #radio-block')
      .filter({ hasText: 'Global Units' })
      .getByRole('button', { name: label, exact: true })
      .click();
    await page.waitForTimeout(450);
    const s = await state();
    assert.equal(s.valid, true);
    assert.equal(s.samples, 4321);
    const minute = s.joints.find((j) => j.id === 'B');
    assert(Math.abs(s.backdropWidth / minute.y - 12 / 5) < 1e-9);
  }
  await openMechanism(page, clockUrl);
  await select('GB');
  await page.locator('[data-action="select-shaft-gear-GC"]').tap();
  assert.equal((await state()).selected, 'GC');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await film.shot('phone-clock');
  await page.getByRole('button', { name: 'Expand the panel', exact: true }).click();
  await page.waitForTimeout(350);
  await film.shot('phone-compound-selection');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  writeFileSync(
    folder + '/report.json',
    JSON.stringify(
      {
        status: 'PASS',
        samples: initial.samples,
        period: initial.period,
        endpoint,
        csvMs,
        xlsxMs,
        frames: film.frames,
        errors,
      },
      null,
      2
    )
  );
  console.log(
    'PASS Mechanical Clock: library, real hand/gear selection, motion, full cycle, worksheet, exports, file/share/history, units and phone'
  );
  if (process.argv.includes('--open')) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openMechanism(page, clockUrl);
    await select('GA');
  }
} catch (error) {
  await page.screenshot({ path: folder + '/failure.png' });
  writeFileSync(
    folder + '/failure.txt',
    String(error) +
      '\n' +
      JSON.stringify(await state(), null, 2) +
      '\n' +
      (await page.locator('body').innerText())
  );
  throw error;
} finally {
  if (!process.argv.includes('--open')) await browser.close();
}
