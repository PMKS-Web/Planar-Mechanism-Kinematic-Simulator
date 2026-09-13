import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startQuiet } from './quiet-start.mjs';
import { TEMPLATE_LINKAGES } from './template-payloads.mjs';
import { openMechanism } from './app-ready.mjs';
import { filmstrip } from './filmstrip.mjs';

const base = process.env.PMKS_BASE_URL ?? 'http://localhost:4334';
const folder = 'artifacts/gears-compound/browser';
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
page.on('pageerror', (e) => errors.push(e.message));
const film = filmstrip(page, folder + '/filmstrip');
const state = () =>
  page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid')),
      s = grid.mechanismSrv;
    return {
      gears: s.gears,
      meshes: s.gearMeshes,
      links: s.links.map((l) => l.id),
      joints: s.joints.length,
      inputs: s.joints.filter((j) => j.input).length,
      selected: grid.activeObjService.selectedGearId,
      solved: s.mechanisms.map((m) => ({
        valid: m.isMechanismValid(),
        period: m.gearDrive?.periodTurns,
        bodies: m.gearDrive?.bodies.length,
        dof: m.dof,
        q: m.gearTravel.at(-1),
        end: m.gearDrive ? [...m.gearMotionAtSample(m.joints.length - 1).angles.entries()] : [],
        diagnostics: m.gearDiagnostics,
      })),
    };
  });
const fill = async (field, value) => {
  const input = page.locator('[data-field="' + field + '"]');
  await input.fill(String(value));
  await input.press('Tab');
};
const select = async (id) => {
  const gear = page.locator('[data-gear-id="' + id + '"]');
  await gear.focus();
  await gear.press('Enter');
};
const undo = async () => {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
};
const redo = async () => {
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
};
const menu = async () => {
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.waitForTimeout(300);
};
const point = (x, y) =>
  page.evaluate(
    ({ x, y }) => {
      const grid = ng.getComponent(document.querySelector('app-new-grid'));
      const p = grid.svgGrid.modelToScreen({ x, y });
      return { x: p.x, y: p.y };
    },
    { x, y }
  );
try {
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Simple_Gear_Pair);
  const original = await state(),
    aid = original.gears[0].id,
    bid = original.gears[1].id;
  await select(aid);
  await fill('gear-name', 'Gear A');
  await fill('gear-speed', 60);
  await select(bid);
  await fill('gear-name', 'Gear B');
  await page.getByRole('button', { name: 'Attach Another Gear', exact: true }).click();
  let s = await state();
  const cid = s.gears.at(-1).id;
  assert.equal(s.gears.length, 3);
  assert.equal(s.links.length, original.links.length);
  assert.equal(s.joints, original.joints);
  assert.equal(s.inputs, 1);
  assert.equal(s.gears.at(-1).hostLinkId, s.gears[1].hostLinkId);
  assert.equal(s.gears.at(-1).plane, 1);
  assert.equal(s.solved[0].dof, 1);
  await fill('gear-name', 'Gear C');
  await fill('gear-teeth', 10);
  await film.shot('attached-c-on-existing-shaft');
  // Create the third physical shaft through the native canvas menu.
  const location = await point(650, -250);
  await page.mouse.click(location.x, location.y, { button: 'right' });
  await page.locator('#contextMenu').getByText('Gear', { exact: true }).click();
  const did = (await state()).gears.at(-1).id;
  await page.getByRole('button', { name: 'Edit Center', exact: true }).click();
  for (const [axis, value] of [
    ['X', 2],
    ['Y', 0],
  ]) {
    const field = page.getByRole('textbox', { name: 'Joint Position ' + axis, exact: true });
    await field.fill(String(value));
    await field.press('Tab');
  }
  await select(did);
  await fill('gear-name', 'Gear D');
  await fill('gear-teeth', 30);
  await fill('gear-plane', 2);
  await page.getByRole('button', { name: 'Mesh With…', exact: true }).click();
  await page.getByRole('button', { name: /Gear C · 10T/ }).click();
  await page.getByRole('button', { name: 'Create Mesh', exact: true }).click();
  s = await state();
  assert.equal(s.gears.length, 4);
  assert.equal(s.links.length, 3);
  assert.equal(s.inputs, 1);
  assert.equal(s.meshes.length, 2);
  assert.equal(s.solved.length, 1);
  assert.equal(s.solved[0].valid, true);
  assert.equal(s.solved[0].bodies, 3);
  assert.equal(s.solved[0].period, 6);
  const angles = new Map(s.solved[0].end);
  assert.deepEqual(angles.get(bid), angles.get(cid));
  assert(Math.abs(angles.get(did).velocity / angles.get(aid).velocity - 1 / 6) < 1e-12);
  await film.shot('created-compound');
  await film.during(240, 8, 'compound-playback', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  const slider = page.locator('app-playback-bar input[type=range]').first();
  await slider.focus();
  await slider.press('End');
  await film.shot('six-turn-endpoint');
  assert(Math.abs((await state()).solved[0].q - 12 * Math.PI) < 1e-8);
  await page.getByRole('button', { name: 'Back to the start pose', exact: true }).first().click();
  await select(cid);
  await page.locator('[data-action="select-shaft-gear-' + bid + '"]').click();
  assert.equal((await state()).selected, bid);
  await page.locator('[data-action="select-shaft-gear-' + cid + '"]').click();
  assert.equal((await state()).selected, cid);
  assert.equal(await page.locator('[data-field="gear-speed"]').count(), 0);
  // Equal pitch radii remain individually reachable, without moving either center.
  await fill('gear-teeth', 40);
  const center = await page.evaluate((id) => {
    const s = ng.getComponent(document.querySelector('app-new-grid')).mechanismSrv;
    const gear = s.gears.find((g) => g.id === id),
      joint = s.joints.find((j) => j.id === gear.centerJointId);
    return { x: joint.x, y: joint.y + (gear.teeth * gear.module) / 2 };
  }, cid);
  const pitch = await point(center.x, center.y);
  await page.mouse.click(pitch.x, pitch.y);
  assert.equal((await state()).selected, bid);
  await film.shot('coincident-select-b');
  await page.mouse.click(pitch.x, pitch.y);
  assert.equal((await state()).selected, cid);
  await film.shot('coincident-select-c');
  await page.touchscreen.tap(pitch.x, pitch.y);
  assert.equal((await state()).selected, bid);
  await page.touchscreen.tap(pitch.x, pitch.y);
  assert.equal((await state()).selected, cid);
  await fill('gear-teeth', 10);
  assert.equal((await state()).solved[0].valid, true);
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const authored = (await state()).gears.sort(byId);
  await menu();
  const downloadPromise = page.waitForEvent('download');
  await page
    .locator('.menuItem')
    .filter({ hasText: /^saveSave$/ })
    .click();
  await (await downloadPromise).saveAs(folder + '/compound.pmks');
  assert(readFileSync(folder + '/compound.pmks', 'utf8').includes('G1~'));
  await menu();
  await page.locator('.menuItem').filter({ hasText: 'Share project' }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  await openMechanism(page, shared);
  assert.deepEqual((await state()).gears.sort(byId), authored);
  await page.reload();
  await page.waitForTimeout(1200);
  assert.deepEqual((await state()).gears.sort(byId), authored);
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES['4-Bar']);
  await menu();
  await page.locator('#projectMenu input[type=file]').setInputFiles(folder + '/compound.pmks');
  await page.waitForTimeout(1000);
  assert.deepEqual((await state()).gears.sort(byId), authored);
  for (const id of [bid, cid]) {
    await select(id);
    await page.keyboard.press('Delete');
    s = await state();
    assert.equal(s.gears.length, 3);
    assert.equal(s.meshes.length, 1);
    assert(s.gears.some((g) => g.id === (id === bid ? cid : bid)));
    await undo();
    assert.equal((await state()).gears.length, 4);
    await redo();
    assert.equal((await state()).gears.length, 3);
    await undo();
  }
  const hosts = await page.evaluate(() => {
    const grid = ng.getComponent(document.querySelector('app-new-grid'));
    return grid.mechanismSrv.links.map((link) => {
      const [a, b] = link.joints;
      const fraction = link.id === 'AB' ? 0.5 : 0.3;
      const p = grid.svgGrid.modelToScreen({
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
      });
      return { x: p.x, y: p.y };
    });
  });
  await page.keyboard.down('Control');
  for (const p of hosts) await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Control');
  await page.mouse.click(hosts[1].x, hosts[1].y, { button: 'right' });
  await page.locator('#contextMenu').getByText('Duplicate Selected (3)', { exact: true }).click();
  s = await state();
  assert.equal(s.gears.length, 8);
  assert.equal(s.meshes.length, 4);
  const copied = s.gears.filter((g) => !authored.some((a) => a.id === g.id));
  assert.equal(copied.length, 4);
  assert.equal(new Set(copied.map((g) => g.hostLinkId)).size, 3);
  for (const mesh of s.meshes.slice(2)) {
    assert(copied.some((g) => g.id === mesh.gearAId));
    assert(copied.some((g) => g.id === mesh.gearBId));
  }
  await film.shot('duplicated-compound');
  await undo();
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Compound_Gear_Train);
  assert.equal((await state()).solved[0].valid, true);
  await film.during(240, 8, 'compound-four-bar-playback', async () => {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  });
  await select('GD');
  await page.getByRole('button', { name: /Kinematic Analysis/ }).click();
  await page
    .locator('app-gear-analysis .graphHeader')
    .filter({ hasText: 'Angular velocity' })
    .click();
  await page.waitForTimeout(650);
  await page.screenshot({ path: folder + '/compound-analysis.png' });
  await page.getByRole('button', { name: 'How it works', exact: true }).click();
  await page.getByRole('button', { name: 'Open Full Worksheet', exact: true }).click();
  const worksheet = page.getByRole('dialog');
  await worksheet.waitFor();
  await page.waitForTimeout(350);
  const explanation = await worksheet.innerText();
  for (const name of ['Gear A', 'Gear B', 'Gear C', 'Gear D']) assert(explanation.includes(name));
  assert.equal(await worksheet.locator('.katex-error').count(), 0);
  await worksheet.screenshot({ path: folder + '/compound-worksheet.png' });
  await page.keyboard.press('Escape');
  await page.locator('.historyButton').filter({ hasText: 'Export data' }).click();
  const drawer = page.locator('app-export-panel');
  await page.waitForTimeout(350);
  for (let i = 0; i < 5 && !(await drawer.locator('.formatBlock').count()); i++)
    await drawer.locator('.nextButton').click();
  const grab = async (name) => {
    const ready = page.waitForEvent('download');
    await drawer.locator('.nextButton').click();
    await (await ready).saveAs(folder + '/' + name);
    return readFileSync(folder + '/' + name);
  };
  const csv = (await grab('compound-output.csv'))
    .toString()
    .trim()
    .split('\n')
    .map((line) => line.split(','));
  const travel = csv[0].findIndex((h) => h.includes('Angular Travel'));
  const velocity = csv[0].findIndex((h) => h.includes('Angular Velocity'));
  assert.equal(Math.abs(Number(csv.at(-1)[travel])), 360);
  assert.equal(Number(csv[1][velocity]), -30);
  await drawer.locator('.formatRow').filter({ hasText: 'Excel workbook' }).click();
  const xlsx = await grab('compound-output.xlsx');
  assert(xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')));
  await page.screenshot({ path: folder + '/compound-export.png' });
  await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Compound_Gear_Train);
  await select('GC');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Expand the panel', exact: true }).click();
  await page.waitForTimeout(350);
  await page.locator('[data-action="select-shaft-gear-GB"]').click();
  assert.equal((await state()).selected, 'GB');
  await film.shot('phone-shaft-selection');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  writeFileSync(
    folder + '/report.json',
    JSON.stringify(
      { status: 'PASS', errors, frames: film.frames, gears: authored, shared },
      null,
      2
    )
  );
  console.log(
    'PASS native compound creation, ownership, planes, selection, playback, save/share/file, history, duplication, four-bar and phone'
  );
  if (process.argv.includes('--open')) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openMechanism(page, base + '?' + TEMPLATE_LINKAGES.Compound_Gear_Train);
    await select('GC');
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
